import { NextResponse } from "next/server";

/**
 * /api/automation/run — Redirects to /api/cron/refresh-prices
 *
 * ALL reporting logic is in /api/cron/refresh-prices (single source of truth).
 * This prevents duplicate hourly reports.
 */
export async function GET() {
  return POST();
}

export async function POST() {
  try {
    // Use the same origin to call the cron endpoint
    const cronUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/cron/refresh-prices`
      : "http://localhost:3000/api/cron/refresh-prices";

    const response = await fetch(cronUrl);
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[automation] Error:", error);
    return NextResponse.json(
      { error: "Failed to run automation" },
      { status: 500 }
    );
  }
}
