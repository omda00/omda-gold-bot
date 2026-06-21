/**
 * Cron Service - Guarantees exactly ONE hourly Telegram report at :01 Cairo
 *
 * STRATEGY:
 * This service fires at :01 Cairo every hour and calls the PRODUCTION app's
 * /api/automation/run endpoint. That endpoint sends to ALL registered users
 * (owner + customers) and logs to the production NotificationLog.
 *
 * Because production's /api/cron/refresh-prices has a 55-minute dedup
 * (wasReportSentRecently), any subsequent trigger at ~:24 (UptimeRobot,
 * Vercel Cron) will be SKIPPED — ensuring only ONE message per hour.
 *
 * DEDUP SAFEGUARD:
 * Before calling /api/automation/run, this service checks production
 * /api/logs for a successful "hourly_report" in the last 55 minutes.
 * If found, it skips — preventing duplicates if the service restarts
 * or fires twice.
 */

import cron from "node-cron";

const PRODUCTION_URL = "https://omda-gold-bot.vercel.app";
const ADMIN_PASSWORD = "908070";
const DEDUP_MINUTES = 55;

// Track state
let lastRunTime: string | null = null;
let lastRunStatus: string | null = null;
let isRunning = false;
let totalRuns = 0;
let successRuns = 0;
let skipRuns = 0;

/**
 * Get admin session token from production
 */
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
  } catch (err) {
    console.error("Failed to get admin token:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Check if a successful hourly_report was sent in the last N minutes.
 * Uses the production /api/logs endpoint (requires admin auth).
 * Returns true if a recent send was found (should skip).
 */
async function wasReportSentRecently(): Promise<boolean> {
  const token = await getAdminToken();
  if (!token) {
    console.log("⚠️ Could not verify dedup (no admin token) — proceeding with send");
    return false;
  }

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
          console.log(`⏭️ Dedup: last successful send was ${minsAgo} min ago (< ${DEDUP_MINUTES} min) — skipping`);
          return true;
        }
      }
    }
    return false;
  } catch (err) {
    console.error("Dedup check failed:", err instanceof Error ? err.message : String(err));
    return false; // If we can't check, proceed with send
  }
}

/**
 * Check if automation is enabled on production
 */
async function isAutomationEnabled(): Promise<boolean> {
  try {
    const resp = await fetch(`${PRODUCTION_URL}/api/config`, {
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      const config = await resp.json() as Record<string, string>;
      return config.AUTOMATION_ENABLED === "true";
    }
  } catch {
    // If we can't reach config, assume enabled
  }
  return true;
}

/**
 * Call production /api/automation/run — sends hourly report to ALL users.
 *
 * AUTH: The production endpoint now requires an admin session cookie.
 * We obtain one via /api/auth/admin (using the admin password) and pass
 * it as a Cookie header. If token retrieval fails we still attempt the
 * call (production may still be running old, unauthenticated code), but
 * we log a warning because the new code will reject it with 401.
 *
 * DEDUP: we rely on the cron-service dedup check (wasReportSentRecently)
 * plus the production 55-min atomic lock to prevent double-sends.
 */
async function runAutomation(): Promise<boolean> {
  const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
  console.log(`⏰ [${cairoTime}] Calling production /api/automation/run...`);

  try {
    // Obtain admin session token for the auth-protected endpoint
    const adminToken = await getAdminToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (adminToken) {
      headers.Cookie = `admin_session=${adminToken}`;
    } else {
      console.warn(
        `⏰ [${cairoTime}] ⚠️ No admin token — /api/automation/run may reject with 401 on the new production code`
      );
    }

    const response = await fetch(`${PRODUCTION_URL}/api/automation/run`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(120000),
    });

    const data = await response.json() as {
      notifications?: Array<{ type: string; sent: boolean; details?: string; error?: string }>;
      error?: string;
    };

    if (response.ok) {
      console.log(`⏰ [${cairoTime}] ✅ Production automation completed`);
      if (data.notifications && Array.isArray(data.notifications)) {
        for (const n of data.notifications) {
          const status = n.sent ? "✅" : "❌";
          console.log(`⏰ [${cairoTime}] 📤 ${n.type}: ${status} ${n.details || n.error || ""}`);
        }
      }
      return true;
    } else {
      console.error(`⏰ [${cairoTime}] ❌ Production automation failed:`, data.error);
      return false;
    }
  } catch (error) {
    console.error(`⏰ [${cairoTime}] ❌ Automation error:`, error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Run the hourly report cycle with dedup protection
 */
async function runHourlyCycle(): Promise<void> {
  if (isRunning) {
    console.log("⏳ Already running, skipping...");
    return;
  }
  isRunning = true;
  totalRuns++;

  try {
    const enabled = await isAutomationEnabled();
    if (!enabled) {
      console.log("⏸️ Production automation is disabled. Skipping.");
      lastRunStatus = "skipped (automation disabled)";
      skipRuns++;
      return;
    }

    // DEDUP CHECK: skip if a successful report was sent in the last 55 min
    const recentlySent = await wasReportSentRecently();
    if (recentlySent) {
      lastRunStatus = "skipped (dedup)";
      skipRuns++;
      return;
    }

    const success = await runAutomation();
    lastRunTime = new Date().toISOString();
    lastRunStatus = success ? "success" : "error";
    if (success) successRuns++;
  } catch (error) {
    console.error("❌ Cycle error:", error instanceof Error ? error.message : String(error));
    lastRunTime = new Date().toISOString();
    lastRunStatus = "error";
  } finally {
    isRunning = false;
  }

  console.log(`📊 Stats: ${successRuns} sent, ${skipRuns} skipped, ${totalRuns} total runs`);
}

// =============================================
// Setup Cron Job — fires at :01 Cairo every hour
// =============================================
// :01 Cairo = :01 of every hour in UTC (shifted by 3h).
// Examples: 01:01 Cairo = 22:01 UTC, 02:01 Cairo = 23:01 UTC, etc.
// The user receives the message at HH:01 Cairo time.
cron.schedule("1 * * * *", async () => {
  const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
  console.log(`\n⏰ [${cairoTime}] === Hourly cron triggered (:01 Cairo) ===`);
  await runHourlyCycle();
}, { timezone: "Africa/Cairo" });

// =============================================
// Start
// =============================================
const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
console.log(`🚀 Cron Service started at ${cairoTime}`);
console.log(`📡 Production URL: ${PRODUCTION_URL}`);
console.log(`✅ Hourly cron: Every hour at :01 (Cairo time)`);
console.log(`✅ Dedup: Skips if a successful report was sent < ${DEDUP_MINUTES} min ago`);
console.log(`✅ Target: Production /api/automation/run (sends to ALL users)`);
console.log(`\n⏳ Waiting for next :01 Cairo...`);

// Keep the process alive
setInterval(() => {
  const now = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
  console.log(`💓 [${now}] Heartbeat | Sent: ${successRuns} | Skipped: ${skipRuns} | Total: ${totalRuns} | Last: ${lastRunStatus || "none"} | Running: ${isRunning}`);
}, 300000); // 5 minutes
