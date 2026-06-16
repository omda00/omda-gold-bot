import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchAllPrices, savePriceRecord, isRateLimited, resetRateLimit } from "@/lib/price-fetcher";

// Karat symbol mapping
const KARAT_SYMBOLS: Record<number, string> = {
  24: "GOLD_24K_EGP",
  22: "GOLD_22K_EGP",
  21: "GOLD_21K_EGP",
  18: "GOLD_18K_EGP",
};

const GOLD_POUND_SYMBOL = "GOLD_POUND_EGP";

interface KaratPriceResult {
  karat: number;
  sellPrice: number | null;
  buyPrice: number | null;
  sellWorkmanship: number | null;
  buyWorkmanship: number | null;
  changeAmount: number | null;
  changePercent: number | null;
}

interface GoldPoundResult {
  sellPrice: number | null;
  buyPrice: number | null;
  sellWorkmanship: number | null;
  buyWorkmanship: number | null;
  changeAmount: number | null;
  changePercent: number | null;
}

/**
 * Calculate other karat prices from 21K price as fallback.
 * Gold prices are proportional to purity: price_k = price_21 × (k/21)
 */
function calculateKaratFrom21(price21Sell: number, price21Buy: number | null): KaratPriceResult[] {
  const ratios: Record<number, number> = { 24: 24 / 21, 22: 22 / 21, 21: 1, 18: 18 / 21 };
  return [24, 22, 21, 18].map((k) => ({
    karat: k,
    sellPrice: Math.round(price21Sell * ratios[k]),
    buyPrice: price21Buy !== null ? Math.round(price21Buy * ratios[k]) : null,
    sellWorkmanship: null,
    buyWorkmanship: null,
    changeAmount: null,
    changePercent: null,
  }));
}

// ==========================================
// In-memory cache for GET /api/prices
// This endpoint is called every 10 seconds by polling,
// so caching avoids repeated DB queries.
// Increased from 5s to 15s — Vercel serverless cold-starts wipe the cache
// anyway, so 15s gives better hit-rate within a warm instance without
// noticeably stale data (polling is every 10s).
// ==========================================
let pricesCache: { data: unknown; timestamp: number } | null = null;
const CACHE_TTL = 15000; // 15 seconds

// ==========================================
// In-memory cache for POST /api/prices (the slow web-fetch path)
// If multiple users click "تحديث الأسعار" within 60s, only the FIRST
// request triggers an actual web fetch. Subsequent ones return the
// already-fetched result immediately. This prevents thundering-herd
// latency on the Vercel function.
// ==========================================
let postFetchCache: { data: unknown; timestamp: number } | null = null;
const POST_CACHE_TTL = 60000; // 60 seconds
let postFetchInProgress: Promise<unknown> | null = null;

/**
 * GET /api/prices - Return the latest Gold and USD/EGP prices
 * Uses in-memory cache (15s TTL) to avoid hammering the DB on every poll.
 * This endpoint is called every 10 seconds by the polling mechanism.
 */
export async function GET() {
  try {
    // Return cached data if fresh
    if (pricesCache && (Date.now() - pricesCache.timestamp) < CACHE_TTL) {
      return NextResponse.json(pricesCache.data);
    }

    const result = await buildPricesResponse();

    // Cache the result
    pricesCache = { data: result, timestamp: Date.now() };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching prices:", error);
    return NextResponse.json(
      { error: "Failed to fetch prices" },
      { status: 500 }
    );
  }
}

/**
 * Build the prices response by reading the latest records from the DB.
 *
 * ⚡ OPTIMIZATION: Runs ALL 7 DB queries in a single Promise.all
 * (gold, usdEgp, 4 karats, goldPound) instead of sequentially.
 * On SQLite/Vercel this cuts GET latency significantly.
 */
