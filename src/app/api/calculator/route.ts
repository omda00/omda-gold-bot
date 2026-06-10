import { NextResponse } from "next/server";
import { fetchCalculatorPrices } from "@/lib/price-fetcher";

/**
 * GET /api/calculator - Return all karat prices, gold pound, and silver prices
 * Data fetched from iSagha.com
 */
export async function GET() {
  try {
    const calculatorData = await fetchCalculatorPrices();
    return NextResponse.json(calculatorData);
  } catch (error) {
    console.error("Error fetching calculator prices:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch calculator prices: ${message}` },
      { status: 500 }
    );
  }
}
