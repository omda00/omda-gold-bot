import http from "http";
import cron from "node-cron";

const PORT = 3031;
const MAIN_APP_URL = "http://localhost:3000";

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
      console.log(`[${time}] Automation completed successfully:`, JSON.stringify(data, null, 2));
    } else {
      lastRunResult = {
        time,
        status: "error",
        details: data.error || "Unknown error",
      };
      console.error(`[${time}] Automation failed:`, data.error);
    }
  } catch (error) {
    lastRunResult = {
      time,
      status: "error",
      details: error instanceof Error ? error.message : "Network error",
    };
    console.error(`[${time}] Automation network error:`, error);
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

// Schedule daily automation at 9:00 AM Cairo time (Africa/Cairo = UTC+2)
// Cron: minute hour day month weekday
// "0 7 * * *" = UTC 7:00 = Cairo 9:00 AM
let dailyJob: cron.ScheduledTask | null = null;

function setupDailyCron() {
  // Clean up existing job
  if (dailyJob) {
    dailyJob.stop();
  }

  // Default: 9:00 AM Cairo time (UTC+2) = 7:00 AM UTC
  // We'll also check config every hour to see if the time changed
  dailyJob = cron.schedule("0 7 * * *", async () => {
    console.log("⏰ Daily automation triggered at", new Date().toISOString());
    const config = await getConfig();
    
    if (config.AUTOMATION_ENABLED === "true") {
      await runAutomation();
    } else {
      console.log("Automation is disabled. Skipping daily run.");
    }
  }, {
    timezone: "Africa/Cairo",
  });

  console.log("✅ Daily cron job scheduled at 9:00 AM Cairo time");
}

// Also run a check every 4 hours for signal detection
let periodicJob: cron.ScheduledTask | null = null;

function setupPeriodicCron() {
  if (periodicJob) {
    periodicJob.stop();
  }

  // Every 4 hours: 1:00, 5:00, 9:00, 13:00, 17:00, 21:00 Cairo time
  periodicJob = cron.schedule("0 1,5,9,13,17,21 * * *", async () => {
    console.log("🔄 Periodic check triggered at", new Date().toISOString());
    const config = await getConfig();
    
    if (config.AUTOMATION_ENABLED === "true") {
      await runAutomation();
    } else {
      console.log("Automation is disabled. Skipping periodic check.");
    }
  }, {
    timezone: "Africa/Cairo",
  });

  console.log("✅ Periodic cron job scheduled (every 4 hours Cairo time)");
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
        daily: dailyJob ? "active" : "inactive",
        periodic: periodicJob ? "active" : "inactive",
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
  setupDailyCron();
  setupPeriodicCron();
  console.log(`📋 Endpoints:`);
  console.log(`   GET  /health  - Service health check`);
  console.log(`   POST /trigger - Manually trigger automation`);
  console.log(`   GET  /config  - Get current config`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down cron service...");
  if (dailyJob) dailyJob.stop();
  if (periodicJob) periodicJob.stop();
  server.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Shutting down cron service...");
  if (dailyJob) dailyJob.stop();
  if (periodicJob) periodicJob.stop();
  server.close();
  process.exit(0);
});
