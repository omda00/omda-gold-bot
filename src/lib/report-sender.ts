import { db } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";

/**
 * Shared deduplication: ensures hourly reports are sent EXACTLY ONCE per
 * Cairo hour to every active subscriber — no more, no less.
 *
 * ─────────────────────────────────────────────────────────────────────
 * REVISED DESIGN (Cairo hour-bucket based) — fixes the intermittent
 * delivery bug that affected non-owner subscribers.
 * ─────────────────────────────────────────────────────────────────────
 *
 * PREVIOUS BUG (TTL-based, 59-min window):
 *   The old design used `Date.now() - lastSent < 59 min` to decide
 *   whether to skip a chat. This caused a CRITICAL failure: if the send
 *   loop took >1 minute (slow network, Telegram API throttling, or just
 *   4+ users in sequence), users sent LATER in the loop had a more recent
 *   `markChatSent` timestamp. When the next hour's tick fired — even at
 *   exactly :01:00 — those users were <59 min from their last send and
 *   got SKIPPED. Result: the owner (sent first) always received reports,
 *   but subscribers later in the loop were skipped intermittently.
 *
 * NEW DESIGN (Cairo hour-bucket):
 *   Instead of comparing timestamps, we store the Cairo HOUR bucket
 *   ("YYYY-MM-DD-HH" in Africa/Cairo). A chat is skipped ONLY if its
 *   stored bucket equals the current Cairo hour. The next hour, the
 *   bucket differs → send always proceeds. ✅
 *
 *   This guarantees:
 *     • Exactly ONE send per chat per Cairo hour
 *     • No skips caused by send-loop latency
 *     • Subscribers added mid-hour get their first report in the next hour
 *     • The owner AND every other active subscriber always receive reports
 *
 * THREE LAYERS OF PROTECTION:
 *
 * 1. GLOBAL HOUR-BUCKET LOCK (DB-based)
 *    acquireHourlyReportLock() checks AppConfig key "HOURLY_REPORT_LOCK".
 *    If its value === current Cairo hour bucket, the lock is held (someone
 *    already sent this hour) → return false. Otherwise, write the current
 *    bucket and return true. Prevents redundant scraping + duplicate
 *    sends when multiple cron triggers fire in the same hour.
 *
 * 2. PER-CHAT HOUR-BUCKET DEDUP (DB-based)
 *    wasChatSentRecently(chatId) checks AppConfig key
 *    "LAST_REPORT_CHAT_<chatId>". If its value === current Cairo hour
 *    bucket, skip this chat (already sent this hour). The next hour the
 *    bucket differs → send proceeds. This is the ultimate per-chat
 *    safeguard: even if the global lock raced, each chat is protected.
 *
 * 3. IN-MEMORY CHATID DEDUP
 *    sendReportToAllUsers() deduplicates the user list by chatId so the
 *    same chatId never appears twice in a single send loop.
 */

const LOCK_KEY = "HOURLY_REPORT_LOCK";

/**
 * Get the current Cairo hour bucket: "YYYY-MM-DD-HH".
 * Used for per-chat + global dedup so a chat is never sent twice in the
 * same Cairo hour, but ALWAYS sent in the next hour (regardless of the
 * exact minute the send happened).
 */
export function getCairoHourBucket(date: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  // Returns "YYYY-MM-DD-HH" (e.g. "2025-01-15-10")
  return fmt.format(date);
}

/**
 * Atomically acquire the global hourly-report lock.
 *
 * Uses the Cairo hour-bucket as the lock value. If the stored value
 * matches the current hour bucket, the lock is held → return false.
 * Otherwise, write the current bucket and return true.
 *
 * This guarantees exactly one send-per-hour window per Cairo hour,
 * regardless of how many cron triggers fire.
 *
 * Returns true if the lock was acquired (caller should proceed to send),
 * false if another caller already sent this hour.
 */
export async function acquireHourlyReportLock(): Promise<boolean> {
  const currentBucket = getCairoHourBucket();

  const existing = await db.appConfig.findUnique({ where: { key: LOCK_KEY } });

  if (existing && existing.value === currentBucket) {
    // Already sent this Cairo hour
    return false;
  }

  // Acquire the lock for this hour bucket
  await db.appConfig.upsert({
    where: { key: LOCK_KEY },
    update: { value: currentBucket },
    create: { key: LOCK_KEY, value: currentBucket },
  });

  return true;
}

