import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Karat symbol mapping
const KARAT_SYMBOLS: Record<number, string> = {
  24: "GOLD_24K_EGP",
  22: "GOLD_22K_EGP",
  21: "GOLD_21K_EGP",
  18: "GOLD_18K_EGP",
};

/**
 * Calculate other karat prices from 21K price as fallback.
 * Gold prices are proportional to purity: price_k = price_21 × (k/21)
 */
function calculateKaratFrom21(price21Sell: number, price21Buy: number | null) {
  const ratios: Record<number, number> = { 24: 24 / 21, 22: 22 / 21, 21: 1, 18: 18 / 21 };
  return [24, 22, 21, 18].map((k) => ({
    karat: k,
    sellPrice: Math.round(price21Sell * ratios[k]),
    buyPrice: price21Buy !== null ? Math.round(price21Buy * ratios[k]) : null,
  }));
}

/**
 * GET /api/calculator - Return all karat prices and gold pound price from DB.
 * Uses DB data with fallback calculation for reliability.
 */
export async function GET() {
  try {
    // Fetch 21K gold price (base for calculations)
    const gold21 = await db.priceRecord.findFirst({
      where: { symbol: "GOLD_21K_EGP" },
      orderBy: { createdAt: "desc" },
    });

    // Also try GOLD_EGP as fallback
    const goldEgp = await db.priceRecord.findFirst({
      where: { symbol: "GOLD_EGP" },
      orderBy: { createdAt: "desc" },
    });

    // Fetch all karat prices from DB
    let karats = await Promise.all(
      [24, 22, 21, 18].map(async (karat) => {
        const record = await db.priceRecord.findFirst({
          where: { symbol: KARAT_SYMBOLS[karat] },
          orderBy: { createdAt: "desc" },
        });
        return {
          karat,
          sellPrice: record?.sellPrice ?? null,
          buyPrice: record?.buyPrice ?? null,
        };
      })
    );

    // Fallback: If karat prices from DB are all null, calculate from 21K/EGP gold price
    const hasKaratData = karats.some((k) => k.sellPrice !== null);
    if (!hasKaratData) {
      const baseSell = gold21?.sellPrice ?? goldEgp?.sellPrice;
      const baseBuy = gold21?.buyPrice ?? goldEgp?.buyPrice;
      if (baseSell) {
        karats = calculateKaratFrom21(baseSell, baseBuy ?? null) as typeof karats;
      }
    }

    // Calculate gold pound price (8 grams of 21K)
    const karat21 = karats.find((k) => k.karat === 21);
    const goldPound = {
      sellPrice: karat21?.sellPrice ? karat21.sellPrice * 8 : null,
      buyPrice: karat21?.buyPrice ? karat21.buyPrice * 8 : null,
    };

    // Get source info from the most recent record
    const sourceRecord = gold21 ?? goldEgp;
    const source = sourceRecord?.source ?? "iSagha.com";

    return NextResponse.json({
      karats,
      goldPound,
      source,
      fetchedAt: sourceRecord?.createdAt ?? new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching calculator prices:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch calculator prices: ${message}` },
      { status: 500 }
    );
  }
}
