import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

// ==========================================
// Rate limit protection: If we get a 429,
// stop trying Z-AI SDK for 60 seconds
// (reduced from 5 minutes to avoid blocking)
// ==========================================
let last429Time = 0;
const COOLDOWN_AFTER_429 = 60 * 1000; // 1 minute (was 5 min)

function isInCooldown(): boolean {
  return Date.now() - last429Time < COOLDOWN_AFTER_429;
}

function mark429(): void {
  last429Time = Date.now();
  console.log(`[price-fetcher] ⚠️ Rate limit hit (429). Cooling down Z-AI SDK for 1 minute until ${new Date(last429Time + COOLDOWN_AFTER_429).toLocaleTimeString()}`);
}

/** Check if an error is a 429 rate limit error and mark cooldown if so */
function checkAndMark429(error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes("429") || msg.includes("Too many requests")) {
    mark429();
  }
}

/** Reset the rate limit cooldown - useful when we want to force a fresh attempt */
export function resetRateLimit(): void {
  last429Time = 0;
  console.log("[price-fetcher] Rate limit cooldown reset");
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
  sellWorkmanship: number | null;
  buyWorkmanship: number | null;
  changeAmount: number | null;
  changePercent: number | null;
}

export interface GoldPoundResult {
  sellPrice: number | null;
  buyPrice: number | null;
  sellWorkmanship: number | null;
  buyWorkmanship: number | null;
  changeAmount: number | null;
  changePercent: number | null;
}

export interface CombinedPriceResult {
  gold: PriceFetchResult | null;
  usdEgp: PriceFetchResult | null;
  allKarats: KaratPriceResult[];
  goldPound: GoldPoundResult | null;
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
 * Per-karat extraction result with all iSagha fields
 */
interface KaratExtraction {
  sellPrice: number | null;
  buyPrice: number | null;
  sellWorkmanship: number | null;
  buyWorkmanship: number | null;
  changeAmount: number | null;
  changePercent: number | null;
}

/**
 * Full extraction result from iSagha HTML
 */
interface IsaghaExtractionResult {
  gold24: KaratExtraction;
  gold22: KaratExtraction;
  gold21: KaratExtraction;
  gold18: KaratExtraction;
  goldPound: KaratExtraction;
  silverSell: number | null;
  silverBuy: number | null;
  usdEgpRate: number | null;
}

// ==========================================
// PRIMARY METHOD: Direct HTTP fetch from iSagha
// This does NOT use Z-AI SDK and therefore
// CANNOT be rate-limited. It uses standard
// Node.js fetch() directly.
// ==========================================

/**
 * Fetch iSagha HTML directly via HTTP (no Z-AI SDK, no rate limits)
 */
async function fetchIsaghaDirectly(url: string): Promise<string> {
  try {
    console.log(`[price-fetcher] 🌐 Direct HTTP fetch: ${url}`);
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000), // 10s timeout (was 15s)
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    if (!response.ok) {
      console.error(`[price-fetcher] Direct HTTP fetch failed with status ${response.status}`);
      return "";
    }

    const html = await response.text();
    console.log(`[price-fetcher] ✅ Direct HTTP fetch succeeded (${html.length} chars)`);
    return html;
  } catch (err) {
    console.error("[price-fetcher] Direct HTTP fetch error:", err);
    return "";
  }
}

// ==========================================
// PRIMARY METHOD for USD/EGP: Direct HTTP fetch from Google Finance
// This does NOT use Z-AI SDK and therefore
// CANNOT be rate-limited. It uses standard
// Node.js fetch() directly.
// ==========================================

/**
 * Fetch USD/EGP from Google Finance directly via HTTP (no Z-AI SDK, no rate limits).
 *
 * Google Finance redirects /finance/quote/USD-EGP → /finance/beta/quote/USD-EGP (302).
 * We MUST follow redirects AND use Accept-Encoding: gzip, deflate (compressed transfer).
 *
 * NOTE: Using Accept-Encoding: identity causes timeouts because the uncompressed
 * page is ~1MB. With gzip, it takes ~5 seconds instead of timing out.
 *
 * The page embeds the price in reliable locations:
 *  1. A <span jsname="Pdsbrc"> element in the main display area
 *  2. AF_initDataCallback JavaScript with "USD / EGP" identifier
 */
