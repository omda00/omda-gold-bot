import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { getConfig } from "@/lib/config-seeder";
import { sendTelegramMessage } from "@/lib/telegram";
import {
  fetchAllPrices,
  savePriceRecord,
} from "@/lib/price-fetcher";
import { buildHourlyReport } from "@/lib/report-sender";

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
 * MODES:
 *   ?test=true  → TEST mode: scrape prices + send ONLY to the owner
 *                 (chatId 750182271). Bypasses the dedup lock so it can be
 *                 run any time without affecting the hourly schedule.
 *   (default)   → Production mode: redirect to /api/cron/refresh-prices
 *                 which uses the 3-layer hour-bucket dedup system to send
 *                 to ALL active subscribers exactly once per Cairo hour.
 */
async function checkAuth(): Promise<boolean> {
  return await getAdminSession();
}

/** The sole owner / admin — test messages go ONLY to this chatId. */
const OWNER_CHAT_ID = "750182271";

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

  const requestUrl = new URL(request.url);
  const isTestMode = requestUrl.searchParams.get("test") === "true";

  // ──────────────────────────────────────────────────────────
  // TEST MODE: send to the owner ONLY (750182271)
  // ──────────────────────────────────────────────────────────
  if (isTestMode) {
    try {
      console.log("[automation/run] 🧪 TEST mode — sending to owner only");

      const botToken = await getConfig("TELEGRAM_BOT_TOKEN");
      if (!botToken) {
        return NextResponse.json(
          { success: false, error: "TELEGRAM_BOT_TOKEN not configured" },
          { status: 500 }
        );
      }

      // Fetch fresh prices
      const allPrices = await fetchAllPrices();

      if (allPrices.gold || allPrices.usdEgp) {
        const savePromises: Promise<unknown>[] = [];
        if (allPrices.gold) {
          savePromises.push(
            savePriceRecord("GOLD_EGP", allPrices.gold.price, "EGP", allPrices.gold.source, {
              buyPrice: allPrices.gold.buyPrice,
              sellPrice: allPrices.gold.sellPrice,
            })
          );
        }
        if (allPrices.usdEgp) {
          savePromises.push(
            savePriceRecord("USD_EGP", allPrices.usdEgp.price, "EGP", allPrices.usdEgp.source)
          );
        }
        await Promise.all(savePromises);
      }

      const gold = await db.priceRecord.findFirst({
        where: { symbol: "GOLD_EGP" },
        orderBy: { createdAt: "desc" },
      });
      const usdEgp = await db.priceRecord.findFirst({
        where: { symbol: "USD_EGP" },
        orderBy: { createdAt: "desc" },
      });

      if (!gold || !usdEgp) {
        return NextResponse.json(
          { success: false, error: "لم يتم العثور على الأسعار" },
          { status: 500 }
        );
      }

      const message = buildHourlyReport({
        goldPrice: gold.price,
        goldBuyPrice: gold.buyPrice,
        goldSellPrice: gold.sellPrice,
        goldChange: gold.change ?? 0,
        goldSource: gold.source || "multi-source",
        allKarats: allPrices.allKarats || [],
        goldPound: allPrices.goldPound || null,
        usdEgpPrice: usdEgp.price,
        usdEgpChange: usdEgp.change ?? 0,
        usdEgpSource: usdEgp.source || "multi-source",
      });

      // Prepend a TEST banner so the owner knows this is a test
      const testMessage = `🧪 <b>رسالة تجريبية — للمالك فقط</b>\n\n${message}`;

      const result = await sendTelegramMessage(botToken, OWNER_CHAT_ID, testMessage);

      await db.notificationLog.create({
        data: {
          type: "test_report_owner",
          title: "Test Report (Owner Only)",
          message: testMessage,
          success: result.ok,
          error: result.error,
        },
      });

      if (result.ok) {
        console.log("[automation/run] 🧪 ✅ Test message sent to owner");
        return NextResponse.json({
          success: true,
          test: true,
          recipient: `owner (${OWNER_CHAT_ID})`,
          details: "تم إرسال الرسالة التجريبية للمالك فقط",
        });
      } else {
        console.error("[automation/run] 🧪 ❌ Test message failed:", result.error);
        return NextResponse.json(
          {
            success: false,
            test: true,
            error: result.error || "فشل الإرسال",
          },
          { status: 500 }
        );
      }
    } catch (error) {
      console.error("[automation/run] 🧪 Test mode error:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Test mode failed",
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 500 }
      );
    }
  }

  // ──────────────────────────────────────────────────────────
  // PRODUCTION MODE: redirect to /api/cron/refresh-prices
  // ──────────────────────────────────────────────────────────
  try {
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
