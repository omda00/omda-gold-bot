/**
 * Cron Service — Standalone redundant trigger for hourly Telegram reports
 *
 * STRATEGY: TTL-BASED POLLING (fires every 5 minutes via setInterval)
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
 * WHY setInterval (not node-cron)?
 * node-cron's timer doesn't reliably keep the bun process alive in all
 * environments. A plain setInterval is simpler, has no dependencies, and
 * is guaranteed to fire as long as the process is alive.
 */

const PRODUCTION_URL = "https://omda-gold-bot.vercel.app";
const ADMIN_PASSWORD = "908070";
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Track state
let lastRunTime: string | null = null;
let lastRunStatus: string | null = null;
let isRunning = false;
let totalRuns = 0;
let successRuns = 0;
let skipRuns = 0;
let errorRuns = 0;

// =============================================
// CRASH PROTECTION — never exit on unhandled errors
// =============================================
// Without these handlers, any unhandled promise rejection or uncaught
// exception would kill the process, breaking the 24/7 hourly trigger.
process.on("unhandledRejection", (reason) => {
  console.error("⚠️ unhandledRejection (ignored):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("⚠️ uncaughtException (ignored):", err instanceof Error ? err.message : String(err));
});

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
// Start
// =============================================
const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
console.log(`🚀 Cron Service started at ${cairoTime}`);
console.log(`📡 Production URL: ${PRODUCTION_URL}`);
console.log(`⏱️  Polling every ${POLL_INTERVAL_MS / 1000}s via setInterval (TTL-based, self-healing)`);
console.log(`🔒 Production lock (59-min TTL) guarantees exactly ONE send per hour`);
console.log(`🛡️  Crash-protected: unhandledRejection + uncaughtException are caught`);

// Fire immediately on startup (catch-up for missed hours)
setTimeout(() => {
  console.log(`\n🔄 Initial catch-up tick...`);
  runCycle();
}, 5000);

// Then every 5 minutes — plain setInterval (no unref, keeps process alive)
setInterval(() => {
  runCycle();
}, POLL_INTERVAL_MS);

// Heartbeat — log every 5 minutes so we know the process is alive
setInterval(() => {
  const now = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
  console.log(`💓 [${now}] Heartbeat | Sent: ${successRuns} | Skipped: ${skipRuns} | Errors: ${errorRuns} | Total: ${totalRuns} | Last: ${lastRunStatus || "none"}`);
}, 300000);

console.log(`\n⏳ First tick in 5s, then every ${POLL_INTERVAL_MS / 1000}s...`);
