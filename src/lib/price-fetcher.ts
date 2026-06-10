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
 * Extract gold prices from iSagha HTML content.
 * iSagha format: "عيار 21 6100 ج.م 203.25 ج.م 6025 ج.م 141.25 ج.م -15 ج.م -0.25%"
 * Pattern: عيار 21 [sell] ج.م [sell_workmanship] ج.م [buy] ج.م [buy_workmanship] ج.م [change] ج.م [change%]
 */
function extractFromIsaghaHtml(html: string): {
  gold21Sell: number | null;
  gold21Buy: number | null;
} {
  const result = {
    gold21Sell: null as number | null,
    gold21Buy: null as number | null,
  };

  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const idx21 = text.indexOf("عيار 21");

  if (idx21 < 0) return result;

  // Get the chunk of text after "عيار 21"
  const chunk = text.substring(idx21, idx21 + 300);

  // Extract all numbers from this chunk
  const numbers = chunk.match(/\d[\d,]*\.?\d*/g) || [];
  const parsedNumbers = numbers
    .map((n) => parseFloat(n.replace(/,/g, "")))
    .filter((n) => !isNaN(n));

  // iSagha format: first big number (5000-8000) is sell, second is workmanship,
  // third is buy price, fourth is buy workmanship
  for (const val of parsedNumbers) {
    if (val >= 5000 && val <= 10000) {
      if (!result.gold21Sell) {
        result.gold21Sell = val;
      } else if (!result.gold21Buy) {
        result.gold21Buy = val;
      }
    }
  }

  return result;
}

/**
 * Extract prices from banklive.net HTML content.
 * banklive.net has structured tables with gold prices (sell/buy) and USD/EGP rates.
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
    usdEgpBuy: number as number | null,
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
      for (let i = 0; i < numbers.length; i++) {
        const val = parseFloat(numbers[i].replace(/,/g, ""));
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
 * Extract gold and USD/EGP prices from text content (search snippets, etc.).
 */
function extractPricesFromText(text: string): {
  gold21Sell: number | null;
  gold21Buy: number | null;
  usdEgpRate: number | null;
} {
  const result = {
    gold21Sell: null as number | null,
    gold21Buy: null as number | null,
    usdEgpRate: null as number | null,
  };

  // Strategy 1: JSON-LD PropertyValue format (edahabapp)
  const propertyValuePattern =
    /"name"\s*:\s*"([^"]+)"\s*,\s*"value"\s*:\s*"([0-9,.]+)\s*جنيه"/g;
  let match;
  while ((match = propertyValuePattern.exec(text)) !== null) {
    const name = match[1];
    const value = parseFloat(match[2].replace(/,/g, ""));
    if (name.includes("عيار 21") && name.includes("بيع") && value >= 3000 && value <= 15000) {
      result.gold21Sell = value;
    } else if (name.includes("عيار 21") && name.includes("شراء") && value >= 3000 && value <= 15000) {
      result.gold21Buy = value;
    } else if (name.includes("الدولار") && value > 0 && value < 200) {
      result.usdEgpRate = value;
    }
  }

  // Strategy 2: "عيار 21 بيع 6130 جنيه شراء 6100 جنيه"
  if (!result.gold21Sell || !result.gold21Buy) {
    const snippetMatch = text.match(/عيار 21\s*بيع\s*([0-9,]+)\s*جنيه\s*شراء\s*([0-9,]+)/);
    if (snippetMatch) {
      const sell = parseFloat(snippetMatch[1].replace(/,/g, ""));
      const buy = parseFloat(snippetMatch[2].replace(/,/g, ""));
      if (!result.gold21Sell && sell >= 3000 && sell <= 15000) result.gold21Sell = sell;
      if (!result.gold21Buy && buy >= 3000 && buy <= 15000) result.gold21Buy = buy;
    }
  }

  // Strategy 3: "الذهب عيار 21...بيع...شراء..."
  if (!result.gold21Sell || !result.gold21Buy) {
    const generalMatch = text.match(/الذهب عيار 21[^0-9]*?بيع[^0-9]*?([0-9,]+)[^0-9]*?شراء[^0-9]*?([0-9,]+)/);
    if (generalMatch) {
      const sell = parseFloat(generalMatch[1].replace(/,/g, ""));
      const buy = parseFloat(generalMatch[2].replace(/,/g, ""));
      if (!result.gold21Sell && sell >= 3000 && sell <= 15000) result.gold21Sell = sell;
      if (!result.gold21Buy && buy >= 3000 && buy <= 15000) result.gold21Buy = buy;
    }
  }

  // Strategy 4: "عيار 21, 6,110" or "6110 ج.م"
  if (!result.gold21Sell) {
    const bankliveMatch = text.match(/عيار 21[,\s]+([0-9,]+(?:\.[0-9]+)?)/);
    if (bankliveMatch) {
      const val = parseFloat(bankliveMatch[1].replace(/,/g, ""));
      if (val >= 3000 && val <= 15000) result.gold21Sell = val;
    }
  }

  // USD/EGP extraction
  if (!result.usdEgpRate) {
    const usdMatch = text.match(/الدولار[^0-9]*?([0-9]+\.[0-9]+)/);
    if (usdMatch) {
      const val = parseFloat(usdMatch[1]);
      if (val > 0 && val < 200) result.usdEgpRate = val;
    }
  }

  if (!result.usdEgpRate) {
    const usdMatch2 = text.match(/(?:USD\/EGP|دولار)[^0-9]*?([0-9]+\.[0-9]+)/i);
    if (usdMatch2) {
      const val = parseFloat(usdMatch2[1]);
      if (val > 0 && val < 200) result.usdEgpRate = val;
    }
  }

  return result;
}

