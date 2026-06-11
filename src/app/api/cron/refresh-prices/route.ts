import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fetchAllPrices,
  savePriceRecord,
  isRateLimited,
  resetRateLimit,
} from "@/lib/price-fetcher";

// Karat symbol mapping
const KARAT_SYMBOLS: Record<number, string> = {
  24: "GOLD_24K_EGP",
  22: "GOLD_22K_EGP",
  21: "GOLD_21K_EGP",
  18: "GOLD_18K_EGP",
};

const GOLD_POUND_SYMBOL = "GOLD_POUND_EGP";

/**
 * GET /api/cron/refresh-prices - Vercel Cron: Refresh prices every 30 minutes
 * This is called by Vercel's cron system (GET requests only).
 * It fetches prices from the web and saves them to the database.
 * Does NOT send Telegram notifications (that's the hourly automation job).
 */
export async function GET() {
  try {
    console.log("[cron/refresh-prices] 🔄 Starting price refresh...");

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

      // Save all karat prices
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

      // Save gold pound prices
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

    const gold = await db.priceRecord.findFirst({
      where: { symbol: "GOLD_EGP" },
      orderBy: { createdAt: "desc" },
    });

    const usdEgp = await db.priceRecord.findFirst({
      where: { symbol: "USD_EGP" },
      orderBy: { createdAt: "desc" },
    });

    console.log(
      `[cron/refresh-prices] ✅ Refresh complete: gold=${gold?.sellPrice ?? "N/A"}, usdEgp=${usdEgp?.price ?? "N/A"}`
    );

    return NextResponse.json({
      success: true,
      fetched: {
        gold: allPrices.gold !== null,
        usdEgp: allPrices.usdEgp !== null,
        karats: allPrices.allKarats.length,
        goldPound: allPrices.goldPound !== null,
      },
      prices: {
        gold: gold?.sellPrice ?? null,
        usdEgp: usdEgp?.price ?? null,
      },
      rateLimited: isRateLimited(),
    });
  } catch (error) {
    console.error("[cron/refresh-prices] ❌ Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
