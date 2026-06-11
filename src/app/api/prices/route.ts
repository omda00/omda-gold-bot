import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchAllPrices, savePriceRecord } from "@/lib/price-fetcher";

/**
 * GET /api/prices - Return the latest Gold and USD/EGP prices
 * This is called every second by the polling mechanism, so it must be lightweight.
 * No seeding or heavy operations here.
 */
export async function GET() {
  try {
    const goldPrice = await db.priceRecord.findFirst({
      where: { symbol: "GOLD_EGP" },
      orderBy: { createdAt: "desc" },
    });

    const usdEgpRate = await db.priceRecord.findFirst({
      where: { symbol: "USD_EGP" },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      gold: goldPrice,
      usdEgp: usdEgpRate,
    });
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
 * Uses fetchAllPrices() for efficiency (single page read instead of two)
 * 
 * This endpoint is called both manually (via تحديث button) and automatically
 * (via the background auto-refresh). It should handle errors gracefully
 * and always return the latest DB prices even if the web fetch fails.
 */
export async function POST() {
  try {
    const allPrices = await fetchAllPrices();

    // Save whatever we got from the web
    if (allPrices.gold || allPrices.usdEgp) {
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

    return NextResponse.json({
      gold: goldPrice,
      usdEgp: usdEgpRate,
      fetched: {
        gold: allPrices.gold !== null,
        usdEgp: allPrices.usdEgp !== null,
      },
      message: allPrices.gold || allPrices.usdEgp
        ? "Prices fetched successfully"
        : "Could not fetch new prices from web — showing latest cached prices",
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

      return NextResponse.json({
        gold: goldPrice,
        usdEgp: usdEgpRate,
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
