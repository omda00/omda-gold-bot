import http from "http";
import cron from "node-cron";

const PORT = 3031;
const MAIN_APP_URL = process.env.MAIN_APP_URL || "http://localhost:3000";

// Store last run info
let lastRunResult: {
  time: string;
  status: string;
  details?: string;
} | null = null;

/**
 * Call the main app's automation API endpoint
 */
async function runAutomation(): Promise<void> {
  const time = new Date().toISOString();
  console.log(`[${time}] Running automation cycle...`);

  try {
    const response = await fetch(`${MAIN_APP_URL}/api/automation/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const data = await response.json();

    if (response.ok) {
      lastRunResult = {
        time,
        status: "success",
        details: JSON.stringify({
          prices: data.prices,
          signals: data.signals,
          usdDrop: data.usdDrop,
          notifications: data.notifications,
        }),
      };
      console.log(`[${time}] ✅ Automation completed successfully`);

      // Log notification details
      if (data.notifications && Array.isArray(data.notifications)) {
        for (const n of data.notifications) {
          console.log(`[${time}] 📤 ${n.type}: ${n.sent ? "✅" : "❌"} ${n.details || n.error || ""}`);
        }
      }
    } else {
      lastRunResult = {
        time,
        status: "error",
        details: data.error || "Unknown error",
      };
      console.error(`[${time}] ❌ Automation failed:`, data.error);
    }
  } catch (error) {
    lastRunResult = {
      time,
      status: "error",
      details: error instanceof Error ? error.message : "Network error",
    };
    console.error(`[${time}] ❌ Automation network error:`, error);
  }
}

/**
 * Fetch current config from main app to determine schedule
 */
async function getConfig(): Promise<Record<string, string>> {
  try {
    const response = await fetch(`${MAIN_APP_URL}/api/config`);
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error("Failed to fetch config:", error);
  }
  return {};
}

// =============================================
// HOURLY automation: Every hour on the hour
// Cairo time (Africa/Cairo = UTC+2 or UTC+3 in summer)
// This sends updates to ALL registered Telegram users with:
// - Gold prices (all karats: 24, 22, 21, 18)
// - USD/EGP exchange rate
// - Investment signals (if any)
// - USD drop alerts (if any)
// =============================================
let hourlyJob: cron.ScheduledTask | null = null;

function setupHourlyCron() {
  if (hourlyJob) {
    hourlyJob.stop();
  }

  // Every hour at minute 0: 00:00, 01:00, 02:00, ..., 23:00 Cairo time
  hourlyJob = cron.schedule("0 * * * *", async () => {
    const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
    console.log(`⏰ [${cairoTime}] Hourly update triggered (Cairo time)`);
    const config = await getConfig();

    if (config.AUTOMATION_ENABLED === "true") {
      await runAutomation();
    } else {
      console.log("⏸️ Automation is disabled. Skipping hourly update.");
    }
  }, {
    timezone: "Africa/Cairo",
  });

  console.log("✅ Hourly cron job scheduled (every hour on the hour — Africa/Cairo timezone)");
}

// Daily report at 9:00 AM Cairo time
let dailyJob: cron.ScheduledTask | null = null;

function setupDailyCron() {
  if (dailyJob) {
    dailyJob.stop();
  }

  // 9:00 AM Cairo time
  dailyJob = cron.schedule("0 9 * * *", async () => {
    const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
    console.log(`🌅 [${cairoTime}] Daily report triggered (Cairo time)`);
    const config = await getConfig();

    if (config.AUTOMATION_ENABLED === "true") {
      await runAutomation();
    } else {
      console.log("⏸️ Automation is disabled. Skipping daily report.");
    }
  }, {
    timezone: "Africa/Cairo",
  });

  console.log("✅ Daily cron job scheduled at 9:00 AM Cairo time");
}

// HTTP server for health check and manual triggers
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "running",
      port: PORT,
      lastRun: lastRunResult,
      uptime: process.uptime(),
      cronJobs: {
        hourly: hourlyJob ? "active" : "inactive",
        daily: dailyJob ? "active" : "inactive",
      },
      schedule: {
        hourly: "Every hour on the hour (Cairo time)",
        daily: "9:00 AM Cairo time",
      },
    }));
    return;
  }

  if (url.pathname === "/trigger" && req.method === "POST") {
    console.log("👆 Manual trigger received");
    await runAutomation();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      lastRun: lastRunResult,
    }));
    return;
  }

  if (url.pathname === "/config" && req.method === "GET") {
    const config = await getConfig();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(config));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// Start everything
server.listen(PORT, () => {
  console.log(`🚀 Cron Service running on port ${PORT}`);
  console.log(`📡 Main app URL: ${MAIN_APP_URL}`);
  setupHourlyCron();
  setupDailyCron();
  console.log(`📋 Endpoints:`);
  console.log(`   GET  /health  - Service health check`);
  console.log(`   POST /trigger - Manually trigger automation`);
  console.log(`   GET  /config  - Get current config`);
  console.log(`⏰ Schedules:`);
  console.log(`   Hourly: Every hour on the hour (Cairo time - Africa/Cairo)`);
  console.log(`   Daily:  9:00 AM Cairo time`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down cron service...");
  if (hourlyJob) hourlyJob.stop();
  if (dailyJob) dailyJob.stop();
  server.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Shutting down cron service...");
  if (hourlyJob) hourlyJob.stop();
  if (dailyJob) dailyJob.stop();
  server.close();
  process.exit(0);
});
