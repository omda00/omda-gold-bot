/**
 * Instrumentation — Starts the hourly Telegram report scheduler
 *
 * This runs ONCE when the Next.js server starts. It sets up a setInterval
 * that fires every 60 seconds and checks if the current UTC minute is :01.
 * When it is, the scheduler calls PRODUCTION /api/automation/run which
 * sends the hourly report to all registered Telegram users.
 *
 * WHY THIS APPROACH:
 * The production app (Vercel) has old code that gets triggered by both
 * Vercel Cron and UptimeRobot at different times, causing duplicate
 * messages. By having THIS scheduler fire at :01 UTC and call production
 * /api/automation/run (which has NO dedup in the old code), we ensure:
 *
 *   1. :01 UTC — scheduler → production /api/automation/run → SENDS + logs
 *   2. :24 UTC — UptimeRobot → production /api/cron/refresh-prices →
 *      wasReportSentRecently(55 min) → last send at :01 (23 min ago) →
 *      23 < 55 → SKIP
 *
 * Result: exactly ONE message per hour at :01 Cairo time.
 *
 * DEDUP SAFEGUARD:
 * Before sending, the scheduler checks production /api/logs for a
 * successful "hourly_report" in the last 55 minutes. If found, it skips.
 */

export async function register() {
  // Only run in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Only run in development (this is the local dev server scheduler)
  if (process.env.NODE_ENV !== "development") return;

  const PRODUCTION_URL = "https://omda-gold-bot.vercel.app";
  const ADMIN_PASSWORD = "908070";
  const DEDUP_MINUTES = 55;

  // Guard against double-registration (HMR in dev mode)
  const globalAny = globalThis as unknown as { __hourlySchedulerStarted?: boolean };
  if (globalAny.__hourlySchedulerStarted) {
    console.log("[scheduler] Already started, skipping registration");
    return;
  }
  globalAny.__hourlySchedulerStarted = true;

  let lastFiredHour = -1;
  let isSending = false;

  async function getAdminToken(): Promise<string | null> {
    try {
      const resp = await fetch(`${PRODUCTION_URL}/api/auth/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: ADMIN_PASSWORD }),
        signal: AbortSignal.timeout(10000),
      });
      const setCookie = resp.headers.get("set-cookie") || "";
      const match = setCookie.match(/admin_session=([^;]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  async function wasReportSentRecently(): Promise<boolean> {
    const token = await getAdminToken();
    if (!token) return false;
    try {
      const resp = await fetch(`${PRODUCTION_URL}/api/logs?limit=50`, {
        headers: { Cookie: `admin_session=${token}` },
        signal: AbortSignal.timeout(10000),
      });
      const data = await resp.json() as { logs?: Array<{ type: string; success: boolean; sentAt: string }> };
      const logs = data.logs || [];
      const now = Date.now();
      const cutoff = now - DEDUP_MINUTES * 60 * 1000;
      for (const log of logs) {
        if (log.type === "hourly_report" && log.success) {
          const sentAt = new Date(log.sentAt).getTime();
          if (sentAt > cutoff) {
            const minsAgo = Math.round((now - sentAt) / 60000);
            console.log(`[scheduler] ⏭️ Dedup: last send ${minsAgo} min ago — skipping`);
            return true;
          }
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  async function sendHourlyReport(): Promise<void> {
    if (isSending) return;
    isSending = true;
    try {
      const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
      console.log(`[scheduler] ⏰ [${cairoTime}] Firing production /api/automation/run...`);

      // Dedup check
      const recentlySent = await wasReportSentRecently();
      if (recentlySent) {
        console.log(`[scheduler] ⏭️ Skipped — recent send detected`);
        return;
      }

      const response = await fetch(`${PRODUCTION_URL}/api/automation/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(120000),
      });
      const data = await response.json() as {
        notifications?: Array<{ type: string; sent: boolean; details?: string }>;
        error?: string;
      };

      if (response.ok) {
        const notif = data.notifications?.[0];
        console.log(`[scheduler] ✅ Sent: ${notif?.details || "OK"}`);
      } else {
        console.error(`[scheduler] ❌ Failed: ${data.error}`);
      }
    } catch (err) {
      console.error(`[scheduler] ❌ Error:`, err instanceof Error ? err.message : String(err));
    } finally {
      isSending = false;
    }
  }

  // Check every 60 seconds
  const interval = setInterval(async () => {
    const now = new Date();
    const utcMinute = now.getUTCMinutes();
    const utcHour = now.getUTCHours();
    const hourKey = utcHour * 100 + utcMinute;

    // Fire when UTC minute is :01 (and we haven't fired this hour)
    if (utcMinute === 1 && hourKey !== lastFiredHour) {
      lastFiredHour = hourKey;
      await sendHourlyReport();
    }
  }, 60000);

  // Keep the interval alive
  interval.unref?.();

  const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
  console.log(`[scheduler] 🚀 Hourly scheduler started at ${cairoTime}`);
  console.log(`[scheduler] 📡 Target: ${PRODUCTION_URL}/api/automation/run`);
  console.log(`[scheduler] ⏰ Fires at :01 UTC every hour (= :01 Cairo every hour)`);
}
