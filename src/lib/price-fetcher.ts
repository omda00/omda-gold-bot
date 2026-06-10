import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

export interface PriceFetchResult {
  price: number;
  source: string;
  buyPrice?: number;
  sellPrice?: number;
}

export interface CombinedPriceResult {
  gold: PriceFetchResult | null;
  usdEgp: PriceFetchResult | null;
}

/**
 * PRIMARY SOURCE: Extract gold prices from iSagha (market.isagha.com) HTML content.
 *
 * iSagha is the authoritative source for Egyptian gold prices.
 * It provides real-time, second-by-second updates from Egyptian gold markets.
 *
 * Page structure (as rendered HTML text):
 *   "عيار 21 6100 ج.م 203.25 ج.م 6025 ج.م 141.25 ج.م ‎-15 ج.م ‎-0.25%"
 *   Pattern: عيار 21 [sell_price] ج.م [sell_workmanship] ج.م [buy_price] ج.م [buy_workmanship] ج.م [change] ج.م [change%]
 *
 * Also extracts USD/EGP if available on the page.
 */
function extractFromIsaghaHtml(html: string): {
  gold21Sell: number | null;
  gold21Buy: number | null;
  gold24Sell: number | null;
  gold24Buy: number | null;
  gold18Sell: number | null;
  gold18Buy: number | null;
  usdEgpRate: number | null;
} {
  const result = {
    gold21Sell: null as number | null,
    gold21Buy: null as number | null,
    gold24Sell: null as number | null,
    gold24Buy: null as number | null,
    gold18Sell: null as number | null,
    gold18Buy: null as number | null,
    usdEgpRate: null as number | null,
  };

  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  // === Extract Gold prices by karat ===
  // iSagha format per row: "عيار 21 6100 ج.م 203.25 ج.م 6025 ج.م 141.25 ج.م -15 ج.م -0.25%"
  // Each karat section: [sell_price] ج.م [sell_workmanship] ج.م [buy_price] ج.م [buy_workmanship] ج.م [change] ج.م [change%]
  // We must limit the chunk to only the current karat's data (before the next karat starts)

  const karatSections = [
    { name: "21", sellField: "gold21Sell" as const, buyField: "gold21Buy" as const, minPrice: 5500, maxPrice: 8000 },
    { name: "24", sellField: "gold24Sell" as const, buyField: "gold24Buy" as const, minPrice: 6500, maxPrice: 10000 },
    { name: "18", sellField: "gold18Sell" as const, buyField: "gold18Buy" as const, minPrice: 4500, maxPrice: 7000 },
  ];

  for (const section of karatSections) {
    const marker = `عيار ${section.name}`;
    const idx = text.indexOf(marker);
    if (idx < 0) continue;

    // Find the next karat marker after this one to limit the chunk
    let endIdx = idx + 300; // default limit
    for (const otherSection of karatSections) {
      if (otherSection.name === section.name) continue;
      const otherMarker = `عيار ${otherSection.name}`;
      const otherIdx = text.indexOf(otherMarker, idx + marker.length);
      if (otherIdx > idx && otherIdx < endIdx) {
        endIdx = otherIdx;
      }
    }
    // Also check for "جنيه ذهب" or "أوقية" markers that come after
    const coinIdx = text.indexOf("جنيه ذهب", idx + marker.length);
    if (coinIdx > idx && coinIdx < endIdx) {
      endIdx = coinIdx;
    }

    const chunk = text.substring(idx, endIdx);
    const numbers = chunk.match(/\d[\d,]*\.?\d*/g) || [];
    const parsedNumbers = numbers
      .map((n) => parseFloat(n.replace(/,/g, "")))
      .filter((n) => !isNaN(n));

    // First number in range = sell price, second = buy price
    const goldPrices = parsedNumbers.filter((v) => v >= section.minPrice && v <= section.maxPrice);
    if (goldPrices.length >= 2) {
      result[section.sellField] = goldPrices[0];
      result[section.buyField] = goldPrices[1];
    } else if (goldPrices.length === 1) {
      result[section.sellField] = goldPrices[0];
    }
  }

  // === Extract USD/EGP rate from iSagha (if available) ===
  // iSagha may show "دولار أمريكي" or "USD" with exchange rate
  const usdPatterns = [
    /(?:دولار أمريكي|الدولار الأمريكي|USD)[^0-9]*?([0-9]+\.[0-9]+)/i,
    /(?:USD|دولار)[^0-9]*?([5][0-9]\.[0-9]+)/i,
  ];

  for (const pattern of usdPatterns) {
    const usdMatch = text.match(pattern);
    if (usdMatch) {
      const rate = parseFloat(usdMatch[1]);
      if (rate > 40 && rate < 80) {
        result.usdEgpRate = rate;
        break;
      }
    }
  }

  return result;
}

