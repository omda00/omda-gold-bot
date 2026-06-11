/**
 * In-Process Cron Scheduler
 *
 * Runs inside the Next.js server process so there's no separate service to manage.
 * Schedules:
 * - Hourly: Full automation (refresh prices + send Telegram reports)
 * - Daily: 9:00 AM Cairo time (same as hourly)
 * - Every 30 min: Price refresh only (no Telegram)
 */

import cron from "node-cron";

const MAIN_APP_BASE = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

let isInitialized = false;
let hourlyJob: cron.ScheduledTask | null = null;
let dailyJob: cron.ScheduledTask | null = null;
let priceRefreshJob: cron.ScheduledTask | null = null;

/** Call a local API route via HTTP */
async function callApi(path: string, method = "POST", timeout = 120000) {
  try {
    const res = await fetch(`${MAIN_APP_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(timeout),
    });
    return await res.json();
  } catch (err) {
    console.error(`[cron] Error calling ${path}:`, err);
    return null;
  }
}

/** Refresh prices from the web and save to DB */
async function refreshPrices() {
  const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
  console.log(`🔄 [${cairoTime}] Cron: Refreshing prices...`);
  const data = await callApi("/api/prices", "POST", 30000);
  if (data?.fetched) {
    console.log(`🔄 [${cairoTime}] Cron: Prices refreshed — gold=${data.fetched.gold}, usdEgp=${data.fetched.usdEgp}`);
  } else {
    console.log(`🔄 [${cairoTime}] Cron: Price refresh — ${data?.message || "no new data"}`);
  }
}

/** Run full automation (prices + Telegram notifications) */
async function runAutomation() {
  const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
  console.log(`⏰ [${cairoTime}] Cron: Running automation...`);

  // First refresh prices
  await refreshPrices();

  // Then run full automation (sends Telegram)
  const data = await callApi("/api/automation/run", "POST", 120000);
  if (data) {
    const notifs = data.notifications || [];
    const sent = notifs.filter((n: { sent?: boolean }) => n.sent).length;
    console.log(`⏰ [${cairoTime}] Cron: Automation done — ${sent}/${notifs.length} notifications sent`);

    // Log each notification
    for (const n of notifs) {
      const icon = n.sent ? "✅" : "❌";
      console.log(`⏰ [${cairoTime}] Cron: ${icon} ${n.type}: ${n.details || n.error || ""}`);
    }
  } else {
    console.error(`⏰ [${cairoTime}] Cron: Automation failed — no response`);
  }
}

/** Check if automation is enabled before running */
async function runAutomationIfEnabled() {
  const config = await callApi("/api/config", "GET", 5000);
  if (config?.AUTOMATION_ENABLED === "true") {
    await runAutomation();
  } else {
    const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
    console.log(`⏸️ [${cairoTime}] Cron: Automation disabled — skipping`);
  }
}

/**
 * Initialize the cron scheduler.
 * Safe to call multiple times — will only initialize once.
 */
export function initCronScheduler() {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  console.log("⏰ Initializing cron scheduler...");

  // Every hour on the hour (Cairo time)
  hourlyJob = cron.schedule(
    "1 * * * *", // minute 1 to avoid conflict with price refresh at minute 0
    () => runAutomationIfEnabled(),
    { timezone: "Africa/Cairo" }
  );
  console.log("✅ Hourly cron: Every hour at :01 (Cairo time)");

  // Daily at 9:00 AM Cairo time
  dailyJob = cron.schedule(
    "0 9 * * *",
    () => runAutomationIfEnabled(),
    { timezone: "Africa/Cairo" }
  );
  console.log("✅ Daily cron: 9:00 AM Cairo time");

  // Every 30 minutes: price refresh only
  priceRefreshJob = cron.schedule(
    "0,30 * * * *",
    () => refreshPrices(),
    { timezone: "Africa/Cairo" }
  );
  console.log("✅ Price refresh cron: Every 30 minutes (Cairo time)");

  // Do an initial price refresh on startup
  console.log("🔄 Running initial price refresh...");
  refreshPrices();
}

/**
 * Get the status of the cron scheduler.
 */
export function getCronStatus() {
  return {
    initialized: isInitialized,
    jobs: {
      hourly: hourlyJob ? "active" : "inactive",
      daily: dailyJob ? "active" : "inactive",
      priceRefresh: priceRefreshJob ? "active" : "inactive",
    },
    schedule: {
      hourly: "Every hour at :01 (Cairo time)",
      daily: "9:00 AM Cairo time",
      priceRefresh: "Every 30 minutes (Cairo time)",
    },
  };
}
