import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchAllPrices, savePriceRecord } from "@/lib/price-fetcher";
import { seedDefaultConfig } from "@/lib/config-seeder";

/**
 * GET /api/prices - Return the latest Gold and USD/EGP prices
 */
export async function GET() {
  try {
    await seedDefaultConfig();

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
 * POST /api/prices - Trigger a manual price fetch
 * Uses fetchAllPrices() for efficiency (single page read instead of two)
 */
export async function POST() {
  try {
    const allPrices = await fetchAllPrices();

    if (!allPrices.gold && !allPrices.usdEgp) {
      return NextResponse.json(
        { error: "Could not fetch any prices from any source" },
        { status: 500 }
      );
    }

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

    const saved = await Promise.all(savePromises);

    return NextResponse.json({
      gold: allPrices.gold ? saved[0] : null,
      usdEgp: allPrices.usdEgp ? saved[allPrices.gold ? 1 : 0] : null,
      message: "Prices fetched and saved successfully",
    });
  } catch (error) {
    console.error("Error fetching prices:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch prices: ${message}` },
      { status: 500 }
    );
  }
}
