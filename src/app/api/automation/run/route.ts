import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";

/**
 * /api/automation/run — Admin-only manual trigger
 *
 * SECURITY:
 * This endpoint performs TWO expensive/dangerous actions:
 *   1. Scrapes external gold-price websites (iSagha, etc.) and writes to DB.
 *   2. Sends a Telegram message to ALL registered customers immediately.
 *
 * Because of (2), it MUST NOT be callable by anonymous visitors — otherwise
 * any visitor (or attacker with a script) could spam all your customers with
 * unscheduled messages, or trigger repeated web-scraping that gets the
 * server IP banned.
 *
 * AUTH POLICY:
 *   - Admin session cookie (set via /api/auth/admin login) → allowed.
 *     This covers: the dashboard "تشغيل الأتمتة" button (admin only) AND
 *     the internal hourly schedulers (instrumentation.ts + cron-service),
 *     which obtain an admin token via the password and pass the cookie.
 *   - No valid admin session → 401 Unauthorized.
 *
 * The actual reporting logic still lives in /api/cron/refresh-prices
 * (single source of truth with the 3-layer dedup system). This handler
 * is now just an authenticated redirect to it.
 */
async function checkAuth(): Promise<boolean> {
  return await getAdminSession();
}

export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  // ── Auth gate ──────────────────────────────────────────────
  const isAdmin = await checkAuth();
  if (!isAdmin) {
    return NextResponse.json(
      {
        success: false,
        error: "غير مصرح — هذه العملية للمسؤول فقط",
      },
      { status: 401 }
    );
  }

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