/**
 * Fetch USD/EGP rate from Google Finance via web_search.
 * Google Finance search snippets include the rate directly:
 * "United States Dollar / Egyptian Pound. 51.8189. +0.19%"
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

    // Google Finance snippet format: "United States Dollar / Egyptian Pound. 51.8189. +0.19%"
    const rateMatch = searchText.match(
      /United States Dollar\s*\/\s*Egyptian Pound[^0-9]*?([0-9]+\.[0-9]+)/
    );

    if (rateMatch) {
      const rate = parseFloat(rateMatch[1]);
      if (rate > 40 && rate < 80) {
        console.log(`[price-fetcher] Got USD/EGP from Google Finance: ${rate}`);
        return {
          price: rate,
          source: "Google Finance",
        };
      }
    }

    // Fallback: try the beta URL snippet
    const betaMatch = searchText.match(
      /google\.com\/finance\/beta\/quote\/USD-EGP[^0-9]*?([0-9]+\.[0-9]+)/
    );
    if (betaMatch) {
      const rate = parseFloat(betaMatch[1]);
      if (rate > 40 && rate < 80) {
        return {
          price: rate,
          source: "Google Finance",
        };
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
        return {
          price: rate,
          source: "Google Finance",
        };
      }
    }
  } catch (error) {
    console.error("[price-fetcher] Google Finance fetch failed:", error);
  }

  return null;
}

/**
 * Fetch BOTH gold price and USD/EGP rate efficiently.
 * Multi-strategy approach:
 * 1. iSagha page_reader (most accurate for gold - shows live market prices)
 * 2. Google Finance web_search (primary for USD/EGP - user requested)
 * 3. banklive.net page_reader (fallback, structured data)
 * 4. edahabapp.com web_search (fallback)
 * 5. Broader web_search
 * 6. LLM extraction fallback
 */
