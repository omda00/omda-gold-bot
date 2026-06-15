import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateSmartSignal } from "@/lib/signal-detector";

/**
 * GET /api/signal - Generate a smart signal based on price history analysis
 *
 * This endpoint reads recent price records from the DB for both GOLD_EGP and USD_EGP,
 * analyzes trends, and returns a comprehensive signal with reasoning.
 */
export async function GET() {
  try {
    // Fetch recent gold price history (last 50 records)
    const goldRecords = await db.priceRecord.findMany({
      where: { symbol: "GOLD_EGP" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Fetch recent USD/EGP history
    const usdRecords = await db.priceRecord.findMany({
      where: { symbol: "USD_EGP" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Fetch active investment plans
    const plans = await db.investmentPlan.findMany({
      where: { active: true },
      orderBy: { order: "asc" },
    });

    // Need at least one gold price to generate a signal
    if (goldRecords.length === 0) {
      return NextResponse.json(
        { error: "No gold price data available" },
        { status: 404 }
      );
    }

    const currentGoldPrice = goldRecords[0].price;
    const currentUsdEgp = usdRecords.length > 0 ? usdRecords[0].price : 0;

    // Convert records to trend points (reverse to chronological order)
    const goldHistory = goldRecords
      .reverse()
      .map((r) => ({ price: r.sellPrice ?? r.price, timestamp: r.createdAt }));

    const usdHistory = usdRecords
      .reverse()
      .map((r) => ({ price: r.price, timestamp: r.createdAt }));

    // Generate the smart signal
    const signal = generateSmartSignal({
      currentGoldPrice,
      goldPriceHistory: goldHistory,
      currentUsdEgp,
      usdEgpHistory: usdHistory,
      investmentPlans: plans,
    });

    return NextResponse.json(signal);
  } catch (error) {
    console.error("Error generating smart signal:", error);
    return NextResponse.json(
      { error: "Failed to generate signal" },
      { status: 500 }
    );
  }
}
