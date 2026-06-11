import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/telegram-users/count - Get the count of active subscribers
 * Public endpoint - no auth required
 */
export async function GET() {
  try {
    const total = await db.telegramUser.count();
    const active = await db.telegramUser.count({
      where: { active: true },
    });

    return NextResponse.json({
      total,
      active,
    });
  } catch (error) {
    console.error("Error counting telegram users:", error);
    return NextResponse.json(
      { total: 0, active: 0 },
      { status: 500 }
    );
  }
}
