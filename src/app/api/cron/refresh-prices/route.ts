import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fetchAllPrices,
  savePriceRecord,
  isRateLimited,
} from "@/lib/price-fetcher";
import { sendTelegramMessage } from "@/lib/telegram";
import { getConfig } from "@/lib/config-seeder";

// Karat symbol mapping
const KARAT_SYMBOLS: Record<number, string> = {
  24: "GOLD_24K_EGP",
  22: "GOLD_22K_EGP",
  21: "GOLD_21K_EGP",
  18: "GOLD_18K_EGP",
};

const GOLD_POUND_SYMBOL = "GOLD_POUND_EGP";

/**
 * Build a comprehensive hourly Telegram report with all karats, gold pound, and USD/EGP
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

  // Gold prices for all karats
  report += "🥇 <b>أسعار الذهب (ج.م/جرام):</b>\n";
  report += "━━━━━━━━━━━━━━━━━━\n";

  for (const kp of allKarats) {
    const sell = kp.sellPrice?.toLocaleString() || "—";
    const buy = kp.buyPrice?.toLocaleString() || "—";
    const line = `عيار ${kp.karat}: بيع ${sell} | شراء ${buy}`;
    report += `  ${line}\n`;
  }

  // Gold pound
  if (goldPound && (goldPound.sellPrice || goldPound.buyPrice)) {
    report += "\n🪙 <b>جنيه الذهب:</b>\n";
    const gpLine = `  بيع ${goldPound.sellPrice?.toLocaleString() || "—"} | شراء ${goldPound.buyPrice?.toLocaleString() || "—"}`;
    report += `${gpLine}\n`;
  }

  // Gold 21 change indicator
  if (goldChange !== 0) {
    report += `\n📈 التغيير (عيار 21): ${goldArrow} ${Math.abs(goldChange).toFixed(2)}%\n`;
  }

  // USD/EGP
  report += `\n💱 <b>USD/EGP:</b> ${usdEgpPrice.toFixed(2)} ج.م ${usdArrow} ${Math.abs(usdEgpChange).toFixed(2)}%\n`;

  // Sources
  report += `\n📌 المصادر: ${goldSource} + ${usdEgpSource}`;

  return report;
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
        console.error(`[cron] Failed to send to ${user.name}: ${result.error}`);
      }
    } catch (err) {
      failed++;
      console.error(`[cron] Error sending to ${user.name}:`, err);
    }
  }

  return { sent, failed, total: users.length };
}

/**
 * Check if we should send an hourly report now.
 * Returns true if the last hourly_report was sent more than 55 minutes ago.
 */
async function shouldSendHourlyReport(): Promise<boolean> {
  const lastReport = await db.notificationLog.findFirst({
    where: { type: "hourly_report", success: true },
    orderBy: { sentAt: "desc" },
  });

  if (!lastReport) {
    // No report ever sent — send one now
    return true;
  }

  const minutesSinceLastReport = (Date.now() - new Date(lastReport.sentAt).getTime()) / 60000;
  return minutesSinceLastReport >= 55;
}

/**
 * GET /api/cron/refresh-prices - Cron: Refresh prices AND auto-send hourly reports
 *
 * Called by UptimeRobot every 30 minutes.
 * - Always refreshes prices from the web
 * - Automatically sends Telegram hourly report if 55+ minutes since last report
 * - This ensures reports are sent every hour even without a separate automation cron
 */
