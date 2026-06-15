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
// ==========================================
let pricesCache: { data: unknown; timestamp: number } | null = null;
const CACHE_TTL = 5000; // 5 seconds — fresh enough for 10s polling

/**
 * GET /api/prices - Return the latest Gold and USD/EGP prices
 * Uses in-memory cache (5s TTL) to avoid hammering the DB on every poll.
 * This endpoint is called every 10 seconds by the polling mechanism.
 */
export async function GET() {
  try {
    // Return cached data if fresh
    if (pricesCache && (Date.now() - pricesCache.timestamp) < CACHE_TTL) {
      return NextResponse.json(pricesCache.data);
    }

    const goldPrice = await db.priceRecord.findFirst({
      where: { symbol: "GOLD_EGP" },
      orderBy: { createdAt: "desc" },
    });

    const usdEgpRate = await db.priceRecord.findFirst({
      where: { symbol: "USD_EGP" },
      orderBy: { createdAt: "desc" },
    });

    // Fetch all karat prices from DB
    let allKarats: KaratPriceResult[] = await Promise.all(
      [24, 22, 21, 18].map(async (karat): Promise<KaratPriceResult> => {
        const record = await db.priceRecord.findFirst({
          where: { symbol: KARAT_SYMBOLS[karat] },
          orderBy: { createdAt: "desc" },
        });
        return {
          karat,
          sellPrice: record?.sellPrice ?? null,
          buyPrice: record?.buyPrice ?? null,
          sellWorkmanship: record?.sellWorkmanship ?? null,
          buyWorkmanship: record?.buyWorkmanship ?? null,
          changeAmount: record?.changeAmount ?? null,
          changePercent: record?.change ?? null,
        };
      })
    );

    // Fallback: If karat prices from DB are all null, calculate from 21K gold price
    const hasKaratData = allKarats.some((k) => k.sellPrice !== null);
    if (!hasKaratData && goldPrice?.sellPrice) {
      allKarats = calculateKaratFrom21(goldPrice.sellPrice, goldPrice.buyPrice);
    }

    // Fetch gold pound from DB
    let goldPound: GoldPoundResult | null = null;
    const gpRecord = await db.priceRecord.findFirst({
      where: { symbol: GOLD_POUND_SYMBOL },
      orderBy: { createdAt: "desc" },
    });
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

    const result = {
      gold: goldPrice,
      usdEgp: usdEgpRate,
      allKarats,
      goldPound,
    };

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
    if (url.searchParams.get("resetCooldown") === "true") {
      resetRateLimit();
      console.log("[prices] Rate limit cooldown reset requested");
    }

    // Invalidate the GET cache before fetching new data
    pricesCache = null;

    const allPrices = await fetchAllPrices();

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
    const goldPrice = await db.priceRecord.findFirst({
      where: { symbol: "GOLD_EGP" },
      orderBy: { createdAt: "desc" },
    });

    const usdEgpRate = await db.priceRecord.findFirst({
      where: { symbol: "USD_EGP" },
      orderBy: { createdAt: "desc" },
    });

    // Fetch all karat prices from DB
    let allKarats: KaratPriceResult[] = await Promise.all(
      [24, 22, 21, 18].map(async (karat): Promise<KaratPriceResult> => {
        const record = await db.priceRecord.findFirst({
          where: { symbol: KARAT_SYMBOLS[karat] },
          orderBy: { createdAt: "desc" },
        });
        return {
          karat,
          sellPrice: record?.sellPrice ?? null,
          buyPrice: record?.buyPrice ?? null,
          sellWorkmanship: record?.sellWorkmanship ?? null,
          buyWorkmanship: record?.buyWorkmanship ?? null,
          changeAmount: record?.changeAmount ?? null,
          changePercent: record?.change ?? null,
        };
      })
    );

    // Fallback: If karat prices from DB are all null, calculate from 21K gold price
    const hasKaratData = allKarats.some((k) => k.sellPrice !== null);
    if (!hasKaratData && goldPrice?.sellPrice) {
      allKarats = calculateKaratFrom21(goldPrice.sellPrice, goldPrice.buyPrice);
    }

    // Fetch gold pound from DB
    let goldPound: GoldPoundResult | null = null;
    const gpRecord = await db.priceRecord.findFirst({
      where: { symbol: GOLD_POUND_SYMBOL },
      orderBy: { createdAt: "desc" },
    });
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

    const successMessage = allPrices.gold || allPrices.usdEgp
      ? "Prices fetched successfully"
      : isRateLimited()
        ? "Z-AI SDK rate limited — but direct HTTP sources should still work. Showing cached prices."
        : "Could not fetch new prices from web — showing latest cached prices";

    return NextResponse.json({
      gold: goldPrice,
      usdEgp: usdEgpRate,
      allKarats,
      goldPound,
      fetched: {
        gold: allPrices.gold !== null,
        usdEgp: allPrices.usdEgp !== null,
      },
      rateLimited: isRateLimited(),
      message: successMessage,
    });
  } catch (error) {
    console.error("Error fetching prices:", error);
    
    // Even on error, try to return the latest DB prices
    try {
      const goldPrice = await db.priceRecord.findFirst({
        where: { symbol: "GOLD_EGP" },
        orderBy: { createdAt: "desc" },
      });

      const usdEgpRate = await db.priceRecord.findFirst({
        where: { symbol: "USD_EGP" },
        orderBy: { createdAt: "desc" },
      });

      let allKarats: KaratPriceResult[] = await Promise.all(
        [24, 22, 21, 18].map(async (karat): Promise<KaratPriceResult> => {
          const record = await db.priceRecord.findFirst({
            where: { symbol: KARAT_SYMBOLS[karat] },
            orderBy: { createdAt: "desc" },
          });
          return {
            karat,
            sellPrice: record?.sellPrice ?? null,
            buyPrice: record?.buyPrice ?? null,
            sellWorkmanship: record?.sellWorkmanship ?? null,
            buyWorkmanship: record?.buyWorkmanship ?? null,
            changeAmount: record?.changeAmount ?? null,
            changePercent: record?.change ?? null,
          };
        })
      );

      // Fallback: If karat prices from DB are all null, calculate from 21K gold price
      const hasKaratData = allKarats.some((k) => k.sellPrice !== null);
      if (!hasKaratData && goldPrice?.sellPrice) {
        allKarats = calculateKaratFrom21(goldPrice.sellPrice, goldPrice.buyPrice);
      }

      let goldPound: GoldPoundResult | null = null;
      const gpRecord = await db.priceRecord.findFirst({
        where: { symbol: GOLD_POUND_SYMBOL },
        orderBy: { createdAt: "desc" },
      });
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

      return NextResponse.json({
        gold: goldPrice,
        usdEgp: usdEgpRate,
        allKarats,
        goldPound,
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
