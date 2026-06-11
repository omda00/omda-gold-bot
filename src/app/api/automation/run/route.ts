import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchAllPrices, savePriceRecord } from "@/lib/price-fetcher";
import { sendTelegramMessage } from "@/lib/telegram";
import { getConfig } from "@/lib/config-seeder";

/**
 * DEDUPLICATION: Check if a report was already sent recently.
 * Returns true if the last successful report of this type was < minMinutes ago.
 * This prevents sending the same report multiple times.
 */
async function wasReportSentRecently(type: string, minMinutes: number = 55): Promise<boolean> {
  const lastReport = await db.notificationLog.findFirst({
    where: { type, success: true },
    orderBy: { sentAt: "desc" },
  });

  if (!lastReport) return false;

  const minutesSince = (Date.now() - new Date(lastReport.sentAt).getTime()) / 60000;
  return minutesSince < minMinutes;
}

/**
 * Detect if USD/EGP has experienced a significant drop.
 */
function detectUsdDrop(
  currentRate: number,
  previousRate: number,
  threshold: number
): boolean {
  if (previousRate <= 0) return false;
  const changePercent = ((currentRate - previousRate) / previousRate) * 100;
  return changePercent <= -threshold;
}

/**
 * Send a message to ALL active Telegram users.
 */
async function notifyAllUsers(
  message: string,
  type: string,
  title: string
): Promise<{ sent: number; failed: number; total: number }> {
  const users = await db.telegramUser.findMany({ where: { active: true } });
  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const result = await sendTelegramMessage(user.botToken, user.chatId, message);

      await db.notificationLog.create({
        data: {
          type,
          title: `${title} - ${user.name}`,
          message,
          success: result.ok,
          error: result.error,
        },
      });

      if (result.ok) {
        sent++;
      } else {
        failed++;
        console.error(`[automation] Failed to send to ${user.name}: ${result.error}`);
      }
    } catch (err) {
      failed++;
      console.error(`[automation] Error sending to ${user.name}:`, err);
    }
  }

  return { sent, failed, total: users.length };
}

/**
 * Build a comprehensive hourly Telegram report
 */
function buildHourlyReport(params: {
  goldPrice: number;
  goldBuyPrice: number | null;
  goldSellPrice: number | null;
  goldChange: number;
  goldSource: string;
  allKarats: { karat: number; sellPrice: number; buyPrice: number | null; sellWorkmanship: number | null; buyWorkmanship: number | null; changeAmount: number | null; changePercent: number | null }[];
  goldPound: { sellPrice: number | null; buyPrice: number | null; sellWorkmanship: number | null; buyWorkmanship: number | null; changeAmount: number | null; changePercent: number | null } | null;
  usdEgpPrice: number;
  usdEgpChange: number;
  usdEgpSource: string;
}): string {
  const {
    goldPrice, goldBuyPrice, goldSellPrice, goldChange, goldSource,
    allKarats, goldPound, usdEgpPrice, usdEgpChange, usdEgpSource,
  } = params;

  const goldArrow = goldChange >= 0 ? "▲" : "▼";
  const usdArrow = usdEgpChange >= 0 ? "▲" : "▼";

  let report = "📊 <b>تحديث ساعة — أسعار الذهب والعملات</b>\n";
  report += `🕐 ${new Date().toLocaleString("ar-EG", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" })} بتوقيت مصر\n\n`;

  report += "🥇 <b>أسعار الذهب (ج.م/جرام):</b>\n";
  report += "━━━━━━━━━━━━━━━━━━\n";

  for (const kp of allKarats) {
    const sell = kp.sellPrice?.toLocaleString() || "—";
    const buy = kp.buyPrice?.toLocaleString() || "—";
    const line = `عيار ${kp.karat}: بيع ${sell} | شراء ${buy}`;
    report += `  ${line}\n`;
  }

  if (goldPound && (goldPound.sellPrice || goldPound.buyPrice)) {
    report += "\n🪙 <b>جنيه الذهب:</b>\n";
    const gpLine = `  بيع ${goldPound.sellPrice?.toLocaleString() || "—"} | شراء ${goldPound.buyPrice?.toLocaleString() || "—"}`;
    report += `${gpLine}\n`;
  }

  if (goldChange !== 0) {
    report += `\n📈 التغيير (عيار 21): ${goldArrow} ${Math.abs(goldChange).toFixed(2)}%\n`;
  }

  report += `\n💱 <b>USD/EGP:</b> ${usdEgpPrice.toFixed(2)} ج.م ${usdArrow} ${Math.abs(usdEgpChange).toFixed(2)}%\n`;
  report += `\n📌 المصادر: ${goldSource} + ${usdEgpSource}`;

  return report;
}

/**
 * GET /api/automation/run - Triggered by Vercel Cron or UptimeRobot
 */
export async function GET() {
  return POST();
}

/**
 * POST /api/automation/run - Run the full automation cycle:
 * 1. Fetch current prices
 * 2. Check USD/EGP drop
 * 3. Send Telegram notifications (DEDUPLICATED — only once per hour)
 */