async function fetchUsdEgpFromGoogleFinanceDirect(): Promise<PriceFetchResult | null> {
  try {
    console.log("[price-fetcher] 🌐 Direct HTTP fetch: Google Finance USD/EGP...");

    const url = "https://www.google.com/finance/quote/USD-EGP?hl=en";

    const response = await fetch(url, {
      signal: AbortSignal.timeout(12000), // 12s timeout (was 30s — too slow when Google is slow)
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate", // CRITICAL: uncompressed is ~1MB, gzip makes it ~5s vs timeout
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
      redirect: "follow", // CRITICAL: Google 302-redirects to /finance/beta/quote/USD-EGP
    });

    if (!response.ok) {
      console.log(`[price-fetcher] Google Finance direct HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();
    console.log(`[price-fetcher] Google Finance page loaded (${html.length} chars)`);

    if (html.length < 1000) {
      console.log("[price-fetcher] Google Finance returned too little content, likely blocked");
      return null;
    }

    // ── Pattern 1: <span jsname="Pdsbrc"> near the main price display ──
    // This is the MOST reliable pattern. The Pdsbrc span is the main price display
    // that the user sees on the page. Look for values in the USD/EGP range (40-80).
    const pdsbrcMatches = [...html.matchAll(/jsname="Pdsbrc"[^>]*>\s*(?:<span[^>]*>)?\s*([0-9.]+)\s*(?:<\/span>)?/g)];
    for (const match of pdsbrcMatches) {
      const val = parseFloat(match[1]);
      if (val > 40 && val < 80) {
        console.log(`[price-fetcher] ✅ Got USD/EGP from Google Finance Direct (Pdsbrc span): ${val}`);
        return { price: Math.round(val * 100) / 100, source: "Google Finance" };
      }
    }

    // ── Pattern 2: AF_initDataCallback with "USD / EGP" ──
    // Google embeds the live price in JavaScript data callbacks like:
    //   AF_initDataCallback({key: 'ds:2', ...data:[[[["/g/11bvv_25bp",null,"USD / EGP",3,null,[51.9795,...
    // Use .{0,200}? because there ARE digits between "USD / EGP" and the price
    const usdEgpJsPattern = /"USD\s*\/\s*EGP".{0,200}?\[(5[0-2]\.[0-9]{2,4})/g;
    let jsMatch;
    while ((jsMatch = usdEgpJsPattern.exec(html)) !== null) {
      const rate = parseFloat(jsMatch[1]);
      if (rate > 40 && rate < 80) {
        console.log(`[price-fetcher] ✅ Got USD/EGP from Google Finance Direct (JS AF_initDataCallback): ${rate}`);
        return { price: Math.round(rate * 100) / 100, source: "Google Finance" };
      }
    }

    // ── Pattern 3: data-last-price attribute (older Google Finance versions) ──
    const dataLastPriceMatch = html.match(/data-last-price="([0-9.]+)"/);
    if (dataLastPriceMatch) {
      const rate = parseFloat(dataLastPriceMatch[1]);
      if (rate > 40 && rate < 80) {
        console.log(`[price-fetcher] ✅ Got USD/EGP from Google Finance Direct (data-last-price): ${rate}`);
        return { price: Math.round(rate * 100) / 100, source: "Google Finance" };
      }
    }

    // ── Pattern 4: "USD / EGP" followed by a number in JS data (without [ requirement) ──
    const jsUsdEgpMatch = html.match(/"USD\s*\/\s*EGP".{0,200}?(5[0-2]\.[0-9]{2,4})/);
    if (jsUsdEgpMatch) {
      const rate = parseFloat(jsUsdEgpMatch[1]);
      if (rate > 40 && rate < 80) {
        console.log(`[price-fetcher] ✅ Got USD/EGP from Google Finance Direct (JS data fallback): ${rate}`);
        return { price: Math.round(rate * 100) / 100, source: "Google Finance" };
      }
    }

    console.log("[price-fetcher] Google Finance page loaded but couldn't extract rate");
  } catch (error) {
    console.error("[price-fetcher] Google Finance Direct HTTP fetch failed:", error);
  }

  return null;
}

/**
 * Parse a price string like "6931.5 ج.م" or "-11.43 ج.م" or "-0.16%"
 * Returns the numeric value or null.
 */
function parsePriceCell(cell: string): number | null {
  const cleaned = cell.replace(/[\u200e\u200f]/g, "").trim(); // Remove LRM/RLM markers
  // Check if it's a percentage
  const pctMatch = cleaned.match(/(-?\d[\d,]*\.?\d*)\s*%/);
  if (pctMatch) {
    const val = parseFloat(pctMatch[1].replace(/,/g, ""));
    return isNaN(val) ? null : val;
  }
  // Check for a number with optional minus sign
  const numMatch = cleaned.match(/(-?\d[\d,]*\.?\d*)/);
  if (numMatch) {
    const val = parseFloat(numMatch[1].replace(/,/g, ""));
    return isNaN(val) ? null : val;
  }
  return null;
}

/**
 * Extract karat/gold pound data from a single table row's <td> cells.
 *
 * iSagha table format per row (7 cells):
 *   [0] Name: "عيار 24" or "جنيه ذهب"
 *   [1] Sell price: "6931.5 ج.م"
 *   [2] Sell workmanship: "111.5 ج.م"
 *   [3] Buy price: "6868.5 ج.م"
 *   [4] Buy workmanship: "62.25 ج.م"
 *   [5] Change amount: "‎-11.43 ج.م"
 *   [6] Change percent: "‎-0.16%"
 */
function extractKaratFromCells(cells: string[]): KaratExtraction {
  const emptyKarat: KaratExtraction = {
    sellPrice: null, buyPrice: null,
    sellWorkmanship: null, buyWorkmanship: null,
    changeAmount: null, changePercent: null,
  };

  if (cells.length < 5) return emptyKarat;

  const sellPrice = parsePriceCell(cells[1]);
  const sellWork = parsePriceCell(cells[2]);
  const buyPrice = parsePriceCell(cells[3]);
  const buyWork = parsePriceCell(cells[4]);
  const changeAmt = cells.length >= 6 ? parsePriceCell(cells[5]) : null;
  const changePct = cells.length >= 7 ? parsePriceCell(cells[6]) : null;

  return {
    sellPrice,
    buyPrice,
    sellWorkmanship: sellWork,
    buyWorkmanship: buyWork,
    changeAmount: changeAmt,
    changePercent: changePct,
  };
}

/**
 * PRIMARY SOURCE: Extract gold prices from iSagha (market.isagha.com) HTML content.
 *
 * iSagha is the authoritative source for Egyptian gold prices.
 * It provides real-time, second-by-second updates from Egyptian gold markets.
 *
 * We parse the HTML table directly using <td> cells, which is much more
 * reliable than the old range-based number filtering approach.
 *
 * Table structure per row (7 columns):
 *   عيار [K] | بيع ج.م | صنعة بيع ج.م | شراء ج.م | صنعة شراء ج.م | التغيير ج.م | النسبة %
 */
function extractFromIsaghaHtml(html: string): IsaghaExtractionResult {
  const emptyKarat = (): KaratExtraction => ({
    sellPrice: null, buyPrice: null,
    sellWorkmanship: null, buyWorkmanship: null,
    changeAmount: null, changePercent: null,
  });

  const result: IsaghaExtractionResult = {
    gold24: emptyKarat(),
    gold22: emptyKarat(),
    gold21: emptyKarat(),
    gold18: emptyKarat(),
    goldPound: emptyKarat(),
    silverSell: null,
    silverBuy: null,
    usdEgpRate: null,
  };

  // === METHOD 1: Parse HTML table rows (<td> cells) ===
  // This is the most reliable approach — each <td> maps to a specific field.
  const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || [];

  for (const row of rows) {
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
    const cleanCells = cells.map((c: string) =>
      c.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    );

    if (cleanCells.length === 0) continue;
    const firstCell = cleanCells[0];

    // Match karat rows: "عيار 24", "عيار 22", "عيار 21", "عيار 18"
    const karatMatch = firstCell.match(/عيار\s*(\d+)/);
    if (karatMatch) {
      const karatNum = parseInt(karatMatch[1]);
      const extracted = extractKaratFromCells(cleanCells);

      if (karatNum === 24) result.gold24 = extracted;
      else if (karatNum === 22) result.gold22 = extracted;
      else if (karatNum === 21) result.gold21 = extracted;
      else if (karatNum === 18) result.gold18 = extracted;
      continue;
    }

    // Match gold pound row: "جنيه ذهب"
    if (firstCell.includes("جنيه ذهب")) {
      result.goldPound = extractKaratFromCells(cleanCells);
      continue;
    }
  }

  // === METHOD 2 (FALLBACK): Text-based extraction if table parsing failed ===
  // This handles cases where the HTML structure is different
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  // If table parsing didn't get 21K data, fall back to range-based extraction
  if (!result.gold21.sellPrice) {
    console.log("[price-fetcher] Table parsing didn't find gold data, falling back to text extraction...");

    const karatConfigs = [
      { name: "24", minPrice: 6500, maxPrice: 10000, minWork: 50, maxWork: 500 },
      { name: "22", minPrice: 5500, maxPrice: 8500, minWork: 50, maxWork: 400 },
      { name: "21", minPrice: 5500, maxPrice: 8000, minWork: 50, maxWork: 400 },
      { name: "18", minPrice: 4500, maxPrice: 7000, minWork: 40, maxWork: 300 },
    ];

    for (const section of karatConfigs) {
      const marker = `عيار ${section.name}`;
      const idx = text.indexOf(marker);
      if (idx < 0) continue;

      let endIdx = idx + 300;
      for (const other of karatConfigs) {
        if (other.name === section.name) continue;
        const otherIdx = text.indexOf(`عيار ${other.name}`, idx + marker.length);
        if (otherIdx > idx && otherIdx < endIdx) endIdx = otherIdx;
      }
      const coinIdx = text.indexOf("جنيه ذهب", idx + marker.length);
      if (coinIdx > idx && coinIdx < endIdx) endIdx = coinIdx;

      const chunk = text.substring(idx, endIdx);
      const numbers = chunk.match(/-?\d[\d,]*\.?\d*/g) || [];
      const parsed = numbers.map((n) => parseFloat(n.replace(/,/g, ""))).filter((n) => !isNaN(n));

      const prices = parsed.filter((v) => v >= section.minPrice && v <= section.maxPrice);
      const work = parsed.filter((v) => v >= section.minWork && v <= section.maxWork);
      const changes = parsed.filter((v) => v > -50 && v < 50 && v !== 0);

      const karatResult: KaratExtraction = {
        sellPrice: prices[0] ?? null,
        buyPrice: prices[1] ?? null,
        sellWorkmanship: work[0] ?? null,
        buyWorkmanship: work[1] ?? null,
        changeAmount: changes[0] ?? null,
        changePercent: changes[1] ?? null,
      };

      if (section.name === "24") result.gold24 = karatResult;
      else if (section.name === "22") result.gold22 = karatResult;
      else if (section.name === "21") result.gold21 = karatResult;
      else if (section.name === "18") result.gold18 = karatResult;
    }

    // Gold pound fallback
    if (!result.goldPound.sellPrice) {
      const gpIdx = text.indexOf("جنيه ذهب");
      if (gpIdx >= 0) {
        let gpEndIdx = text.indexOf("أوقية", gpIdx);
        if (gpEndIdx < 0 || gpEndIdx > gpIdx + 400) gpEndIdx = gpIdx + 400;
        const gpChunk = text.substring(gpIdx, gpEndIdx);
        const gpNumbers = gpChunk.match(/-?\d[\d,]*\.?\d*/g) || [];
        const gpParsed = gpNumbers.map((n) => parseFloat(n.replace(/,/g, ""))).filter((n) => !isNaN(n));
        const gpPrices = gpParsed.filter((v) => v >= 30000 && v <= 80000);
        const gpWork = gpParsed.filter((v) => v >= 300 && v <= 3000);
        result.goldPound = {
          sellPrice: gpPrices[0] ?? null,
          buyPrice: gpPrices[1] ?? null,
          sellWorkmanship: gpWork[0] ?? null,
          buyWorkmanship: gpWork[1] ?? null,
          changeAmount: null,
          changePercent: null,
        };
      }
    }
  }

  // === Extract Silver price ===
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
 * SECONDARY: Fetch USD/EGP from Google Finance via Z-AI SDK
 * Only used when free API fails and we're not rate-limited
 */
async function fetchUsdEgpFromGoogleFinance(zai: ZAI.ZAI): Promise<PriceFetchResult | null> {
  // Skip if we're in rate limit cooldown
  if (isInCooldown()) {
    console.log("[price-fetcher] ⏸️ Skipping Google Finance — Z-AI SDK in cooldown");
    return null;
  }

  try {
    console.log("[price-fetcher] Fetching USD/EGP from Google Finance (Z-AI SDK)...");

    // Strategy 1: Direct page_reader from Google Finance
    try {
      const gfResult = await zai.functions.invoke("page_reader", {
        url: "https://www.google.com/finance/quote/USD-EGP?hl=en",
      });

      const gfHtml = gfResult?.data?.html || "";

      // Pattern A: JS data with "USD / EGP" (most reliable)
      const jsPattern = /"USD\s*\/\s*EGP".{0,200}?\[(5[0-2]\.[0-9]{2,4})/g;
      let jsM;
      while ((jsM = jsPattern.exec(gfHtml)) !== null) {
        const rate = parseFloat(jsM[1]);
        if (rate > 40 && rate < 80) {
          console.log(`[price-fetcher] ✅ Got USD/EGP from Google Finance SDK (JS data): ${rate}`);
          return { price: Math.round(rate * 100) / 100, source: "Google Finance" };
        }
      }

      // Pattern B: Pdsbrc span
      const pdsbrcMatches = [...gfHtml.matchAll(/jsname="Pdsbrc"[^>]*>\s*(?:<span[^>]*>)?\s*([0-9.]+)\s*(?:<\/span>)?/g)];
      for (const match of pdsbrcMatches) {
        const val = parseFloat(match[1]);
        if (val > 40 && val < 80) {
          console.log(`[price-fetcher] ✅ Got USD/EGP from Google Finance SDK (Pdsbrc span): ${val}`);
          return { price: Math.round(val * 100) / 100, source: "Google Finance" };
        }
      }

      // Pattern C: data-last-price (older versions)
      const dataLastPriceMatch = gfHtml.match(/data-last-price="([0-9.]+)"/);
      if (dataLastPriceMatch) {
        const rate = parseFloat(dataLastPriceMatch[1]);
        if (rate > 40 && rate < 80) {
          console.log(`[price-fetcher] ✅ Got USD/EGP from Google Finance SDK (data-last-price): ${rate}`);
          return { price: Math.round(rate * 100) / 100, source: "Google Finance" };
        }
      }
    } catch (pageErr) {
      console.error("[price-fetcher] Google Finance page_reader failed:", pageErr);
      checkAndMark429(pageErr);
    }
  } catch (error) {
    console.error("[price-fetcher] Google Finance fetch failed:", error);
    checkAndMark429(error);
  }

  return null;
}

/**
 * Fetch BOTH gold price and USD/EGP rate.
 *
 * STRATEGY (in priority order):
 * 1. DIRECT HTTP: iSagha.com for gold prices — NO rate limits!
 * 2. DIRECT HTTP: Google Finance for USD/EGP — NO rate limits! (follows redirects)
 * 3. Z-AI SDK: Google Finance via page_reader (backup, may be rate-limited)
 * 4. Free API: USD/EGP from open.er-api.com — NO rate limits! (labeled "Exchange Rate API")
 * 5. Z-AI SDK: iSagha via page_reader (backup for gold, may be rate-limited)
 * 6. Z-AI SDK: banklive.net (backup for both, may be rate-limited)
 * 7. Z-AI SDK: web_search + LLM (last resort, may be rate-limited)
 */
export async function fetchAllPrices(): Promise<CombinedPriceResult> {
  const combinedResult: CombinedPriceResult = {
    gold: null,
    usdEgp: null,
    allKarats: [],
    goldPound: null,
  };

  // ==========================================
  // ⚡ PARALLEL FETCH: iSagha (gold) + Google Finance (USD) at the same time
  // Previously these ran SEQUENTIALLY which doubled the latency.
  // Now we run them in parallel — total time ≈ max(iSagha, Google) not sum.
  // ==========================================
  console.log("[price-fetcher] ⚡ PARALLEL: Fetching iSagha (gold) + Google Finance (USD) simultaneously...");
  const parallelStart = Date.now();

  const [isaghaHtml, gfDirectResult] = await Promise.all([
    fetchIsaghaDirectly("https://market.isagha.com/prices"),
    fetchUsdEgpFromGoogleFinanceDirect(),
  ]);

  // Process iSagha result (gold + karats + gold pound)
  if (isaghaHtml) {
    try {
      const isaghaPrices = extractFromIsaghaHtml(isaghaHtml);

      if (isaghaPrices.gold21.sellPrice && isaghaPrices.gold21.sellPrice > 0) {
        combinedResult.gold = {
          price: isaghaPrices.gold21.sellPrice,
          source: "iSagha.com",
          buyPrice: isaghaPrices.gold21.buyPrice || undefined,
          sellPrice: isaghaPrices.gold21.sellPrice,
        };
        console.log(
          `[price-fetcher] ✅ Got gold from iSagha (direct): sell=${isaghaPrices.gold21.sellPrice}, buy=${isaghaPrices.gold21.buyPrice}`
        );
      }

      // Extract all karat prices with workmanship and change from iSagha
      const karatData: { karat: number; data: KaratExtraction }[] = [
        { karat: 24, data: isaghaPrices.gold24 },
        { karat: 22, data: isaghaPrices.gold22 },
        { karat: 21, data: isaghaPrices.gold21 },
        { karat: 18, data: isaghaPrices.gold18 },
      ];
      for (const k of karatData) {
        if (k.data.sellPrice && k.data.sellPrice > 0) {
          combinedResult.allKarats.push({
            karat: k.karat,
            sellPrice: k.data.sellPrice,
            buyPrice: k.data.buyPrice,
            sellWorkmanship: k.data.sellWorkmanship,
            buyWorkmanship: k.data.buyWorkmanship,
            changeAmount: k.data.changeAmount,
            changePercent: k.data.changePercent,
          });
        }
      }

      // Extract gold pound prices with workmanship and change from iSagha
      if (isaghaPrices.goldPound.sellPrice && isaghaPrices.goldPound.sellPrice > 0) {
        combinedResult.goldPound = {
          sellPrice: isaghaPrices.goldPound.sellPrice,
          buyPrice: isaghaPrices.goldPound.buyPrice,
          sellWorkmanship: isaghaPrices.goldPound.sellWorkmanship,
          buyWorkmanship: isaghaPrices.goldPound.buyWorkmanship,
          changeAmount: isaghaPrices.goldPound.changeAmount,
          changePercent: isaghaPrices.goldPound.changePercent,
        };
      }

      console.log(`[price-fetcher] ✅ Extracted ${combinedResult.allKarats.length} karat prices + gold pound from iSagha (direct)`);

      if (isaghaPrices.usdEgpRate && isaghaPrices.usdEgpRate > 0) {
        console.log(`[price-fetcher] iSagha USD/EGP rate available (${isaghaPrices.usdEgpRate}) but using Google Finance as primary source`);
      }
    } catch (parseErr) {
      console.error("[price-fetcher] ❌ iSagha HTML parsing failed:", parseErr);
    }
  }

  // Process Google Finance result (USD/EGP)
  if (gfDirectResult) {
    combinedResult.usdEgp = gfDirectResult;
    console.log(`[price-fetcher] ✅ Got USD/EGP from Google Finance Direct (PRIMARY): ${gfDirectResult.price}`);
  }

  console.log(`[price-fetcher] ⏱️ Parallel fetch done in ${Date.now() - parallelStart}ms | gold=${!!combinedResult.gold} usdEgp=${!!combinedResult.usdEgp}`);

  // If we got both gold and USD/EGP, return immediately!
  if (combinedResult.gold && combinedResult.usdEgp) {
    console.log("[price-fetcher] ✅ Got gold (iSagha) + USD/EGP (Google Finance) — skipping fallbacks");
    return combinedResult;
  }

  // ==========================================
  // FALLBACK 1 (parallel): Z-AI SDK Google Finance + Free Exchange Rate API
  // Only run if USD/EGP is missing — gold fallbacks come next.
  // ==========================================
  if (!combinedResult.usdEgp) {
    console.log("[price-fetcher] 🔄 USD/EGP missing — running Z-AI SDK + Free API fallbacks in parallel...");
    const fallbackPromises: Promise<PriceFetchResult | null>[] = [];

    if (!isInCooldown()) {
      fallbackPromises.push(
        (async () => {
          try {
            const zai = await ZAI.create();
            return await fetchUsdEgpFromGoogleFinance(zai);
          } catch (error) {
            console.error("[price-fetcher] Google Finance Z-AI SDK fetch failed:", error);
            checkAndMark429(error);
            return null;
          }
        })()
      );
    }

    fallbackPromises.push(fetchUsdEgpFromFreeApi());

    const fallbackResults = await Promise.all(fallbackPromises);
    for (const result of fallbackResults) {
      if (result && !combinedResult.usdEgp) {
        combinedResult.usdEgp = result;
        console.log(`[price-fetcher] ✅ Got USD/EGP from fallback: ${result.price} (${result.source})`);
        break;
      }
    }
  }

  // If we still need gold, try Z-AI SDK iSagha
  if (!combinedResult.gold && !isInCooldown()) {
    try {
      console.log("[price-fetcher] 🔄 FALLBACK: Fetching gold from iSagha via Z-AI SDK page_reader...");
      const zai = await ZAI.create();

      const isaghaResult = await zai.functions.invoke("page_reader", {
        url: "https://market.isagha.com/prices",
      });

      const sdkIsaghaHtml = isaghaResult?.data?.html || "";
      if (sdkIsaghaHtml) {
        const isaghaPrices = extractFromIsaghaHtml(sdkIsaghaHtml);

        if (isaghaPrices.gold21.sellPrice && isaghaPrices.gold21.sellPrice > 0) {
          combinedResult.gold = {
            price: isaghaPrices.gold21.sellPrice,
            source: "iSagha.com (SDK)",
            buyPrice: isaghaPrices.gold21.buyPrice || undefined,
            sellPrice: isaghaPrices.gold21.sellPrice,
          };
          console.log(
            `[price-fetcher] ✅ Got gold from iSagha (SDK): sell=${isaghaPrices.gold21.sellPrice}, buy=${isaghaPrices.gold21.buyPrice}`
          );
        }

        // Extract karat prices if not already present
        if (combinedResult.allKarats.length === 0) {
          const karatData: { karat: number; data: KaratExtraction }[] = [
            { karat: 24, data: isaghaPrices.gold24 },
            { karat: 22, data: isaghaPrices.gold22 },
            { karat: 21, data: isaghaPrices.gold21 },
            { karat: 18, data: isaghaPrices.gold18 },
          ];
          for (const k of karatData) {
            if (k.data.sellPrice && k.data.sellPrice > 0) {
              combinedResult.allKarats.push({
                karat: k.karat,
                sellPrice: k.data.sellPrice,
                buyPrice: k.data.buyPrice,
                sellWorkmanship: k.data.sellWorkmanship,
                buyWorkmanship: k.data.buyWorkmanship,
                changeAmount: k.data.changeAmount,
                changePercent: k.data.changePercent,
              });
            }
          }
        }

        // Extract gold pound if not already present
        if (!combinedResult.goldPound && isaghaPrices.goldPound.sellPrice && isaghaPrices.goldPound.sellPrice > 0) {
          combinedResult.goldPound = {
            sellPrice: isaghaPrices.goldPound.sellPrice,
            buyPrice: isaghaPrices.goldPound.buyPrice,
            sellWorkmanship: isaghaPrices.goldPound.sellWorkmanship,
            buyWorkmanship: isaghaPrices.goldPound.buyWorkmanship,
            changeAmount: isaghaPrices.goldPound.changeAmount,
            changePercent: isaghaPrices.goldPound.changePercent,
          };
        }

        if (isaghaPrices.usdEgpRate && isaghaPrices.usdEgpRate > 0) {
          console.log(`[price-fetcher] iSagha SDK USD/EGP available (${isaghaPrices.usdEgpRate}) but using Google Finance as primary`);
        }
      }
    } catch (pageError) {
      console.error("[price-fetcher] ❌ iSagha Z-AI SDK page_reader failed:", pageError);
      checkAndMark429(pageError);
    }
  }

  if (combinedResult.gold && combinedResult.usdEgp) {
    return combinedResult;
  }

  // ==========================================
  // METHOD 5 (LAST RESORT): banklive.net via Z-AI SDK
  // ==========================================
  if ((!combinedResult.gold || !combinedResult.usdEgp) && !isInCooldown()) {
    try {
      const zai = await ZAI.create();
      console.log("[price-fetcher] 🔄 LAST RESORT: banklive.net...");
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
  // METHOD 6 (FINAL): Broader web search + LLM
  // ==========================================
  if ((!combinedResult.gold || !combinedResult.usdEgp) && !isInCooldown()) {
    try {
      const zai = await ZAI.create();
      console.log("[price-fetcher] 🔄 FINAL: web search + LLM...");
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
 * Uses BOTH direct HTTP and the calculator page for complete data.
 */
export async function fetchCalculatorPrices(): Promise<CalculatorPriceResult> {
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

  // PRIMARY: Direct HTTP fetch from iSagha prices page
  let isaghaPrices: IsaghaExtractionResult | null = null;
  try {
    console.log("[calculator] PRIMARY: Fetching prices from iSagha.com via DIRECT HTTP...");
    const isaghaHtml = await fetchIsaghaDirectly("https://market.isagha.com/prices");
    if (isaghaHtml) {
      isaghaPrices = extractFromIsaghaHtml(isaghaHtml);
    }
  } catch (err) {
    console.error("[calculator] Direct iSagha HTTP fetch failed:", err);
  }

  // Also try the calculator page via direct HTTP
  try {
    console.log("[calculator] Fetching additional data from iSagha.com/calculateGoldPrice via DIRECT HTTP...");
    const calcHtml = await fetchIsaghaDirectly("https://market.isagha.com/calculateGoldPrice");
    if (calcHtml && !isaghaPrices) {
      isaghaPrices = extractFromIsaghaHtml(calcHtml);
    }
  } catch (err) {
    console.error("[calculator] Direct iSagha calculator page HTTP fetch failed:", err);
  }

  // FALLBACK: Z-AI SDK if direct HTTP didn't work
  if (!isaghaPrices && !isInCooldown()) {
    try {
      console.log("[calculator] FALLBACK: Fetching from iSagha via Z-AI SDK...");
      const zai = await ZAI.create();
      const isaghaResult = await zai.functions.invoke("page_reader", {
        url: "https://market.isagha.com/prices",
      });
      const isaghaHtml = isaghaResult?.data?.html || "";
      if (isaghaHtml) {
        isaghaPrices = extractFromIsaghaHtml(isaghaHtml);
      }
    } catch (err) {
      console.error("[calculator] iSagha Z-AI SDK failed:", err);
      checkAndMark429(err);
    }
  }

  if (!isaghaPrices) {
    return emptyResult;
  }

  // Build the karats array
  const karatMap: Record<number, KaratExtraction> = {
    24: isaghaPrices.gold24,
    22: isaghaPrices.gold22,
    21: isaghaPrices.gold21,
    18: isaghaPrices.gold18,
  };

  const karats: KaratPrice[] = [24, 22, 21, 18].map((k) => ({
    karat: k,
    sellPrice: karatMap[k]?.sellPrice ?? null,
    buyPrice: karatMap[k]?.buyPrice ?? null,
  }));

  return {
    karats,
    goldPound: {
      sellPrice: isaghaPrices.goldPound.sellPrice,
      buyPrice: isaghaPrices.goldPound.buyPrice,
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
  extras?: { buyPrice?: number; sellPrice?: number; sellWorkmanship?: number; buyWorkmanship?: number; changeAmount?: number; changePercent?: number }
) {
  const previous = await db.priceRecord.findFirst({
    where: { symbol },
    orderBy: { createdAt: "desc" },
  });

  // Use iSagha's change data if provided, otherwise calculate from previous record
  const changePercent = extras?.changePercent !== undefined && extras.changePercent !== null
    ? extras.changePercent
    : previous
      ? Math.round((((price - previous.price) / previous.price) * 100) * 100) / 100
      : 0;

  const changeAmount = extras?.changeAmount !== undefined && extras.changeAmount !== null
    ? extras.changeAmount
    : previous
      ? Math.round((price - previous.price) * 100) / 100
      : 0;

  return db.priceRecord.create({
    data: {
      symbol,
      price,
      currency,
      change: Math.round(changePercent * 100) / 100,
      changeAmount: Math.round(changeAmount * 100) / 100,
      source,
      buyPrice: extras?.buyPrice ?? null,
      sellPrice: extras?.sellPrice ?? null,
      sellWorkmanship: extras?.sellWorkmanship ?? null,
      buyWorkmanship: extras?.buyWorkmanship ?? null,
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