export async function GET() {
  try {
    console.log("[cron/refresh-prices] 🔄 Starting price refresh...");

    const automationEnabled = await getConfig("AUTOMATION_ENABLED");

    const allPrices = await fetchAllPrices();

    // Save whatever we got from the web
    if (allPrices.gold || allPrices.usdEgp || allPrices.allKarats.length > 0) {
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

      // Save all karat prices
      for (const karatPrice of allPrices.allKarats) {
        const symbol = KARAT_SYMBOLS[karatPrice.karat];
        if (symbol) {
          savePromises.push(
            savePriceRecord(symbol, karatPrice.sellPrice, "EGP", "iSagha.com", {
              buyPrice: karatPrice.buyPrice ?? undefined,
              sellPrice: karatPrice.sellPrice,
              sellWorkmanship: karatPrice.sellWorkmanship ?? undefined,
              buyWorkmanship: karatPrice.buyWorkmanship ?? undefined,
              changeAmount: karatPrice.changeAmount ?? undefined,
              changePercent: karatPrice.changePercent ?? undefined,
            })
          );
        }
      }

      // Save gold pound prices
      if (allPrices.goldPound && allPrices.goldPound.sellPrice) {
        savePromises.push(
          savePriceRecord(GOLD_POUND_SYMBOL, allPrices.goldPound.sellPrice, "EGP", "iSagha.com", {
            buyPrice: allPrices.goldPound.buyPrice ?? undefined,
            sellPrice: allPrices.goldPound.sellPrice,
            sellWorkmanship: allPrices.goldPound.sellWorkmanship ?? undefined,
            buyWorkmanship: allPrices.goldPound.buyWorkmanship ?? undefined,
            changeAmount: allPrices.goldPound.changeAmount ?? undefined,
            changePercent: allPrices.goldPound.changePercent ?? undefined,
          })
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

    console.log(
      `[cron/refresh-prices] ✅ Refresh complete: gold=${gold?.sellPrice ?? "N/A"}, usdEgp=${usdEgp?.price ?? "N/A"}`
    );

    // ========================================
    // Auto-send hourly report if needed
    // ========================================
    let reportSent = false;
    let reportDetails = "";

    if (automationEnabled === "true" && gold && usdEgp) {
      const shouldSend = await shouldSendHourlyReport();

      if (shouldSend) {
        console.log("[cron/refresh-prices] 📨 55+ minutes since last report — sending hourly report...");

        const allKarats = allPrices.allKarats || [];
        const goldPound = allPrices.goldPound || null;

        const hourlyReport = buildHourlyReport({
          goldPrice: gold.price,
          goldBuyPrice: gold.buyPrice,
          goldSellPrice: gold.sellPrice,
          goldChange: gold.change ?? 0,
          goldSource: gold.source || "multi-source",
          allKarats,
          goldPound,
          usdEgpPrice: usdEgp.price,
          usdEgpChange: usdEgp.change ?? 0,
          usdEgpSource: usdEgp.source || "multi-source",
        });

        const activeUsers = await db.telegramUser.findMany({ where: { active: true } });

        if (activeUsers.length > 0) {
          const result = await notifyAllUsers(hourlyReport, "hourly_report", "Hourly Price Report");
          reportSent = result.sent > 0;
          reportDetails = `تم الإرسال إلى ${result.sent}/${result.total} مستخدم`;
          console.log(`[cron/refresh-prices] 📨 Report sent: ${result.sent}/${result.total}`);
        } else {
          // Fallback to global config
          const botToken = await getConfig("TELEGRAM_BOT_TOKEN");
          const chatId = await getConfig("TELEGRAM_CHAT_ID");

          if (botToken && chatId) {
            const sendResult = await sendTelegramMessage(botToken, chatId, hourlyReport);
            reportSent = sendResult.ok;
            reportDetails = sendResult.ok ? "تم الإرسال عبر الإعدادات العامة" : `فشل: ${sendResult.error}`;

            await db.notificationLog.create({
              data: {
                type: "hourly_report",
                title: "Hourly Price Report (Auto-Cron)",
                message: hourlyReport,
                success: sendResult.ok,
                error: sendResult.error,
              },
            });

            console.log(`[cron/refresh-prices] 📨 Report via global config: ${sendResult.ok ? "success" : sendResult.error}`);
          } else {
            reportDetails = "لا يوجد مستخدمين مسجلين";
          }
        }
      } else {
        console.log("[cron/refresh-prices] ⏭️ Last report was < 55 min ago — skipping report");
      }
    } else if (automationEnabled !== "true") {
      console.log("[cron/refresh-prices] ⏭️ Automation disabled — skipping report");
    }

    return NextResponse.json({
      success: true,
      fetched: {
        gold: allPrices.gold !== null,
        usdEgp: allPrices.usdEgp !== null,
        karats: allPrices.allKarats.length,
        goldPound: allPrices.goldPound !== null,
      },
      prices: {
        gold: gold?.sellPrice ?? null,
        usdEgp: usdEgp?.price ?? null,
      },
      hourlyReport: {
        sent: reportSent,
        details: reportDetails || "Not needed yet",
      },
      rateLimited: isRateLimited(),
    });
  } catch (error) {
    console.error("[cron/refresh-prices] ❌ Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
