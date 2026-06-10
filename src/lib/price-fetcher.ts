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
 * Extract gold and USD/EGP prices from text content.
 * Handles both edahabapp.com format and general search results.
 *
 * edahabapp format: "الذهب عيار 21: بيع: 6110 جنيه شراء: 6080 جنيه"
 * Also JSON-LD: "سعر الذهب عيار 21 بيع", "value": "6110 جنيه"
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

  // Strategy 1: JSON-LD PropertyValue format
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

  // Strategy 2: Plain text format "عيار 21: بيع: 6110 جنيه شراء: 6080 جنيه"
  if (!result.gold21Sell) {
    const sellMatch = text.match(/عيار 21: بيع: ([0-9,]+)/);
    if (sellMatch) {
      const val = parseFloat(sellMatch[1].replace(/,/g, ""));
      if (val >= 3000 && val <= 15000) result.gold21Sell = val;
    }
  }
  if (!result.gold21Buy) {
    const section21 = text.match(/عيار 21: بيع: ([0-9,]+) جنيه شراء: ([0-9,]+)/);
    if (section21) {
      const buyVal = parseFloat(section21[2].replace(/,/g, ""));
      if (buyVal >= 3000 && buyVal <= 15000) result.gold21Buy = buyVal;
    }
  }

  // Also try the snippet format without colons: "عيار 21 بيع 6130 جنيه شراء 6100 جنيه"
  if (!result.gold21Sell || !result.gold21Buy) {
    const snippetMatch = text.match(/عيار 21\s*بيع\s*([0-9,]+)\s*جنيه\s*شراء\s*([0-9,]+)/);
    if (snippetMatch) {
      const sell = parseFloat(snippetMatch[1].replace(/,/g, ""));
      const buy = parseFloat(snippetMatch[2].replace(/,/g, ""));
      if (!result.gold21Sell && sell >= 3000 && sell <= 15000) result.gold21Sell = sell;
      if (!result.gold21Buy && buy >= 3000 && buy <= 15000) result.gold21Buy = buy;
    }
  }

  // Strategy 3: USD/EGP
  if (!result.usdEgpRate) {
    const usdMatch = text.match(/الدولار[^0-9]*?([0-9]+\.[0-9]+)/);
    if (usdMatch) {
      const val = parseFloat(usdMatch[1]);
      if (val > 0 && val < 200) result.usdEgpRate = val;
    }
  }

  return result;
}

/**
 * Fetch BOTH gold price and USD/EGP rate efficiently.
 * Uses web_search (lightweight) as primary, page_reader as fallback.
 */
export async function fetchAllPrices(): Promise<CombinedPriceResult> {
  const zai = await ZAI.create();
  const combinedResult: CombinedPriceResult = {
    gold: null,
    usdEgp: null,
  };

  // Strategy 1: web_search for edahabapp.com (lightweight, gets snippets with prices)
  try {
    console.log("[price-fetcher] Searching edahabapp.com via web_search...");

    // Search for gold and USD/EGP separately in parallel for best results
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

    // Extract gold prices from search results
    const goldSearchText = typeof goldSearch === "string"
      ? goldSearch : JSON.stringify(goldSearch);
    const goldExtracted = extractPricesFromText(goldSearchText);

    if (goldExtracted.gold21Sell && goldExtracted.gold21Sell > 0) {
      combinedResult.gold = {
        price: goldExtracted.gold21Sell,
        source: "edahabapp.com",
        buyPrice: goldExtracted.gold21Buy || undefined,
        sellPrice: goldExtracted.gold21Sell,
      };
    }

    // Extract USD/EGP rate from search results
    const usdSearchText = typeof usdSearch === "string"
      ? usdSearch : JSON.stringify(usdSearch);

    // Parse USD/EGP from edahabapp snippet format:
    // "51.65 جنيه لكل دولار للشراء، مقابل 51.79 جنيه لكل دولار للبيع"
    const usdBuyMatch = usdSearchText.match(/([0-9]+\.[0-9]+)\s*جنيه\s*لكل\s*دولار\s*للشراء/);
    const usdSellMatch = usdSearchText.match(/مقابل\s*([0-9]+\.[0-9]+)\s*جنيه\s*لكل\s*دولار\s*للبيع/);

    if (usdBuyMatch) {
      const buyRate = parseFloat(usdBuyMatch[1]);
      if (buyRate > 0 && buyRate < 200) {
        combinedResult.usdEgp = {
          price: buyRate,
          source: "edahabapp.com",
        };
      }
    } else {
      // Fallback: try the generic extraction
      const usdExtracted = extractPricesFromText(usdSearchText);
      if (usdExtracted.usdEgpRate && usdExtracted.usdEgpRate > 0) {
        combinedResult.usdEgp = {
          price: usdExtracted.usdEgpRate,
          source: "edahabapp.com",
        };
      }
    }

    if (combinedResult.gold && combinedResult.usdEgp) {
      console.log("[price-fetcher] Got both prices from edahabapp.com search");
      return combinedResult;
    }
  } catch (searchError) {
    console.error("[price-fetcher] edahabapp.com web_search failed:", searchError);
  }

  // Strategy 2: Broader web search for Egyptian gold prices
  if (!combinedResult.gold || !combinedResult.usdEgp) {
    try {
      console.log("[price-fetcher] Broader web search for prices...");
      const searchResults = await zai.functions.invoke("web_search", {
        query: "سعر الذهب عيار 21 في مصر اليوم جنيه مصري وسعر الدولار",
        num: 5,
      });

      const searchText = typeof searchResults === "string"
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

  // Strategy 3: LLM extraction from search results (most robust for complex formats)
  if (!combinedResult.gold || !combinedResult.usdEgp) {
    try {
      console.log("[price-fetcher] LLM extraction fallback...");
      const searchResults = await zai.functions.invoke("web_search", {
        query: "gold price 21 karat Egypt EGP today USD EGP exchange rate",
        num: 5,
      });

      const searchText = typeof searchResults === "string"
        ? searchResults
        : JSON.stringify(searchResults);

      // Truncate to avoid memory issues
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
        if (!combinedResult.gold && typeof parsed.gold21Sell === "number" && parsed.gold21Sell > 0) {
          combinedResult.gold = {
            price: parsed.gold21Sell,
            source: parsed.source || "web_search+LLM",
            buyPrice: typeof parsed.gold21Buy === "number" ? parsed.gold21Buy : undefined,
            sellPrice: parsed.gold21Sell,
          };
        }
        if (!combinedResult.usdEgp && typeof parsed.usdEgpRate === "number" && parsed.usdEgpRate > 0) {
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

  const change = previous ? ((price - previous.price) / previous.price) * 100 : 0;

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
