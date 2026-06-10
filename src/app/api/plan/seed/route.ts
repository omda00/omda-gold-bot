import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Investment plan based on gold price per gram (21 karat) in EGP
const DEFAULT_PLANS = [
  {
    priceRangeMin: 4000,
    priceRangeMax: 5000,
    action: "شراء قوي",
    expectedReturn: 40,
    label: "شراء قوي - ذهب أقل من 5,000 ج.م/جرام",
    order: 1,
    active: true,
  },
  {
    priceRangeMin: 5000,
    priceRangeMax: 5500,
    action: "شراء",
    expectedReturn: 30,
    label: "شراء - ذهب 5,000-5,500 ج.م/جرام",
    order: 2,
    active: true,
  },
  {
    priceRangeMin: 5500,
    priceRangeMax: 6500,
    action: "انتظار",
    expectedReturn: 0,
    label: "انتظار - ذهب 5,500-6,500 ج.م/جرام",
    order: 3,
    active: true,
  },
  {
    priceRangeMin: 6500,
    priceRangeMax: 7500,
    action: "بيع 70%",
    expectedReturn: -30,
    label: "بيع 70% - ذهب 6,500-7,500 ج.م/جرام",
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
