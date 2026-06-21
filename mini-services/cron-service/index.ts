/**
 * Cron Service — Standalone redundant trigger for hourly Telegram reports
 *
 * STRATEGY: TTL-BASED POLLING (fires every 5 minutes)
 * ----------------------------------------------------
 * This standalone bun process survives dev server restarts. It polls
 * production /api/automation/run every 5 minutes. Production checks the
 * global hourly lock (59-min TTL) FIRST and returns immediately if the
 * lock is held (no scraping, no sending — cheap). Only when the lock has
 * expired does production scrape + send.
 *
 * This means:
 *   • Exactly ONE send per hour (lock guarantees it)
 *   • Self-healing: if this service was down for 3 hours, the first tick
 *     after restart sees an expired lock and sends immediately
 *   • Redundant with instrumentation.ts scheduler — if either is alive,
 *     the hourly report fires
 *
 * WHY NOT wall-clock :01?
 * The previous design fired only at :01 Cairo. If the process was down
 * at :01, the hour was missed entirely. The 5-min TTL approach catches
 * up automatically on the next tick after the lock expires.
 */

import cron from "node-cron";

const PRODUCTION_URL = "https://omda-gold-bot.vercel.app";
const ADMIN_PASSWORD = "908070";

// Track state
let lastRunTime: string | null = null;
let lastRunStatus: string | null = null;
let isRunning = false;
let totalRuns = 0;
let successRuns = 0;
let skipRuns = 0;
let errorRuns = 0;

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
 * Call production /api/automation/run — sends hourly report to ALL users.
 *
 * Production's /api/cron/refresh-prices checks the global lock FIRST:
 *   - If lock held (sent < 59 min ago) → returns immediately, no scrape
 *   - If lock expired → scrapes prices + sends to all active users
 *
 * We don't do any pre-dedup here — production's lock is the single source
 * of truth and is atomic. This avoids the buggy /api/logs pre-check that
 * could skip a needed send if only some users received the last report.
 */
async function runAutomation(): Promise<boolean> {
  const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });

  try {
    const adminToken = await getAdminToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (adminToken) {
      headers.Cookie = `admin_session=${adminToken}`;
    } else {
      console.warn(`⏰ [${cairoTime}] ⚠️ No admin token — production may reject with 401`);
    }

    const response = await fetch(`${PRODUCTION_URL}/api/automation/run`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(120000),
    });

    const data = await response.json() as {
      skipped?: string;
      hourlyReport?: { sent: boolean; details?: string };
      notifications?: Array<{ type: string; sent: boolean; details?: string; error?: string }>;
      error?: string;
    };

    if (response.ok) {
      if (data.skipped === "lock_held") {
        // Normal case: lock held, no report due. Quiet log.
        console.log(`⏰ [${cairoTime}] ⏭️ Lock held — no report due`);
        lastRunStatus = "skipped (lock held)";
        skipRuns++;
        return true;
      } else if (data.hourlyReport?.sent) {
        console.log(`⏰ [${cairoTime}] ✅ Report sent: ${data.hourlyReport.details || "OK"}`);
        if (data.notifications) {
          for (const n of data.notifications) {
            const status = n.sent ? "✅" : "❌";
            console.log(`⏰ [${cairoTime}] 📤 ${n.type}: ${status} ${n.details || n.error || ""}`);
          }
        }
        lastRunStatus = "sent";
        successRuns++;
        return true;
      } else {
        console.log(`⏰ [${cairoTime}] ℹ️ No report: ${data.hourlyReport?.details || "unknown"}`);
        lastRunStatus = "no-report";
        return true;
      }
    } else {
      console.error(`⏰ [${cairoTime}] ❌ Production failed: ${data.error || response.status}`);
      lastRunStatus = "error";
      errorRuns++;
      return false;
    }
  } catch (error) {
    console.error(`⏰ [${cairoTime}] ❌ Automation error:`, error instanceof Error ? error.message : String(error));
    lastRunStatus = "error";
    errorRuns++;
    return false;
  }
}

/**
 * Run one polling cycle.
 */
async function runCycle(): Promise<void> {
  if (isRunning) {
    console.log("⏳ Already running, skipping...");
    return;
  }
  isRunning = true;
  totalRuns++;

  try {
    await runAutomation();
    lastRunTime = new Date().toISOString();
  } catch (error) {
    console.error("❌ Cycle error:", error instanceof Error ? error.message : String(error));
    lastRunStatus = "error";
    errorRuns++;
  } finally {
    isRunning = false;
  }

  console.log(`📊 Stats: ${successRuns} sent, ${skipRuns} skipped, ${errorRuns} errors, ${totalRuns} total`);
}

// =============================================
// Schedule: fire every 5 minutes
// =============================================
// The production lock (59-min TTL) ensures exactly ONE send per hour.
// All other ticks are cheap no-ops (lock held → early return, no scrape).
cron.schedule("*/5 * * * *", async () => {
  await runCycle();
});

// =============================================
// Start
// =============================================
const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
console.log(`🚀 Cron Service started at ${cairoTime}`);
console.log(`📡 Production URL: ${PRODUCTION_URL}`);
console.log(`⏱️  Polling every 5 minutes (TTL-based, self-healing)`);
console.log(`🔒 Production lock (59-min TTL) guarantees exactly ONE send per hour`);
console.log(`\n⏳ Waiting for first tick...`);

// Fire immediately on startup (catch-up for missed hours)
setTimeout(() => {
  console.log(`\n🔄 Initial catch-up tick...`);
  runCycle();
}, 5000);

// Heartbeat — log stats every 5 minutes
setInterval(() => {
  const now = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
  console.log(`💓 [${now}] Heartbeat | Sent: ${successRuns} | Skipped: ${skipRuns} | Errors: ${errorRuns} | Total: ${totalRuns} | Last: ${lastRunStatus || "none"} | Running: ${isRunning}`);
}, 300000);
