import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchGoldEgpPrice, fetchUsdEgpRate, savePriceRecord } from "@/lib/price-fetcher";
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
 */
export async function POST() {
  try {
    const [goldResult, usdEgpResult] = await Promise.all([
      fetchGoldEgpPrice(),
      fetchUsdEgpRate(),
    ]);

    const [goldRecord, usdEgpRecord] = await Promise.all([
      savePriceRecord("GOLD_EGP", goldResult.price, "EGP", goldResult.source),
      savePriceRecord("USD_EGP", usdEgpResult.price, "EGP", usdEgpResult.source),
    ]);

    return NextResponse.json({
      gold: goldRecord,
      usdEgp: usdEgpRecord,
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