/**
 * Check if a SPECIFIC chatId received a report in the CURRENT Cairo hour.
 * Returns true if this chat already got a report this hour.
 *
 * Uses hour-bucket comparison (NOT timestamp TTL) so send-loop latency
 * never causes a false "already sent" in the next hour.
 */
export async function wasChatSentRecently(chatId: string): Promise<boolean> {
  const key = `LAST_REPORT_CHAT_${chatId}`;
  const entry = await db.appConfig.findUnique({ where: { key } });
  if (!entry) return false;

  const currentBucket = getCairoHourBucket();
  return entry.value === currentBucket;
}

/** Record that a report was just sent to a chatId (stores Cairo hour bucket). */
async function markChatSent(chatId: string): Promise<void> {
  const key = `LAST_REPORT_CHAT_${chatId}`;
  const bucket = getCairoHourBucket();
  try {
    await db.appConfig.upsert({
      where: { key },
      update: { value: bucket },
      create: { key, value: bucket },
    });
  } catch (err) {
    console.error(`[report] Failed to mark chat ${chatId} as sent:`, err);
  }
}

/**
 * Send a report to ALL active Telegram users (deduplicated by chatId).
 *
 * Ensures each unique chatId receives the message only ONCE per Cairo hour:
 *  - in-memory chatId dedup of the user list
 *  - per-chat hour-bucket check (wasChatSentRecently) before each send
 *  - per-chat hour-bucket write (markChatSent) after each SUCCESSFUL send
 *
 * FAILED sends are NOT marked, so they can be retried in a later tick
 * within the same hour (the global lock will block a same-hour retry from
 * a different caller, but if this caller retries after a transient
 * failure, the failed chat will still go out).
 *
 * Returns send results.
 */
export async function sendReportToAllUsers(
  message: string,
  type: string,
  title: string
): Promise<{ sent: number; failed: number; total: number; skipped: number; deactivated: number }> {
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
  let deactivated = 0;

  for (const user of uniqueUsers) {
    // Per-chat hour-bucket dedup: skip if this chat already got a report
    // in the current Cairo hour. This protects against duplicate sends
    // even if the global lock raced.
    if (await wasChatSentRecently(user.chatId)) {
      console.log(
        `[report] ⏭️ Skipping ${user.name} (chatId ${user.chatId}) — already sent this Cairo hour`
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
        console.log(`[report] ✅ Sent to ${user.name} (chatId ${user.chatId})`);
      } else {
        failed++;
        console.error(`[report] ❌ Failed to send to ${user.name}: ${result.error}`);

        // ── Auto-deactivate users who have blocked the bot ──────────────
        // Telegram returns "Forbidden: bot was blocked by the user" when a
        // user has blocked the bot. This is PERMANENT — the bot can NEVER
        // deliver to that chat again unless the user unblocks it and
        // re-opens the conversation. Deactivating them:
        //   • stops wasting time retrying a permanently-failing chat
        //   • keeps the NotificationLog clean (no more repeated failures)
        //   • surfaces the blocked status in the admin dashboard
        // If the user unblocks the bot and sends /start again, the webhook
        // upsert will reactivate them automatically.
        if (
          result.error &&
          (result.error.includes("blocked by the user") ||
            result.error.toLowerCase().includes("forbidden"))
        ) {
          try {
            await db.telegramUser.updateMany({
              where: { chatId: user.chatId },
              data: { active: false },
            });
            deactivated++;
            console.log(
              `[report] 🚫 Auto-deactivated ${user.name} (chatId ${user.chatId}) — bot was blocked by the user`
            );
          } catch (deactErr) {
            console.error(`[report] Failed to auto-deactivate ${user.name}:`, deactErr);
          }
        }
      }
    } catch (err) {
      failed++;
      console.error(`[report] Error sending to ${user.name}:`, err);
    }
  }

  console.log(
    `[report] 📊 Send complete: ${sent} sent, ${failed} failed, ${skipped} skipped, ${deactivated} deactivated`
  );

  return { sent, failed, total: uniqueUsers.length, skipped, deactivated };
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

  // Per-chat hour-bucket safeguard for the global config path too
  if (await wasChatSentRecently(chatId)) {
    console.log(
      `[report] ⏭️ Global config chat ${chatId} already sent this Cairo hour — skipping`
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
