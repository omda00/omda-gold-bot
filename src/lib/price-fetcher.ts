import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

// ==========================================
// Rate limit protection: If we get a 429,
// stop trying for 5 minutes to avoid hammering
// the API and getting more 429s
// ==========================================
let last429Time = 0;
const COOLDOWN_AFTER_429 = 5 * 60 * 1000; // 5 minutes

function isInCooldown(): boolean {
  return Date.now() - last429Time < COOLDOWN_AFTER_429;
}

function mark429(): void {
  last429Time = Date.now();
  console.log(`[price-fetcher] ⚠️ Rate limit hit (429). Cooling down for 5 minutes until ${new Date(last429Time + COOLDOWN_AFTER_429).toLocaleTimeString()}`);
}

/** Check if an error is a 429 rate limit error and mark cooldown if so */
function checkAndMark429(error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes("429") || msg.includes("Too many requests")) {
    mark429();
  }
}

export function isRateLimited(): boolean {
  return isInCooldown();
}

export interface PriceFetchResult {
  price: number;
  source: string;
  buyPrice?: number;
  sellPrice?: number;
}

export interface KaratPriceResult {
  karat: number;
  sellPrice: number;
  buyPrice: number | null;
}

export interface CombinedPriceResult {
  gold: PriceFetchResult | null;
  usdEgp: PriceFetchResult | null;
  allKarats: KaratPriceResult[];
}

export interface KaratPrice {
  karat: number;
  sellPrice: number | null;
  buyPrice: number | null;
}

export interface GoldPoundPrice {
  sellPrice: number | null;
  buyPrice: number | null;
}

export interface CalculatorPriceResult {
  karats: KaratPrice[];
  goldPound: GoldPoundPrice;
  source: string;
  fetchedAt: string;
}

/**
 * Full extraction result from iSagha HTML
 */
interface IsaghaExtractionResult {
  gold24Sell: number | null;
  gold24Buy: number | null;
  gold22Sell: number | null;
  gold22Buy: number | null;
  gold21Sell: number | null;
  gold21Buy: number | null;
  gold18Sell: number | null;
  gold18Buy: number | null;
  gold24SellWorkmanship: number | null;
  gold24BuyWorkmanship: number | null;
  gold22SellWorkmanship: number | null;
  gold22BuyWorkmanship: number | null;
  gold21SellWorkmanship: number | null;
  gold21BuyWorkmanship: number | null;
  gold18SellWorkmanship: number | null;
  gold18BuyWorkmanship: number | null;
  goldPoundSell: number | null;
  goldPoundBuy: number | null;
  goldPoundSellWorkmanship: number | null;
  goldPoundBuyWorkmanship: number | null;
  silverSell: number | null;
  silverBuy: number | null;
  usdEgpRate: number | null;
}

/**
 * PRIMARY SOURCE: Extract gold prices from iSagha (market.isagha.com) HTML content.
 *
 * iSagha is the authoritative source for Egyptian gold prices.
 * It provides real-time, second-by-second updates from Egyptian gold markets.
 *
 * Page structure (as rendered HTML text):
 *   "عيار 24 6971.5 ج.م 199.5 ج.م 6885.75 ج.م 127.5 ج.م -17.14 ج.م -0.25%"
 *   Pattern: عيار [K] [sell_price] ج.م [sell_workmanship] ج.م [buy_price] ج.م [buy_workmanship] ج.م [change] ج.م [change%]
 */