async function buildPricesResponse(): Promise<{
  gold: Awaited<ReturnType<typeof db.priceRecord.findFirst>>;
  usdEgp: Awaited<ReturnType<typeof db.priceRecord.findFirst>>;
  allKarats: KaratPriceResult[];
  goldPound: GoldPoundResult | null;
}> {
  // Fire ALL queries in parallel — 7 queries at once
  const [goldPrice, usdEgpRate, k24, k22, k21, k18, gpRecord] = await Promise.all([
    db.priceRecord.findFirst({ where: { symbol: "GOLD_EGP" }, orderBy: { createdAt: "desc" } }),
    db.priceRecord.findFirst({ where: { symbol: "USD_EGP" }, orderBy: { createdAt: "desc" } }),
    db.priceRecord.findFirst({ where: { symbol: KARAT_SYMBOLS[24] }, orderBy: { createdAt: "desc" } }),
    db.priceRecord.findFirst({ where: { symbol: KARAT_SYMBOLS[22] }, orderBy: { createdAt: "desc" } }),
    db.priceRecord.findFirst({ where: { symbol: KARAT_SYMBOLS[21] }, orderBy: { createdAt: "desc" } }),
    db.priceRecord.findFirst({ where: { symbol: KARAT_SYMBOLS[18] }, orderBy: { createdAt: "desc" } }),
    db.priceRecord.findFirst({ where: { symbol: GOLD_POUND_SYMBOL }, orderBy: { createdAt: "desc" } }),
  ]);

  const karatRecords: Record<number, typeof k24 | null> = { 24: k24, 22: k22, 21: k21, 18: k18 };

  let allKarats: KaratPriceResult[] = [24, 22, 21, 18].map((karat) => {
    const record = karatRecords[karat];
    return {
      karat,
      sellPrice: record?.sellPrice ?? null,
      buyPrice: record?.buyPrice ?? null,
      sellWorkmanship: record?.sellWorkmanship ?? null,
      buyWorkmanship: record?.buyWorkmanship ?? null,
      changeAmount: record?.changeAmount ?? null,
      changePercent: record?.change ?? null,
    };
  });

  // Fallback: If karat prices from DB are all null, calculate from 21K gold price
  const hasKaratData = allKarats.some((k) => k.sellPrice !== null);
  if (!hasKaratData && goldPrice?.sellPrice) {
    allKarats = calculateKaratFrom21(goldPrice.sellPrice, goldPrice.buyPrice);
  }

  let goldPound: GoldPoundResult | null = null;
  if (gpRecord) {
    goldPound = {
      sellPrice: gpRecord.sellPrice,
      buyPrice: gpRecord.buyPrice,
      sellWorkmanship: gpRecord.sellWorkmanship,
      buyWorkmanship: gpRecord.buyWorkmanship,
      changeAmount: gpRecord.changeAmount,
      changePercent: gpRecord.change,
    };
  }

  return {
    gold: goldPrice,
    usdEgp: usdEgpRate,
    allKarats,
    goldPound,
  };
}

/**
 * POST /api/prices - Trigger a price fetch from the web
 * Uses fetchAllPrices() which now uses DIRECT HTTP as primary
 * (bypasses Z-AI SDK entirely for iSagha, no rate limits!)
 * 
 * Query params:
 *   ?resetCooldown=true - Reset the Z-AI SDK rate limit cooldown
 */
