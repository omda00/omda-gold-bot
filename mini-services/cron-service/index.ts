/**
 * Cron Service - Lightweight scheduler for hourly Telegram reports
 *
 * This service runs independently from the Next.js app.
 * It uses node-cron to schedule hourly automation runs that:
 * 1. Refresh prices from web sources
 * 2. Send Telegram notifications to all registered users
 *
 * No HTTP server - just pure cron scheduling.
 */

import cron from "node-cron";

const MAIN_APP_URL = process.env.MAIN_APP_URL || "http://localhost:3000";

// Track state
let lastRunTime: string | null = null;
let lastRunStatus: string | null = null;
let isRunning = false;
let totalRuns = 0;
let successRuns = 0;

/**
 * Call the main app's automation API endpoint
 */
async function runAutomation(): Promise<boolean> {
  const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
  console.log(`⏰ [${cairoTime}] Running automation cycle...`);

  try {
    const response = await fetch(`${MAIN_APP_URL}/api/automation/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(120000),
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`⏰ [${cairoTime}] ✅ Automation completed successfully`);
      if (data.notifications && Array.isArray(data.notifications)) {
        for (const n of data.notifications) {
          console.log(`⏰ [${cairoTime}] 📤 ${n.type}: ${n.sent ? "✅" : "❌"} ${n.details || n.error || ""}`);
        }
      }
      return true;
    } else {
      console.error(`⏰ [${cairoTime}] ❌ Automation failed:`, data.error);
      return false;
    }
  } catch (error) {
    console.error(`⏰ [${cairoTime}] ❌ Automation error:`, error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Refresh prices from the web and save to DB
 */
async function refreshPrices(): Promise<boolean> {
  const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });

  try {
    console.log(`🔄 [${cairoTime}] Refreshing prices...`);
    const response = await fetch(`${MAIN_APP_URL}/api/prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
    });

    const data = await response.json() as { fetched?: { gold: boolean; usdEgp: boolean }; message?: string };

    if (data.fetched?.gold || data.fetched?.usdEgp) {
      console.log(`🔄 [${cairoTime}] ✅ Prices refreshed: gold=${data.fetched?.gold}, usdEgp=${data.fetched?.usdEgp}`);
      return true;
    } else {
      console.log(`🔄 [${cairoTime}] ⚠️ Price refresh: ${data.message || "no new data"}`);
      return false;
    }
  } catch (error) {
    console.error(`🔄 [${cairoTime}] ❌ Price refresh failed:`, error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Fetch config to check if automation is enabled
 */
async function isAutomationEnabled(): Promise<boolean> {
  try {
    const response = await fetch(`${MAIN_APP_URL}/api/config`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const config = await response.json();
      return config.AUTOMATION_ENABLED === "true";
    }
  } catch {
    // If we can't reach the config, assume enabled
  }
  return true;
}

/**
 * Run the full cycle: refresh prices + send notifications
 */
async function runFullCycle(): Promise<void> {
  if (isRunning) {
    console.log("⏳ Automation already running, skipping...");
    return;
  }
  isRunning = true;
  totalRuns++;

  try {
    await refreshPrices();
    const success = await runAutomation();
    lastRunTime = new Date().toISOString();
    lastRunStatus = success ? "success" : "error";
    if (success) successRuns++;
  } catch (error) {
    console.error("❌ Full cycle error:", error instanceof Error ? error.message : String(error));
    lastRunTime = new Date().toISOString();
    lastRunStatus = "error";
  } finally {
    isRunning = false;
  }

  console.log(`📊 Stats: ${successRuns}/${totalRuns} successful runs`);
}

// =============================================
// Setup Cron Jobs
// =============================================

// Hourly: Full automation (refresh + Telegram) at minute 1
cron.schedule("1 * * * *", async () => {
  const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
  console.log(`\n⏰ [${cairoTime}] === Hourly cron triggered ===`);

  const enabled = await isAutomationEnabled();
  if (enabled) {
    await runFullCycle();
  } else {
    console.log("⏸️ Automation is disabled. Skipping.");
  }
}, { timezone: "Africa/Cairo" });

// Every 30 minutes: price refresh only (no Telegram)
cron.schedule("0,30 * * * *", async () => {
  const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
  console.log(`🔄 [${cairoTime}] 30-minute price refresh`);
  await refreshPrices();
}, { timezone: "Africa/Cairo" });

// =============================================
// Start
// =============================================
const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
console.log(`🚀 Cron Service started at ${cairoTime}`);
console.log(`📡 Main app URL: ${MAIN_APP_URL}`);
console.log(`✅ Hourly cron: Every hour at :01 (Cairo time)`);
console.log(`✅ Price refresh: Every 30 minutes (Cairo time)`);
console.log(`🔄 Running initial price refresh...`);

// Initial price refresh (fire and forget with error handling)
refreshPrices().catch(() => {});

// Keep the process alive
setInterval(() => {
  // Heartbeat every 5 minutes to confirm the service is alive
  const now = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
  console.log(`💓 [${now}] Heartbeat | Runs: ${successRuns}/${totalRuns} | Last: ${lastRunStatus || "none"} | Running: ${isRunning}`);
}, 300000);