function extractFromIsaghaHtml(html: string): IsaghaExtractionResult {
  const result: IsaghaExtractionResult = {
    gold24Sell: null,
    gold24Buy: null,
    gold22Sell: null,
    gold22Buy: null,
    gold21Sell: null,
    gold21Buy: null,
    gold18Sell: null,
    gold18Buy: null,
    gold24SellWorkmanship: null,
    gold24BuyWorkmanship: null,
    gold22SellWorkmanship: null,
    gold22BuyWorkmanship: null,
    gold21SellWorkmanship: null,
    gold21BuyWorkmanship: null,
    gold18SellWorkmanship: null,
    gold18BuyWorkmanship: null,
    goldPoundSell: null,
    goldPoundBuy: null,
    goldPoundSellWorkmanship: null,
    goldPoundBuyWorkmanship: null,
    silverSell: null,
    silverBuy: null,
    usdEgpRate: null,
  };

  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  // === Extract Gold prices by karat ===
  const karatConfigs = [
    { name: "24", sellField: "gold24Sell" as const, buyField: "gold24Buy" as const, sellWField: "gold24SellWorkmanship" as const, buyWField: "gold24BuyWorkmanship" as const, minPrice: 6500, maxPrice: 10000, minWork: 100, maxWork: 500 },
    { name: "22", sellField: "gold22Sell" as const, buyField: "gold22Buy" as const, sellWField: "gold22SellWorkmanship" as const, buyWField: "gold22BuyWorkmanship" as const, minPrice: 5500, maxPrice: 8500, minWork: 80, maxWork: 400 },
    { name: "21", sellField: "gold21Sell" as const, buyField: "gold21Buy" as const, sellWField: "gold21SellWorkmanship" as const, buyWField: "gold21BuyWorkmanship" as const, minPrice: 5500, maxPrice: 8000, minWork: 80, maxWork: 400 },
    { name: "18", sellField: "gold18Sell" as const, buyField: "gold18Buy" as const, sellWField: "gold18SellWorkmanship" as const, buyWField: "gold18BuyWorkmanship" as const, minPrice: 4500, maxPrice: 7000, minWork: 50, maxWork: 300 },
  ];

  for (const section of karatConfigs) {
    const marker = `عيار ${section.name}`;
    const idx = text.indexOf(marker);
    if (idx < 0) continue;

    // Find the next karat marker after this one to limit the chunk
    let endIdx = idx + 300;
    for (const otherSection of karatConfigs) {
      if (otherSection.name === section.name) continue;
      const otherMarker = `عيار ${otherSection.name}`;
      const otherIdx = text.indexOf(otherMarker, idx + marker.length);
      if (otherIdx > idx && otherIdx < endIdx) {
        endIdx = otherIdx;
      }
    }
    // Also check for markers that come after
    const coinIdx = text.indexOf("جنيه ذهب", idx + marker.length);
    if (coinIdx > idx && coinIdx < endIdx) {
      endIdx = coinIdx;
    }

    const chunk = text.substring(idx, endIdx);
    const numbers = chunk.match(/\d[\d,]*\.?\d*/g) || [];
    const parsedNumbers = numbers
      .map((n) => parseFloat(n.replace(/,/g, "")))
      .filter((n) => !isNaN(n));

    // Format: [sell_price] [sell_workmanship] [buy_price] [buy_workmanship] [change] [change%]
    // But karat number is first, so skip the karat number itself
    const goldPrices = parsedNumbers.filter((v) => v >= section.minPrice && v <= section.maxPrice);
    const workmanshipPrices = parsedNumbers.filter((v) => v >= section.minWork && v <= section.maxWork);

    if (goldPrices.length >= 2) {
      result[section.sellField] = goldPrices[0];
      result[section.buyField] = goldPrices[1];
    } else if (goldPrices.length === 1) {
      result[section.sellField] = goldPrices[0];
    }

    if (workmanshipPrices.length >= 2) {
      result[section.sellWField] = workmanshipPrices[0];
      result[section.buyWField] = workmanshipPrices[1];
    } else if (workmanshipPrices.length === 1) {
      result[section.sellWField] = workmanshipPrices[0];
    }
  }

  // === Extract Gold Pound (جنيه الذهب) ===
  const gpIdx = text.indexOf("جنيه ذهب");
  if (gpIdx >= 0) {
    let gpEndIdx = text.indexOf("أوقية", gpIdx);
    if (gpEndIdx < 0 || gpEndIdx > gpIdx + 400) gpEndIdx = gpIdx + 400;
    const gpChunk = text.substring(gpIdx, gpEndIdx);
    const gpNumbers = gpChunk.match(/\d[\d,]*\.?\d*/g) || [];
    const gpParsed = gpNumbers.map((n) => parseFloat(n.replace(/,/g, ""))).filter((n) => !isNaN(n));
    const gpPrices = gpParsed.filter((v) => v >= 30000 && v <= 80000);
    const gpWork = gpParsed.filter((v) => v >= 500 && v <= 3000);
    if (gpPrices.length >= 2) {
      result.goldPoundSell = gpPrices[0];
      result.goldPoundBuy = gpPrices[1];
    } else if (gpPrices.length === 1) {
      result.goldPoundSell = gpPrices[0];
    }
    if (gpWork.length >= 2) {
      result.goldPoundSellWorkmanship = gpWork[0];
      result.goldPoundBuyWorkmanship = gpWork[1];
    } else if (gpWork.length === 1) {
      result.goldPoundSellWorkmanship = gpWork[0];
    }
  }

  // === Extract Silver price ===
  // From calculator page: "السعر المحلى للفضة 92 ج.م"
  // From prices page: may show "عيار 999" or "الفضة" sections
  const silverPatterns = [
    /السعر المحلى للفضة\s*([0-9,]+\.?\d*)\s*ج\.?م/,
    /سعر الفضة[^0-9]*?([0-9,]+\.?\d*)\s*ج\.?م/,
  ];
  for (const pattern of silverPatterns) {
    const match = text.match(pattern);
    if (match) {
      const price = parseFloat(match[1].replace(/,/g, ""));
      if (price >= 50 && price <= 500) {
        result.silverSell = price;
        break;
      }
    }
  }

  // === Extract USD/EGP rate from iSagha (if available) ===
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
 * Fallback: Fetch USD/EGP from a free exchange rate API.
 * This doesn't use Z-AI SDK so it's not subject to rate limiting.
 * Used when Google Finance is unavailable due to rate limits.
 */
async function fetchUsdEgpFromFreeApi(): Promise<PriceFetchResult | null> {
  try {
    console.log("[price-fetcher] Fetching USD/EGP from free exchange rate API (open.er-api.com)...");
    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(10000), // 10s timeout
    });
    if (!response.ok) {
      console.error(`[price-fetcher] Free API returned status ${response.status}`);
      return null;
    }
    const data = await response.json() as { rates?: Record<string, number>; result?: string };
    const egpRate = data?.rates?.EGP;
    if (egpRate && egpRate > 40 && egpRate < 80) {
      console.log(`[price-fetcher] ✅ Got USD/EGP from free exchange API: ${egpRate}`);
      return { price: Math.round(egpRate * 100) / 100, source: "Exchange Rate API" };
    }
  } catch (err) {
    console.error("[price-fetcher] Free exchange API failed:", err);
  }
  return null;
}

