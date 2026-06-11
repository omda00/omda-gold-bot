import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Gold Investment Strategy based on thorough PDF analysis (June 2026)
// Strategy covers buy/sell levels, DCA phases, and risk management until end of 2026
// 21 Karat gold price per gram in EGP
const DEFAULT_PLANS = [
  {
    priceRangeMin: 5700,
    priceRangeMax: 5900,
    action: "شراء قوي",
    expectedReturn: 40,
    label: "فرصة شراء قوية — دعم نادر (40% من الميزانية)",
    order: 1,
    active: true,
  },
  {
    priceRangeMin: 6100,
    priceRangeMax: 6300,
    action: "شراء تدريجي",
    expectedReturn: 30,
    label: "منطقة الشراء التدريجي الحالية (30% من الميزانية)",
    order: 2,
    active: true,
  },
  {
    priceRangeMin: 6300,
    priceRangeMax: 6800,
    action: "مراقبة فقط",
    expectedReturn: 0,
    label: "منطقة المراقبة — عدم الشراء حتى تصحيح أعمق",
    order: 3,
    active: true,
  },
  {
    priceRangeMin: 7000,
    priceRangeMax: 7200,
    action: "بيع جزئي 30%",
    expectedReturn: -30,
    label: "بيع 30% من المحفظة — جني أرباح جزئي",
    order: 4,
    active: true,
  },
  {
    priceRangeMin: 7500,
    priceRangeMax: null,
    action: "بيع نشط 50%",
    expectedReturn: -50,
    label: "بيع إضافي 50% — منطقة البيع النشط",
    order: 5,
    active: true,
  },
];

/**
 * POST /api/plan/seed - Seed the default investment plan
 */
export async function POST() {
  try {
    await db.investmentPlan.deleteMany();
    const plans = await db.investmentPlan.createMany({
      data: DEFAULT_PLANS,
    });

    return NextResponse.json({
      message: "Investment plan seeded successfully",
      count: plans.count,
    });
  } catch (error) {
    console.error("Error seeding investment plans:", error);
    return NextResponse.json(
      { error: "Failed to seed investment plans" },
      { status: 500 }
    );
  }
}
