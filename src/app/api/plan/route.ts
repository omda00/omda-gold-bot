import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/plan - Return investment plan entries ordered by `order`
 */
export async function GET() {
  try {
    const plans = await db.investmentPlan.findMany({
      orderBy: { order: "asc" },
    });
    return NextResponse.json(plans);
  } catch (error) {
    console.error("Error fetching investment plans:", error);
    return NextResponse.json(
      { error: "Failed to fetch investment plans" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/plan - Create or update plan entries
 * Body: array of InvestmentPlan objects (without id for new, with id for update)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!Array.isArray(body)) {
      return NextResponse.json(
        { error: "Request body must be an array of plan objects" },
        { status: 400 }
      );
    }

    const results = [];

    for (const plan of body) {
      if (plan.id) {
        // Update existing
        const updated = await db.investmentPlan.update({
          where: { id: plan.id },
          data: {
            priceRangeMin: plan.priceRangeMin,
            priceRangeMax: plan.priceRangeMax ?? null,
            action: plan.action,
            expectedReturn: plan.expectedReturn,
            label: plan.label,
            order: plan.order,
            active: plan.active,
          },
        });
        results.push(updated);
      } else {
        // Create new
        const created = await db.investmentPlan.create({
          data: {
            priceRangeMin: plan.priceRangeMin,
            priceRangeMax: plan.priceRangeMax ?? null,
            action: plan.action,
            expectedReturn: plan.expectedReturn,
            label: plan.label,
            order: plan.order,
            active: plan.active ?? true,
          },
        });
        results.push(created);
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Error updating investment plans:", error);
    return NextResponse.json(
      { error: "Failed to update investment plans" },
      { status: 500 }
    );
  }
}