export async function POST(request: NextRequest) {
  try {
    // Check if we should reset the rate limit cooldown
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("force") === "true";
    if (url.searchParams.get("resetCooldown") === "true") {
      resetRateLimit();
      console.log("[prices] Rate limit cooldown reset requested");
    }

    // ⚡ POST CACHE: If we fetched within the last 60s, return that result
    // immediately instead of hitting iSagha/Google Finance again. This is the
    // single biggest win for perceived speed — multiple users clicking
    // "تحديث الأسعار" no longer each pay the full web-fetch latency.
    if (!forceRefresh && postFetchCache && (Date.now() - postFetchCache.timestamp) < POST_CACHE_TTL) {
      console.log("[prices] ⚡ POST cache HIT — returning recent fetch result");
      return NextResponse.json(postFetchCache.data);
    }

    // ⚡ REQUEST COALESCING: If a fetch is already in-flight, wait for it
    // instead of starting a duplicate. Prevents thundering-herd on cold start.
    if (postFetchInProgress && !forceRefresh) {
      console.log("[prices] ⚡ Coalescing with in-flight POST fetch...");
      try {
        const coalescedResult = await Promise.race([
          postFetchInProgress,
          new Promise((_, reject) => setTimeout(() => reject(new Error("coalesce-timeout")), 30000)),
        ]);
        return NextResponse.json(coalescedResult);
      } catch {
        // If coalescing fails/times out, fall through to do our own fetch
        console.log("[prices] Coalesce timed out, proceeding with own fetch");
      }
    }

    const fetchPromise = (async () => {
      // Invalidate the GET cache before fetching new data
      pricesCache = null;

      const fetchStart = Date.now();
      const allPrices = await fetchAllPrices();
      console.log(`[prices] fetchAllPrices took ${Date.now() - fetchStart}ms`);

      // Save whatever we got from the web
      if (allPrices.gold || allPrices.usdEgp || allPrices.allKarats.length > 0) {
        const savePromises: Promise<unknown>[] = [];

        if (allPrices.gold) {
          savePromises.push(
            savePriceRecord("GOLD_EGP", allPrices.gold.price, "EGP", allPrices.gold.source, {
              buyPrice: allPrices.gold.buyPrice,
              sellPrice: allPrices.gold.sellPrice,
            })
          );
        }

        if (allPrices.usdEgp) {
          savePromises.push(
            savePriceRecord("USD_EGP", allPrices.usdEgp.price, "EGP", allPrices.usdEgp.source)
          );
        }

        // Save all karat prices with workmanship and change from iSagha
        for (const karatPrice of allPrices.allKarats) {
          const symbol = KARAT_SYMBOLS[karatPrice.karat];
          if (symbol) {
            savePromises.push(
              savePriceRecord(symbol, karatPrice.sellPrice, "EGP", "iSagha.com", {
                buyPrice: karatPrice.buyPrice ?? undefined,
                sellPrice: karatPrice.sellPrice,
                sellWorkmanship: karatPrice.sellWorkmanship ?? undefined,
                buyWorkmanship: karatPrice.buyWorkmanship ?? undefined,
                changeAmount: karatPrice.changeAmount ?? undefined,
                changePercent: karatPrice.changePercent ?? undefined,
              })
            );
          }
        }

        // Save gold pound prices with workmanship and change from iSagha
        if (allPrices.goldPound && allPrices.goldPound.sellPrice) {
          savePromises.push(
            savePriceRecord(GOLD_POUND_SYMBOL, allPrices.goldPound.sellPrice, "EGP", "iSagha.com", {
              buyPrice: allPrices.goldPound.buyPrice ?? undefined,
              sellPrice: allPrices.goldPound.sellPrice,
              sellWorkmanship: allPrices.goldPound.sellWorkmanship ?? undefined,
              buyWorkmanship: allPrices.goldPound.buyWorkmanship ?? undefined,
              changeAmount: allPrices.goldPound.changeAmount ?? undefined,
              changePercent: allPrices.goldPound.changePercent ?? undefined,
            })
          );
        }

        await Promise.all(savePromises);
      }

      // Always return the latest DB prices (even if web fetch partially failed)
      const dbResult = await buildPricesResponse();

      const successMessage = allPrices.gold || allPrices.usdEgp
        ? "Prices fetched successfully"
        : isRateLimited()
          ? "Z-AI SDK rate limited — but direct HTTP sources should still work. Showing cached prices."
          : "Could not fetch new prices from web — showing latest cached prices";

      const response = {
        ...dbResult,
        fetched: {
          gold: allPrices.gold !== null,
          usdEgp: allPrices.usdEgp !== null,
        },
        rateLimited: isRateLimited(),
        message: successMessage,
      };

      // Save to POST cache
      postFetchCache = { data: response, timestamp: Date.now() };
      // Invalidate GET cache so the next GET sees fresh data
      pricesCache = null;

      return response;
    })();

    // Register the in-flight promise for coalescing
    postFetchInProgress = fetchPromise as Promise<unknown>;

    const response = await fetchPromise;

    // Clear the in-flight marker
    postFetchInProgress = null;

    return NextResponse.json(response);
  } catch (error) {
    postFetchInProgress = null;
    console.error("Error fetching prices:", error);

    // Even on error, try to return the latest DB prices
    try {
      const dbResult = await buildPricesResponse();

      return NextResponse.json({
        ...dbResult,
        fetched: { gold: false, usdEgp: false },
        message: "Web fetch failed — showing latest cached prices",
      });
    } catch {
      const message = error instanceof Error ? error.message : "Unknown error";
      return NextResponse.json(
        { error: `Failed to fetch prices: ${message}` },
        { status: 500 }
      );
    }
  }
}