export async function fetchAllPrices(): Promise<CombinedPriceResult> {
  const zai = await ZAI.create();
  const combinedResult: CombinedPriceResult = {
    gold: null,
    usdEgp: null,
  };

  // Strategy 1: iSagha page_reader (most accurate gold source - matches market prices)
  try {
    console.log("[price-fetcher] Fetching from iSagha (market.isagha.com)...");

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
          `[price-fetcher] Got gold from iSagha: sell=${isaghaPrices.gold21Sell}, buy=${isaghaPrices.gold21Buy}`
        );
      }
    }
  } catch (pageError) {
    console.error("[price-fetcher] iSagha page_reader failed:", pageError);
  }

  // Strategy 2: Google Finance for USD/EGP (user specifically requested this source)
  try {
    const gfResult = await fetchUsdEgpFromGoogleFinance(zai);
    if (gfResult) {
      combinedResult.usdEgp = gfResult;
    }
  } catch (error) {
    console.error("[price-fetcher] Google Finance fetch failed:", error);
  }

  // If we have both, return early
  if (combinedResult.gold && combinedResult.usdEgp) {
    console.log("[price-fetcher] Got both prices from primary sources");
    return combinedResult;
  }

  // Strategy 3: banklive.net page_reader (fallback for both gold and USD/EGP)
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

  // Strategy 4: edahabapp.com web_search (lightweight fallback)
  if (!combinedResult.gold || !combinedResult.usdEgp) {
    try {
      console.log("[price-fetcher] Fallback: edahabapp.com...");

      const [goldSearch, usdSearch] = await Promise.all([
        zai.functions.invoke("web_search", {
          query: "site:edahabapp.com سعر الذهب عيار 21 في مصر اليوم",
          num: 3,
        }),
        zai.functions.invoke("web_search", {
          query: "site:edahabapp.com سعر الدولار مقابل الجنيه المصري اليوم",
          num: 3,
        }),
      ]);

      const goldSearchText =
        typeof goldSearch === "string" ? goldSearch : JSON.stringify(goldSearch);
      const goldExtracted = extractPricesFromText(goldSearchText);

      if (!combinedResult.gold && goldExtracted.gold21Sell && goldExtracted.gold21Sell > 0) {
        combinedResult.gold = {
          price: goldExtracted.gold21Sell,
          source: "edahabapp.com",
          buyPrice: goldExtracted.gold21Buy || undefined,
          sellPrice: goldExtracted.gold21Sell,
        };
      }

      const usdSearchText =
        typeof usdSearch === "string" ? usdSearch : JSON.stringify(usdSearch);

      const usdBuyMatch = usdSearchText.match(
        /([0-9]+\.[0-9]+)\s*جنيه\s*لكل\s*دولار\s*للشراء/
      );

      if (!combinedResult.usdEgp && usdBuyMatch) {
        const buyRate = parseFloat(usdBuyMatch[1]);
        if (buyRate > 0 && buyRate < 200) {
          combinedResult.usdEgp = {
            price: buyRate,
            source: "edahabapp.com",
          };
        }
      } else if (!combinedResult.usdEgp) {
        const usdExtracted = extractPricesFromText(usdSearchText);
        if (usdExtracted.usdEgpRate && usdExtracted.usdEgpRate > 0) {
          combinedResult.usdEgp = {
            price: usdExtracted.usdEgpRate,
            source: "edahabapp.com",
          };
        }
      }
    } catch (searchError) {
      console.error("[price-fetcher] edahabapp.com failed:", searchError);
    }
  }

  // Strategy 5: Broader web search
  if (!combinedResult.gold || !combinedResult.usdEgp) {
    try {
      console.log("[price-fetcher] Broader web search...");
      const searchResults = await zai.functions.invoke("web_search", {
        query: "سعر الذهب عيار 21 في مصر اليوم جنيه مصري وسعر الدولار",
        num: 5,
      });

      const searchText =
        typeof searchResults === "string"
          ? searchResults
          : JSON.stringify(searchResults);

      const extracted = extractPricesFromText(searchText);

      if (!combinedResult.gold && extracted.gold21Sell && extracted.gold21Sell > 0) {
        combinedResult.gold = {
          price: extracted.gold21Sell,
          source: "web_search",
          buyPrice: extracted.gold21Buy || undefined,
          sellPrice: extracted.gold21Sell,
        };
      }

      if (!combinedResult.usdEgp && extracted.usdEgpRate && extracted.usdEgpRate > 0) {
        combinedResult.usdEgp = {
          price: extracted.usdEgpRate,
          source: "web_search",
        };
      }
    } catch (searchError) {
      console.error("[price-fetcher] Broader web search failed:", searchError);
    }
  }

  // Strategy 6: LLM extraction fallback
  if (!combinedResult.gold || !combinedResult.usdEgp) {
    try {
      console.log("[price-fetcher] LLM extraction fallback...");
      const searchResults = await zai.functions.invoke("web_search", {
        query: "gold price 21 karat Egypt EGP today USD EGP exchange rate",
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
              "Extract from search results: 1) Gold 21K price per gram in EGP (5000-8000 range), 2) Gold 21K buy price in EGP, 3) USD/EGP exchange rate (45-60 range). Return ONLY JSON: {\"gold21Sell\": number, \"gold21Buy\": number|null, \"usdEgpRate\": number, \"source\": \"string\"}. If not found, use null.",
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
  throw new Error("Could not extract gold price in EGP from any source");
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
