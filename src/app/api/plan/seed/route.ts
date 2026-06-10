import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Investment plan based on gold price per gram (21 karat) in EGP
// As specified by the user's investment strategy
const DEFAULT_PLANS = [
  {
    priceRangeMin: 5700,
    priceRangeMax: 5900,
    action: "شراء قوي",
    expectedReturn: 40,
    label: "شراء قوي - ذهب 5,700-5,900 ج.م/جرام",
    order: 1,
    active: true,
  },
  {
    priceRangeMin: 6100,
    priceRangeMax: 6300,
    action: "شراء",
    expectedReturn: 30,
    label: "شراء - ذهب 6,100-6,300 ج.م/جرام",
    order: 2,
    active: true,
  },
  {
    priceRangeMin: 6300,
    priceRangeMax: 6800,
    action: "انتظار",
    expectedReturn: 0,
    label: "انتظار - ذهب 6,300-6,800 ج.م/جرام",
    order: 3,
    active: true,
  },
  {
    priceRangeMin: 7000,
    priceRangeMax: 7200,
    action: "بيع 70%",
    expectedReturn: -30,
    label: "بيع 70% - ذهب 7,000-7,200 ج.م/جرام",
    order: 4,
    active: true,
  },
  {
    priceRangeMin: 7500,
    priceRangeMax: null,
    action: "بيع 70%",
    expectedReturn: -50,
    label: "بيع 70% - ذهب فوق 7,500 ج.م/جرام",
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