/**
 * Fetch USD/EGP rate from Google Finance via page_reader and web_search.
 */
async function fetchUsdEgpFromGoogleFinance(zai: ZAI.ZAI): Promise<PriceFetchResult | null> {
  try {
    console.log("[price-fetcher] Fetching USD/EGP from Google Finance...");

    // ==========================================
    // Strategy 1: Direct page_reader from Google Finance beta quote URL
    // This is the PRIMARY method — user specifically requested this URL
    // ==========================================
    try {
      const gfResult = await zai.functions.invoke("page_reader", {
        url: "https://www.google.com/finance/beta/quote/USD-EGP",
      });

      const gfHtml = gfResult?.data?.html || "";

      // Try multiple patterns to extract the rate from the HTML
      // Pattern 1: data-last-price attribute
      const dataLastPriceMatch = gfHtml.match(/data-last-price="([0-9.]+)"/);
      if (dataLastPriceMatch) {
        const rate = parseFloat(dataLastPriceMatch[1]);
        if (rate > 40 && rate < 80) {
          console.log(`[price-fetcher] ✅ Got USD/EGP from Google Finance (data-last-price): ${rate}`);
          return { price: rate, source: "Google Finance" };
        }
      }

      // Pattern 2: Extract from text content — look for "United States Dollar / Egyptian Pound" followed by a number
      const textContent = gfHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      const usdEgpTextMatch = textContent.match(
        /United States Dollar\s*\/\s*Egyptian Pound[^0-9]*?([0-9]+\.[0-9]+)/
      );
      if (usdEgpTextMatch) {
        const rate = parseFloat(usdEgpTextMatch[1]);
        if (rate > 40 && rate < 80) {
          console.log(`[price-fetcher] ✅ Got USD/EGP from Google Finance (text): ${rate}`);
          return { price: rate, source: "Google Finance" };
        }
      }

      // Pattern 3: Look for USD/Egyptian Pound patterns with price
      const poundMatch = textContent.match(/USD\s*\/\s*EGP[^0-9]*?([4-7][0-9]\.[0-9]+)/);
      if (poundMatch) {
        const rate = parseFloat(poundMatch[1]);
        if (rate > 40 && rate < 80) {
          console.log(`[price-fetcher] ✅ Got USD/EGP from Google Finance (USD/EGP): ${rate}`);
          return { price: rate, source: "Google Finance" };
        }
      }

      // Pattern 4: Any number in the 40-80 range that looks like an exchange rate
      const priceNumbers = textContent.match(/[0-9]+\.[0-9]{2,4}/g) || [];
      for (const numStr of priceNumbers) {
        const val = parseFloat(numStr);
        if (val > 40 && val < 80) {
          console.log(`[price-fetcher] ✅ Got USD/EGP from Google Finance (fallback number): ${val}`);
          return { price: val, source: "Google Finance" };
        }
      }

      console.log("[price-fetcher] Google Finance beta page loaded but couldn't extract rate from HTML");
    } catch (pageErr) {
      console.error("[price-fetcher] Google Finance beta page_reader failed:", pageErr);
      checkAndMark429(pageErr);
    }

    // ==========================================
    // Strategy 2: Try the non-beta Google Finance URL
    // ==========================================
    try {
      const gfResult = await zai.functions.invoke("page_reader", {
        url: "https://www.google.com/finance/quote/USD-EGP",
      });

      const gfHtml = gfResult?.data?.html || "";
      const gfRateMatch = gfHtml.match(/data-last-price="([0-9.]+)"/);
      if (gfRateMatch) {
        const rate = parseFloat(gfRateMatch[1]);
        if (rate > 0 && rate < 200) {
          console.log(`[price-fetcher] ✅ Got USD/EGP from Google Finance (non-beta): ${rate}`);
          return { price: rate, source: "Google Finance" };
        }
      }
    } catch (pageErr) {
      console.error("[price-fetcher] Google Finance non-beta page_reader failed:", pageErr);
      checkAndMark429(pageErr);
    }

    // ==========================================
    // Strategy 3: web_search as last resort
    // ==========================================
    try {
      const searchResults = await zai.functions.invoke("web_search", {
        query: "site:google.com finance USD EGP exchange rate",
        num: 3,
      });

      const searchText =
        typeof searchResults === "string" ? searchResults : JSON.stringify(searchResults);

      const rateMatch = searchText.match(
        /United States Dollar\s*\/\s*Egyptian Pound[^0-9]*?([0-9]+\.[0-9]+)/
      );
      if (rateMatch) {
        const rate = parseFloat(rateMatch[1]);
        if (rate > 40 && rate < 80) {
          console.log(`[price-fetcher] ✅ Got USD/EGP from Google Finance (web_search): ${rate}`);
          return { price: rate, source: "Google Finance" };
        }
      }
    } catch (searchErr) {
      console.error("[price-fetcher] Google Finance web_search failed:", searchErr);
      checkAndMark429(searchErr);
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
 */
export async function fetchAllPrices(): Promise<CombinedPriceResult> {
  // If we're in rate-limit cooldown, skip fetching entirely
  if (isInCooldown()) {
    console.log("[price-fetcher] ⏸️ Skipping fetch — in rate-limit cooldown");
    return { gold: null, usdEgp: null, allKarats: [] };
  }

  const zai = await ZAI.create();
  const combinedResult: CombinedPriceResult = {
    gold: null,
    usdEgp: null,
    allKarats: [],
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

      // Extract all karat prices from iSagha data
      const karatData: { karat: number; sell: number | null; buy: number | null }[] = [
        { karat: 24, sell: isaghaPrices.gold24Sell, buy: isaghaPrices.gold24Buy },
        { karat: 22, sell: isaghaPrices.gold22Sell, buy: isaghaPrices.gold22Buy },
        { karat: 21, sell: isaghaPrices.gold21Sell, buy: isaghaPrices.gold21Buy },
        { karat: 18, sell: isaghaPrices.gold18Sell, buy: isaghaPrices.gold18Buy },
      ];
      for (const k of karatData) {
        if (k.sell && k.sell > 0) {
          combinedResult.allKarats.push({
            karat: k.karat,
            sellPrice: k.sell,
            buyPrice: k.buy,
          });
        }
      }
      console.log(`[price-fetcher] ✅ Extracted ${combinedResult.allKarats.length} karat prices from iSagha`);

      // Note: We do NOT use iSagha's USD/EGP rate — user wants Google Finance as primary source
      // Store iSagha USD/EGP rate only as fallback info
      if (isaghaPrices.usdEgpRate && isaghaPrices.usdEgpRate > 0) {
        console.log(`[price-fetcher] iSagha USD/EGP rate available (${isaghaPrices.usdEgpRate}) but using Google Finance as primary source`);
      }
    }
  } catch (pageError) {
    console.error("[price-fetcher] ❌ iSagha page_reader failed:", pageError);
    checkAndMark429(pageError);
  }

  // ==========================================
  // PRIMARY: Google Finance for USD/EGP
  // User specifically requested Google Finance
  // as the source for USD/EGP exchange rate
  // ==========================================
  if (!isInCooldown()) {
    try {
      const gfResult = await fetchUsdEgpFromGoogleFinance(zai);
      if (gfResult) {
        combinedResult.usdEgp = gfResult;
        console.log(`[price-fetcher] ✅ Got USD/EGP from Google Finance: ${gfResult.price}`);
      }
    } catch (error) {
      console.error("[price-fetcher] Google Finance fetch failed:", error);
      checkAndMark429(error);
    }
  } else {
    console.log("[price-fetcher] ⏸️ Skipping Google Finance — in rate-limit cooldown, using free API fallback");
  }

  // ==========================================
  // FALLBACK: Free exchange rate API (no Z-AI SDK needed)
  // This always works, even when Z-AI SDK is rate-limited
  // ==========================================
  if (!combinedResult.usdEgp) {
    const freeApiResult = await fetchUsdEgpFromFreeApi();
    if (freeApiResult) {
      combinedResult.usdEgp = freeApiResult;
      console.log(`[price-fetcher] ✅ Got USD/EGP from free API fallback: ${freeApiResult.price}`);
    }
  }

  // If we have both from primary sources, return immediately
  if (combinedResult.gold && combinedResult.usdEgp) {
    console.log("[price-fetcher] ✅ Got both prices from primary sources (iSagha + Google Finance)");
    return combinedResult;
  }

  // ==========================================
  // FALLBACK 1: iSagha via web_search
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
      checkAndMark429(searchError);
    }
  }

  if (combinedResult.gold && combinedResult.usdEgp) {
    return combinedResult;
  }

  // ==========================================
  // FALLBACK 2: banklive.net
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
      checkAndMark429(pageError);
    }
  }

  if (combinedResult.gold && combinedResult.usdEgp) {
    return combinedResult;
  }

  // ==========================================
  // FALLBACK 3: Broader web search + LLM
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
      checkAndMark429(llmError);
    }
  }

  return combinedResult;
}

