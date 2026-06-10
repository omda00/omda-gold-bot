import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const DEFAULT_PLANS = [
  {
    priceRangeMin: 5700,
    priceRangeMax: 5900,
    action: "شراء قوي",
    expectedReturn: 40,
    label: "شراء قوي - نطاق 5,700-5,900",
    order: 1,
    active: true,
  },
  {
    priceRangeMin: 6100,
    priceRangeMax: 6300,
    action: "شراء",
    expectedReturn: 30,
    label: "شراء - نطاق 6,100-6,300",
    order: 2,
    active: true,
  },
  {
    priceRangeMin: 6300,
    priceRangeMax: 6800,
    action: "انتظار",
    expectedReturn: 0,
    label: "انتظار - نطاق 6,300-6,800",
    order: 3,
    active: true,
  },
  {
    priceRangeMin: 7000,
    priceRangeMax: 7200,
    action: "بيع 70%",
    expectedReturn: -30,
    label: "بيع 70% - نطاق 7,000-7,200",
    order: 4,
    active: true,
  },
  {
    priceRangeMin: 7500,
    priceRangeMax: null,
    action: "بيع 70%",
    expectedReturn: -50,
    label: "بيع 70% - فوق 7,500",
    order: 5,
    active: true,
  },
];

/**
 * POST /api/plan/seed - Seed the default investment plan
 */
export async function POST() {
  try {
    // Delete existing plans
    await db.investmentPlan.deleteMany();

    // Create default plans
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