export async function POST() {
  const results: {
    prices?: { gold?: { price: number; change: number }; usdEgp?: { price: number; change: number } };
    usdDrop?: boolean;
    notifications?: { type: string; sent: boolean; error?: string; details?: string }[];
    errors?: string[];
  } = {
    notifications: [],
    errors: [],
  };

  try {
    const automationEnabled = await getConfig("AUTOMATION_ENABLED");
    if (automationEnabled !== "true") {
      return NextResponse.json(
        { error: "Automation is not enabled. Enable it in config first." },
        { status: 400 }
      );
    }

    // Step 1: Fetch current prices
    let goldRecord;
    let usdEgpRecord;
    let allKaratsData: { karat: number; sellPrice: number; buyPrice: number | null; sellWorkmanship: number | null; buyWorkmanship: number | null; changeAmount: number | null; changePercent: number | null }[] = [];
    let goldPoundData: { sellPrice: number | null; buyPrice: number | null; sellWorkmanship: number | null; buyWorkmanship: number | null; changeAmount: number | null; changePercent: number | null } | null = null;

    try {
      const allPrices = await fetchAllPrices();

      if (!allPrices.gold && !allPrices.usdEgp) {
        throw new Error("Could not fetch any prices from any source");
      }

      allKaratsData = allPrices.allKarats || [];
      goldPoundData = allPrices.goldPound || null;

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

      const saved = await Promise.all(savePromises);
      goldRecord = allPrices.gold ? saved[0] as Awaited<ReturnType<typeof savePriceRecord>> : undefined;
      usdEgpRecord = allPrices.usdEgp ? saved[allPrices.gold ? 1 : 0] as Awaited<ReturnType<typeof savePriceRecord>> : undefined;

      results.prices = {
        gold: goldRecord ? { price: goldRecord.price, change: goldRecord.change ?? 0 } : undefined,
        usdEgp: usdEgpRecord ? { price: usdEgpRecord.price, change: usdEgpRecord.change ?? 0 } : undefined,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error fetching prices";
      results.errors?.push(`Price fetch failed: ${msg}`);
      return NextResponse.json({ ...results, error: "Price fetch failed" }, { status: 500 });
    }

    if (!goldRecord || !usdEgpRecord) {
      return NextResponse.json(
        { ...results, error: "Missing price data" },
        { status: 500 }
      );
    }

    // Step 2: Check USD/EGP drop
    const thresholdStr = await getConfig("USD_DROP_THRESHOLD");
    const threshold = thresholdStr ? parseFloat(thresholdStr) : 2;

    const previousUsdEgp = await db.priceRecord.findFirst({
      where: {
        symbol: "USD_EGP",
        id: { not: usdEgpRecord.id },
      },
      orderBy: { createdAt: "desc" },
    });

    let usdDropDetected = false;
    if (previousUsdEgp) {
      usdDropDetected = detectUsdDrop(usdEgpRecord.price, previousUsdEgp.price, threshold);
    }
    results.usdDrop = usdDropDetected;

    // =============================================
    // Step 3: HOURLY REPORTS are now handled ONLY by /api/cron/refresh-prices
    // This endpoint only fetches prices and detects USD drops.
    // Reports are sent from a SINGLE place to prevent duplicates.
    // =============================================
    results.notifications?.push({
      type: "info",
      sent: true,
      details: "التقارير الساعية يتم إرسالها من /api/cron/refresh-prices فقط — لمنع التكرار",
    });

    // Step 4: Send USD drop alert (critical — sent from here too but deduplicated)
    if (usdDropDetected) {
      const dropAlreadySent = await wasReportSentRecently("usd_drop_alert", 10);

      if (dropAlreadySent) {
        console.log("[automation] ⏭️ USD drop alert already sent recently — skipping");
      } else {
        const usdSource = usdEgpRecord.source || "multi-source";
        const dropMessage = "⚠️ <b>تنبيه نزول قوي لسعر الدولار</b>\n\n" +
          `💱 USD/EGP: ${usdEgpRecord.price.toFixed(2)} ج.م\n` +
          `📉 السابق: ${previousUsdEgp?.price.toFixed(2)} ج.م\n` +
          `📊 التغيير: ${usdEgpRecord.change?.toFixed(2)}%\n` +
          `🎯 الحد: ${threshold}%\n` +
          `📌 المصدر: ${usdSource}`;

        const activeUsers = await db.telegramUser.findMany({ where: { active: true } });

        if (activeUsers.length > 0) {
          const dropResult = await notifyAllUsers(dropMessage, "usd_drop_alert", "USD/EGP Drop Alert");
          results.notifications?.push({
            type: "usd_drop_alert",
            sent: dropResult.sent > 0,
            details: `تم الإرسال إلى ${dropResult.sent}/${dropResult.total} مستخدم`,
          });
        } else {
          const botToken = await getConfig("TELEGRAM_BOT_TOKEN");
          const chatId = await getConfig("TELEGRAM_CHAT_ID");

          if (botToken && chatId) {
            const dropSendResult = await sendTelegramMessage(botToken, chatId, dropMessage);
            results.notifications?.push({
              type: "usd_drop_alert",
              sent: dropSendResult.ok,
              error: dropSendResult.error,
            });

            await db.notificationLog.create({
              data: {
                type: "usd_drop_alert",
                title: "USD/EGP Drop Alert (Global Config)",
                message: dropMessage,
                success: dropSendResult.ok,
                error: dropSendResult.error,
              },
            });
          }
        }
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Error running automation:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    results.errors?.push(msg);
    return NextResponse.json(
      { ...results, error: "Automation run failed" },
      { status: 500 }
    );
  }
}
