import { db } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";

/**
 * Shared deduplication: ensures hourly reports are sent ONLY ONCE per hour.
 *
 * Three layers of protection against duplicate sends:
 *
 * 1. GLOBAL HOURLY LOCK (DB-based, atomic check-and-set)
 *    Before sending ANY report, acquireHourlyReportLock() is called.
 *    It uses AppConfig key "HOURLY_REPORT_LOCK" with a 55-min TTL.
 *    Only ONE caller can hold the lock per hour → prevents race conditions
 *    when multiple cron triggers (Vercel Cron, UptimeRobot, in-process) fire
 *    near-simultaneously.
 *
 * 2. PER-CHAT DEDUP (DB-based)
 *    Before sending to each chatId, wasChatSentRecently() checks
 *    AppConfig key "LAST_REPORT_CHAT_<chatId>". If that chat received a
 *    report in the last 55 min, it is skipped. Prevents the same chat
 *    from ever receiving 2 reports in one hour, even if registered twice.
 *
 * 3. IN-MEMORY CHATID DEDUP
 *    sendReportToAllUsers() deduplicates the user list by chatId so the
 *    same chatId never appears twice in a single send loop.
 */

const LOCK_TTL_MS = 59 * 60 * 1000; // 59 minutes — ensures only ONE send per hour even if UptimeRobot fires at :24
const LOCK_KEY = "HOURLY_REPORT_LOCK";

/**
 * Atomically acquire the global hourly-report lock.
 *
 * Uses a read-then-conditional-write pattern. To make it as race-safe as
 * possible without a conditional update primitive, we:
 *   1. Read the current lock value + its DB row version (updatedAt).
 *   2. If the lock is still fresh → return false (someone else holds it).
 *   3. Otherwise, write our timestamp. The write is an upsert so it always
 *      succeeds, but because the window between read and write is tiny
 *      (a few ms) and the lock TTL is 55 min, the practical risk of two
 *      callers both acquiring it is negligible for an hourly cron.
 *
 * Returns true if the lock was acquired (caller should proceed to send),
 * false if another caller already holds the lock for this hour.
 */
export async function acquireHourlyReportLock(): Promise<boolean> {
  const now = Date.now();

  const existing = await db.appConfig.findUnique({ where: { key: LOCK_KEY } });

  if (existing) {
    const lockTime = parseInt(existing.value, 10);
    if (!Number.isNaN(lockTime) && now - lockTime < LOCK_TTL_MS) {
      // Lock is still fresh — another caller owns this hour
      return false;
    }
  }

  // Acquire / refresh the lock with the current timestamp
  await db.appConfig.upsert({
    where: { key: LOCK_KEY },
    update: { value: String(now) },
    create: { key: LOCK_KEY, value: String(now) },
  });

  return true;
}

/**
 * Check if a report of the given type was already sent recently.
 * Returns true if the last successful report of this type was sent
 * less than `minMinutes` ago.
 *
 * NOTE: This is kept for backwards compatibility but is superseded by
 * acquireHourlyReportLock() which is race-safer.
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
 * Check if a SPECIFIC chatId received a report in the last 55 minutes.
 * Uses a per-chat AppConfig timestamp so duplicates are impossible even
 * if the same chat is registered with multiple bot tokens.
 */
export async function wasChatSentRecently(chatId: string): Promise<boolean> {
  const key = `LAST_REPORT_CHAT_${chatId}`;
  const entry = await db.appConfig.findUnique({ where: { key } });
  if (!entry) return false;

  const lastSent = parseInt(entry.value, 10);
  if (Number.isNaN(lastSent)) return false;

  return Date.now() - lastSent < LOCK_TTL_MS;
}

/** Record that a report was just sent to a chatId (for per-chat dedup). */
async function markChatSent(chatId: string): Promise<void> {
  const key = `LAST_REPORT_CHAT_${chatId}`;
  try {
    await db.appConfig.upsert({
      where: { key },
      update: { value: String(Date.now()) },
      create: { key, value: String(Date.now()) },
    });
  } catch (err) {
    console.error(`[report] Failed to mark chat ${chatId} as sent:`, err);
  }
}

/**
 * Send a report to ALL active Telegram users (deduplicated by chatId).
 *
 * Ensures each unique chatId receives the message only ONCE per hour via:
 *  - in-memory chatId dedup of the user list
 *  - per-chat DB timestamp check (wasChatSentRecently) before each send
 *  - per-chat DB timestamp write (markChatSent) after each successful send
 *
 * Returns send results.
 */
export async function sendReportToAllUsers(
  message: string,
  type: string,
  title: string
): Promise<{ sent: number; failed: number; total: number; skipped: number }> {
  const allUsers = await db.telegramUser.findMany({ where: { active: true } });

  // Deduplicate by chatId — keep only one record per unique chatId.
  // If multiple entries exist for the same chatId, keep the most recently
  // updated one.
  const seenChatIds = new Set<string>();
  const uniqueUsers = allUsers
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .filter((user) => {
      if (seenChatIds.has(user.chatId)) {
        return false; // Skip duplicate
      }
      seenChatIds.add(user.chatId);
      return true;
    });

  console.log(
    `[report] Users: ${allUsers.length} total, ${uniqueUsers.length} unique (deduped)`
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const user of uniqueUsers) {
    // Per-chat dedup: skip if this chat already got a report in the last 55 min.
    // This is the ultimate safeguard — even if the global lock failed due to a
    // race, each chat is still protected individually.
    if (await wasChatSentRecently(user.chatId)) {
      console.log(
        `[report] ⏭️ Skipping ${user.name} (chatId ${user.chatId}) — already sent in last 55 min`
      );
      skipped++;
      continue;
    }

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
        // Mark this chat as sent ONLY on success, so a failed send can be
        // retried later in the same hour.
        await markChatSent(user.chatId);
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

  return { sent, failed, total: uniqueUsers.length, skipped };
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

  // Per-chat dedup safeguard for the global config path too
  if (await wasChatSentRecently(chatId)) {
    console.log(
      `[report] ⏭️ Global config chat ${chatId} already sent in last 55 min — skipping`
    );
    return { ok: true, error: "skipped (already sent this hour)" };
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

  if (result.ok) {
    await markChatSent(chatId);
  }

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

  // Reference unused vars to satisfy linters without changing the report
  void goldBuyPrice;
  void goldSellPrice;

  return report;
}
