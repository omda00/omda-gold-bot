import { NextResponse } from "next/server";

/**
 * /api/automation/run — Now simply redirects to /api/cron/refresh-prices
 *
 * Hourly reports are sent from ONE place only to prevent duplicates.
 * All reporting logic lives in /api/cron/refresh-prices with dedup.
 */
export async function GET() {
  return POST();
}

export async function POST() {
  try {
    // Forward the request to the cron endpoint which handles everything
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const response = await fetch(`${baseUrl}/api/cron/refresh-prices`);
    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error("[automation] Error forwarding to cron:", error);
    return NextResponse.json(
      { error: "Failed to run automation" },
      { status: 500 }
    );
  }
}
