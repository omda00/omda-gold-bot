import { db } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";

/**
 * Shared deduplication: ensures hourly reports are sent ONLY ONCE per hour.
 * 
 * All endpoints (cron/refresh-prices, automation/run) must call this
 * instead of sending directly. It checks the notification log to prevent
 * duplicate sends within the same hour window.
 */

/**
 * Check if a report of the given type was already sent recently.
 * Returns true if the last successful report of this type was sent
 * less than `minMinutes` ago.
 */
export async function wasReportSentRecently(
  type: string,
  minMinutes: number = 55
): Promise<boolean> {
  const lastReport = await db.notificationLog.findFirst({
    where: { type, success: true },
    orderBy: { sentAt: "desc" },
  });

  if (!lastReport) return false;

  const minutesSince = (Date.now() - new Date(lastReport.sentAt).getTime()) / 60000;
  return minutesSince < minMinutes;
}

/**
 * Send a report to ALL active Telegram users (deduplicated).
 * Returns send results.
 */
export async function sendReportToAllUsers(
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
        console.error(`[report] Failed to send to ${user.name}: ${result.error}`);
      }
    } catch (err) {
      failed++;
      console.error(`[report] Error sending to ${user.name}:`, err);
    }
  }

  return { sent, failed, total: users.length };
}

/**
 * Send a report via the global bot config (fallback for no registered users).
 */
export async function sendReportViaGlobalConfig(
  message: string,
  type: string,
  title: string
): Promise<{ ok: boolean; error?: string }> {
  const { getConfig } = await import("@/lib/config-seeder");
  const botToken = await getConfig("TELEGRAM_BOT_TOKEN");
  const chatId = await getConfig("TELEGRAM_CHAT_ID");

  if (!botToken || !chatId) {
    return { ok: false, error: "لا يوجد إعدادات عامة للتيليجرام" };
  }

  const result = await sendTelegramMessage(botToken, chatId, message);

  await db.notificationLog.create({
    data: {
      type,
      title: `${title} (Global Config)`,
      message,
      success: result.ok,
      error: result.error,
    },
  });

  return result;
}

/**
 * Build a comprehensive hourly Telegram report with all karats, gold pound, and USD/EGP
 */
export function buildHourlyReport(params: {
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
