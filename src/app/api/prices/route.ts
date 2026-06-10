import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchAramcoPrice, fetchUsdEgpRate, savePriceRecord } from "@/lib/price-fetcher";
import { seedDefaultConfig } from "@/lib/config-seeder";

/**
 * GET /api/prices - Return the latest Aramco and USD/EGP prices
 */
export async function GET() {
  try {
    // Ensure defaults are seeded
    await seedDefaultConfig();

    const aramcoPrice = await db.priceRecord.findFirst({
      where: { symbol: "ARAMCO" },
      orderBy: { createdAt: "desc" },
    });

    const usdEgpRate = await db.priceRecord.findFirst({
      where: { symbol: "USD_EGP" },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      aramco: aramcoPrice,
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
 * POST /api/prices - Trigger a manual price fetch using web search
 */
export async function POST() {
  try {
    // Fetch both prices in parallel
    const [aramcoResult, usdEgpResult] = await Promise.all([
      fetchAramcoPrice(),
      fetchUsdEgpRate(),
    ]);

    // Save to database
    const [aramcoRecord, usdEgpRecord] = await Promise.all([
      savePriceRecord("ARAMCO", aramcoResult.price, "SAR", aramcoResult.source),
      savePriceRecord("USD_EGP", usdEgpResult.price, "EGP", usdEgpResult.source),
    ]);

    return NextResponse.json({
      aramco: aramcoRecord,
      usdEgp: usdEgpRecord,
      message: "Prices fetched and saved successfully",
    });
  } catch (error) {
    console.error("Error fetching prices via web search:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch prices: ${message}` },
      { status: 500 }
    );
  }
}
