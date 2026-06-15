import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Smart Investment Strategy for Gold 21K in EGP
// These ranges are CONTINUOUS (no gaps) and cover all realistic price levels
// The smart signal system will analyze trends and match against these zones
// 21 Karat gold price per gram in EGP
const DEFAULT_PLANS = [
  {
    priceRangeMin: 0,
    priceRangeMax: 5500,
    action: "شراء قوي",
    expectedReturn: 50,
    label: "فرصة شراء نادرة — سعر متدنٍ جداً (50% من الميزانية)",
    order: 1,
    active: true,
  },
  {
    priceRangeMin: 5500,
    priceRangeMax: 6000,
    action: "شراء قوي",
    expectedReturn: 40,
    label: "فرصة شراء قوية — دعم قوي (40% من الميزانية)",
    order: 2,
    active: true,
  },
  {
    priceRangeMin: 6000,
    priceRangeMax: 6400,
    action: "شراء تدريجي",
    expectedReturn: 30,
    label: "منطقة الشراء التدريجي — دخول مرحلي (30% من الميزانية)",
    order: 3,
    active: true,
  },
  {
    priceRangeMin: 6400,
    priceRangeMax: 6900,
    action: "انتظار ومراقبة",
    expectedReturn: 5,
    label: "منطقة المراقبة — لا تتعجل بالشراء أو البيع",
    order: 4,
    active: true,
  },
  {
    priceRangeMin: 6900,
    priceRangeMax: 7300,
    action: "بيع جزئي",
    expectedReturn: -20,
    label: "بيع 30% من المحفظة — جني أرباح جزئي",
    order: 5,
    active: true,
  },
  {
    priceRangeMin: 7300,
    priceRangeMax: null,
    action: "بيع نشط",
    expectedReturn: -40,
    label: "بيع 50% — منطقة البيع النشط — أسعار مرتفعة",
    order: 6,
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