/**
 * Fetch USD/EGP rate from Google Finance via web_search.
 * Google Finance search snippets include the rate directly.
 */
async function fetchUsdEgpFromGoogleFinance(zai: ZAI.ZAI): Promise<PriceFetchResult | null> {
  try {
    console.log("[price-fetcher] Fetching USD/EGP from Google Finance...");

    const searchResults = await zai.functions.invoke("web_search", {
      query: "site:google.com finance USD EGP exchange rate",
      num: 3,
    });

    const searchText =
      typeof searchResults === "string" ? searchResults : JSON.stringify(searchResults);

    // Google Finance snippet: "United States Dollar / Egyptian Pound. 51.8189. +0.19%"
    const rateMatch = searchText.match(
      /United States Dollar\s*\/\s*Egyptian Pound[^0-9]*?([0-9]+\.[0-9]+)/
    );

    if (rateMatch) {
      const rate = parseFloat(rateMatch[1]);
      if (rate > 40 && rate < 80) {
        console.log(`[price-fetcher] Got USD/EGP from Google Finance: ${rate}`);
        return { price: rate, source: "Google Finance" };
      }
    }

    // Fallback: try the beta URL snippet
    const betaMatch = searchText.match(
      /google\.com\/finance\/beta\/quote\/USD-EGP[^0-9]*?([0-9]+\.[0-9]+)/
    );
    if (betaMatch) {
      const rate = parseFloat(betaMatch[1]);
      if (rate > 40 && rate < 80) {
        return { price: rate, source: "Google Finance" };
      }
    }

    // Fallback: try page_reader on the Google Finance page
    const gfResult = await zai.functions.invoke("page_reader", {
      url: "https://www.google.com/finance/quote/USD-EGP",
    });

    const gfHtml = gfResult?.data?.html || "";
    const gfRateMatch = gfHtml.match(/data-last-price="([0-9.]+)"/);
    if (gfRateMatch) {
      const rate = parseFloat(gfRateMatch[1]);
      if (rate > 0 && rate < 200) {
        return { price: rate, source: "Google Finance" };
      }
    }
  } catch (error) {
    console.error("[price-fetcher] Google Finance fetch failed:", error);
  }

  return null;
}

/**
 * Fetch BOTH gold price and USD/EGP rate.
 *
 * Gold source: iSagha.com (market.isagha.com/prices) — PRIMARY AND AUTHORITATIVE
 * USD/EGP source: Google Finance — PRIMARY (user requested)
 *
 * Fallback strategy (only if iSagha is temporarily down):
 * 1. iSagha web_search (lighter weight than page_reader)
 * 2. banklive.net page_reader
 * 3. Broader web search + LLM extraction
 */