/**
 * Fetch calculator prices: all karats, gold pound, and silver from iSagha.
 * Uses BOTH the prices page and the calculator page for complete data.
 */
export async function fetchCalculatorPrices(): Promise<CalculatorPriceResult> {
  // Respect rate limit cooldown
  if (isInCooldown()) {
    console.log("[calculator] ⏸️ Skipping fetch — in rate-limit cooldown");
    return {
      karats: [
        { karat: 24, sellPrice: null, buyPrice: null },
        { karat: 22, sellPrice: null, buyPrice: null },
        { karat: 21, sellPrice: null, buyPrice: null },
        { karat: 18, sellPrice: null, buyPrice: null },
      ],
      goldPound: { sellPrice: null, buyPrice: null },
      source: "",
      fetchedAt: new Date().toISOString(),
    };
  }

  const zai = await ZAI.create();

  const emptyResult: CalculatorPriceResult = {
    karats: [
      { karat: 24, sellPrice: null, buyPrice: null },
      { karat: 22, sellPrice: null, buyPrice: null },
      { karat: 21, sellPrice: null, buyPrice: null },
      { karat: 18, sellPrice: null, buyPrice: null },
    ],
    goldPound: { sellPrice: null, buyPrice: null },
    source: "",
    fetchedAt: new Date().toISOString(),
  };

  // Fetch from iSagha prices page
  let isaghaPrices: IsaghaExtractionResult | null = null;
  try {
    console.log("[calculator] Fetching prices from iSagha.com/prices...");
    const isaghaResult = await zai.functions.invoke("page_reader", {
      url: "https://market.isagha.com/prices",
    });
    const isaghaHtml = isaghaResult?.data?.html || "";
    if (isaghaHtml) {
      isaghaPrices = extractFromIsaghaHtml(isaghaHtml);
    }
  } catch (err) {
    console.error("[calculator] iSagha prices page failed:", err);
    checkAndMark429(err);
  }

  // Fetch from iSagha calculator page for additional data
  try {
    console.log("[calculator] Fetching additional data from iSagha.com/calculateGoldPrice...");
    const calcResult = await zai.functions.invoke("page_reader", {
      url: "https://market.isagha.com/calculateGoldPrice",
    });
    const calcHtml = calcResult?.data?.html || "";
    if (calcHtml && !isaghaPrices) {
      isaghaPrices = extractFromIsaghaHtml(calcHtml);
    }
  } catch (err) {
    console.error("[calculator] iSagha calculator page failed:", err);
    checkAndMark429(err);
  }

  if (!isaghaPrices) {
    return emptyResult;
  }

  // Build the karats array
  const karatMap: Record<number, { sell: number | null; buy: number | null; sellW: number | null; buyW: number | null }> = {
    24: { sell: isaghaPrices.gold24Sell, buy: isaghaPrices.gold24Buy, sellW: isaghaPrices.gold24SellWorkmanship, buyW: isaghaPrices.gold24BuyWorkmanship },
    22: { sell: isaghaPrices.gold22Sell, buy: isaghaPrices.gold22Buy, sellW: isaghaPrices.gold22SellWorkmanship, buyW: isaghaPrices.gold22BuyWorkmanship },
    21: { sell: isaghaPrices.gold21Sell, buy: isaghaPrices.gold21Buy, sellW: isaghaPrices.gold21SellWorkmanship, buyW: isaghaPrices.gold21BuyWorkmanship },
    18: { sell: isaghaPrices.gold18Sell, buy: isaghaPrices.gold18Buy, sellW: isaghaPrices.gold18SellWorkmanship, buyW: isaghaPrices.gold18BuyWorkmanship },
  };

  const karats: KaratPrice[] = [24, 22, 21, 18].map((k) => ({
    karat: k,
    sellPrice: karatMap[k]?.sell ?? null,
    buyPrice: karatMap[k]?.buy ?? null,
  }));

  return {
    karats,
    goldPound: {
      sellPrice: isaghaPrices.goldPoundSell,
      buyPrice: isaghaPrices.goldPoundBuy,
    },
    source: "iSagha.com",
    fetchedAt: new Date().toISOString(),
  };
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
