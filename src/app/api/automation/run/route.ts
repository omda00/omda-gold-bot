import { NextRequest, NextResponse } from "next/server";

/**
 * /api/automation/run — Redirects to /api/cron/refresh-prices
 *
 * ALL reporting logic lives in /api/cron/refresh-prices (single source of
 * truth). That endpoint has a 3-layer dedup system:
 *   1. Atomic DB lock (acquireHourlyReportLock — 55 min TTL)
 *   2. Per-chat dedup (wasChatSentRecently)
 *   3. In-memory chatId dedup
 *
 * By redirecting here instead of sending directly, we GUARANTEE that no
 * matter how many external triggers (Vercel Cron, UptimeRobot, manual
 * calls) hit EITHER endpoint, only ONE message per chat per hour is sent.
 *
 * The old deployed version of this endpoint sent reports independently
 * WITHOUT any dedup — causing duplicate messages. This redirect fixes that.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  try {
    // Build the URL for the internal call using the request's origin.
    // This is more reliable than VERCEL_URL on Vercel serverless.
    const requestUrl = new URL(request.url);
    const cronUrl = `${requestUrl.origin}/api/cron/refresh-prices`;

    console.log(`[automation/run] → redirecting to ${cronUrl}`);
    const response = await fetch(cronUrl, {
      // Allow up to 2 minutes for price fetch + Telegram sends
      signal: AbortSignal.timeout(120000),
    });

    const data = await response.json();
    return NextResponse.json({
      ...data,
      via: "automation/run → cron/refresh-prices",
    });
  } catch (error) {
    console.error("[automation/run] Error redirecting to cron:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to redirect to cron/refresh-prices",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