export async function fetchAllPrices(): Promise<CombinedPriceResult> {
  const zai = await ZAI.create();
  const combinedResult: CombinedPriceResult = {
    gold: null,
    usdEgp: null,
  };

  // ==========================================
  // PRIMARY: iSagha.com for Gold Prices
  // ==========================================
  try {
    console.log("[price-fetcher] 🥇 Fetching gold prices from iSagha.com (market.isagha.com/prices)...");

    const isaghaResult = await zai.functions.invoke("page_reader", {
      url: "https://market.isagha.com/prices",
    });

    const isaghaHtml = isaghaResult?.data?.html || "";
    if (isaghaHtml) {
      const isaghaPrices = extractFromIsaghaHtml(isaghaHtml);

      if (isaghaPrices.gold21Sell && isaghaPrices.gold21Sell > 0) {
        combinedResult.gold = {
          price: isaghaPrices.gold21Sell,
          source: "iSagha.com",
          buyPrice: isaghaPrices.gold21Buy || undefined,
          sellPrice: isaghaPrices.gold21Sell,
        };
        console.log(
          `[price-fetcher] ✅ Got gold from iSagha: sell=${isaghaPrices.gold21Sell}, buy=${isaghaPrices.gold21Buy}`
        );
      }

      // Also try to get USD/EGP from iSagha
      if (isaghaPrices.usdEgpRate && isaghaPrices.usdEgpRate > 0) {
        combinedResult.usdEgp = {
          price: isaghaPrices.usdEgpRate,
          source: "iSagha.com",
        };
        console.log(`[price-fetcher] Got USD/EGP from iSagha: ${isaghaPrices.usdEgpRate}`);
      }
    }
  } catch (pageError) {
    console.error("[price-fetcher] ❌ iSagha page_reader failed:", pageError);
  }

  // ==========================================
  // PRIMARY: Google Finance for USD/EGP
  // ==========================================
  if (!combinedResult.usdEgp) {
    try {
      const gfResult = await fetchUsdEgpFromGoogleFinance(zai);
      if (gfResult) {
        combinedResult.usdEgp = gfResult;
      }
    } catch (error) {
      console.error("[price-fetcher] Google Finance fetch failed:", error);
    }
  }

  // If we have both from primary sources, return immediately
  if (combinedResult.gold && combinedResult.usdEgp) {
    console.log("[price-fetcher] ✅ Got both prices from primary sources (iSagha + Google Finance)");
    return combinedResult;
  }

  // ==========================================
  // FALLBACK 1: iSagha via web_search (if page_reader failed)
  // ==========================================
  if (!combinedResult.gold) {
    try {
      console.log("[price-fetcher] Fallback: Searching iSagha.com via web_search...");

      const searchResults = await zai.functions.invoke("web_search", {
        query: "site:market.isagha.com سعر الذهب عيار 21 في مصر اليوم",
        num: 3,
      });

      const searchText =
        typeof searchResults === "string" ? searchResults : JSON.stringify(searchResults);

      // Try to extract from search snippets
      const snippetMatch = searchText.match(/عيار 21\s*([0-9,]+)\s*ج\.?م/);
      if (snippetMatch) {
        const sell = parseFloat(snippetMatch[1].replace(/,/g, ""));
        if (sell >= 5000 && sell <= 10000) {
          combinedResult.gold = {
            price: sell,
            source: "iSagha.com",
            sellPrice: sell,
          };
          console.log(`[price-fetcher] Got gold from iSagha search: ${sell}`);
        }
      }
    } catch (searchError) {
      console.error("[price-fetcher] iSagha web_search failed:", searchError);
    }
  }

  if (combinedResult.gold && combinedResult.usdEgp) {
    return combinedResult;
  }

  // ==========================================
  // FALLBACK 2: banklive.net (for both gold and USD/EGP)
  // ==========================================
  if (!combinedResult.gold || !combinedResult.usdEgp) {
    try {
      console.log("[price-fetcher] Fallback: banklive.net...");

      const bankliveResult = await zai.functions.invoke("page_reader", {
        url: "https://banklive.net/ar/gold-price-today-in-egypt",
      });

      const html = bankliveResult?.data?.html || "";
      if (html) {
        const banklivePrices = extractFromBankliveHtml(html);

        if (!combinedResult.gold && banklivePrices.gold21Sell && banklivePrices.gold21Sell > 0) {
          combinedResult.gold = {
            price: banklivePrices.gold21Sell,
            source: "banklive.net",
            buyPrice: banklivePrices.gold21Buy || undefined,
            sellPrice: banklivePrices.gold21Sell,
          };
        }

        if (!combinedResult.usdEgp && banklivePrices.usdEgpSell && banklivePrices.usdEgpSell > 0) {
          combinedResult.usdEgp = {
            price: banklivePrices.usdEgpSell,
            source: "banklive.net",
          };
        }
      }
    } catch (pageError) {
      console.error("[price-fetcher] banklive.net failed:", pageError);
    }
  }

  if (combinedResult.gold && combinedResult.usdEgp) {
    return combinedResult;
  }

  // ==========================================
  // FALLBACK 3: Broader web search + LLM extraction
  // ==========================================
  if (!combinedResult.gold || !combinedResult.usdEgp) {
    try {
      console.log("[price-fetcher] Final fallback: web search + LLM...");
      const searchResults = await zai.functions.invoke("web_search", {
        query: "سعر الذهب عيار 21 في مصر اليوم من iSagha جنيه مصري وسعر الدولار",
        num: 5,
      });

      const searchText =
        typeof searchResults === "string"
          ? searchResults
          : JSON.stringify(searchResults);

      const truncatedSearch = searchText.substring(0, 3000);

      const completion = await zai.chat.completions.create({
        model: "glm-4",
        messages: [
          {
            role: "system",
            content:
              "Extract from search results: 1) Gold 21K sell price per gram in EGP (5000-8000 range), 2) Gold 21K buy price in EGP, 3) USD/EGP exchange rate (45-60 range). Return ONLY JSON: {\"gold21Sell\": number, \"gold21Buy\": number|null, \"usdEgpRate\": number, \"source\": \"string\"}. If not found, use null.",
          },
          {
            role: "user",
            content: `Search results:\n${truncatedSearch}`,
          },
        ],
      });

      const content = completion.choices?.[0]?.message?.content || "";
      const parsed = extractJsonFromText(content);
      if (parsed) {
        if (
          !combinedResult.gold &&
          typeof parsed.gold21Sell === "number" &&
          parsed.gold21Sell > 0
        ) {
          combinedResult.gold = {
            price: parsed.gold21Sell,
            source: parsed.source || "web_search+LLM",
            buyPrice:
              typeof parsed.gold21Buy === "number"
                ? parsed.gold21Buy
                : undefined,
            sellPrice: parsed.gold21Sell,
          };
        }
        if (
          !combinedResult.usdEgp &&
          typeof parsed.usdEgpRate === "number" &&
          parsed.usdEgpRate > 0
        ) {
          combinedResult.usdEgp = {
            price: parsed.usdEgpRate,
            source: parsed.source || "web_search+LLM",
          };
        }
      }
    } catch (llmError) {
      console.error("[price-fetcher] LLM extraction failed:", llmError);
    }
  }

  return combinedResult;
}

/**
 * Extract prices from banklive.net HTML content.
 * Used as a fallback when iSagha is unavailable.
 */
function extractFromBankliveHtml(html: string): {
  gold21Sell: number | null;
  gold21Buy: number | null;
  usdEgpSell: number | null;
  usdEgpBuy: number | null;
} {
  const result = {
    gold21Sell: null as number | null,
    gold21Buy: null as number | null,
    usdEgpSell: null as number | null,
    usdEgpBuy: null as number | null,
  };

  const tableBody = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tableBody) return result;

  const rows = tableBody[1].match(/<tr>([\s\S]*?)<\/tr>/g) || [];

  for (const row of rows) {
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
    const cleanCells = cells.map((c: string) =>
      c.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    );

    const rowText = cleanCells.join(" ");

    if (rowText.includes("عيار 21") || rowText.includes("21 karat")) {
      const numbers = rowText.match(/\d[\d,]*\.?\d*/g) || [];
      for (const num of numbers) {
        const val = parseFloat(num.replace(/,/g, ""));
        if (val >= 5000 && val <= 15000) {
          if (!result.gold21Sell) {
            result.gold21Sell = val;
          } else if (!result.gold21Buy) {
            result.gold21Buy = val;
          }
        }
      }
    }

    if (
      (rowText.includes("USD/EGP") || rowText.includes("الدولار الأمريكي")) &&
      !rowText.includes("الكندي")
    ) {
      const numbers = rowText.match(/\d[\d,]*\.?\d*/g) || [];
      for (const num of numbers) {
        const val = parseFloat(num.replace(/,/g, ""));
        if (val >= 40 && val <= 80) {
          if (!result.usdEgpSell) {
            result.usdEgpSell = val;
          } else if (!result.usdEgpBuy) {
            result.usdEgpBuy = val;
          }
        }
      }
    }
  }

  return result;
}

/**
 * Fetch the current USD/EGP exchange rate.
 */
export async function fetchUsdEgpRate(): Promise<PriceFetchResult> {
  const allPrices = await fetchAllPrices();
  if (allPrices.usdEgp) return allPrices.usdEgp;
  throw new Error("Could not extract USD/EGP rate from any source");
}

/**
 * Fetch the current gold price per gram (21 karat) in EGP.
 */
export async function fetchGoldEgpPrice(): Promise<PriceFetchResult> {
  const allPrices = await fetchAllPrices();
  if (allPrices.gold) return allPrices.gold;
  throw new Error("Could not extract gold price in EGP from iSagha.com");
}

/**
 * Save a price record to the database and calculate change from previous
 */
export async function savePriceRecord(
  symbol: string,
  price: number,
  currency: string,
  source: string,
  extras?: { buyPrice?: number; sellPrice?: number }
) {
  const previous = await db.priceRecord.findFirst({
    where: { symbol },
    orderBy: { createdAt: "desc" },
  });

  const change = previous
    ? ((price - previous.price) / previous.price) * 100
    : 0;

  return db.priceRecord.create({
    data: {
      symbol,
      price,
      currency,
      change: Math.round(change * 100) / 100,
      source,
      buyPrice: extras?.buyPrice ?? null,
      sellPrice: extras?.sellPrice ?? null,
    },
  });
}

/**
 * Try to extract JSON from text that might contain markdown code blocks
 */
function extractJsonFromText(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    // Continue
  }

  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch {
      // Continue
    }
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // Give up
    }
  }

  return null;
}
