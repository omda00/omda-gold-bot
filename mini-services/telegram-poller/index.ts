/**
 * Telegram Poller Service — handles /start, /stop, /help via long-polling
 *
 * WHY THIS EXISTS:
 * The production Vercel webhook at /api/telegram/webhook is BROKEN because
 * the production Neon DB doesn't have the @@unique([chatId, botToken])
 * compound constraint applied. Every Prisma call using
 * `where: { chatId_botToken: {...} }` fails, so the /start handler crashes
 * silently and the bot appears dead to users.
 *
 * This service fixes that by:
 *   1. Deleting the Telegram webhook (so we can use getUpdates long-polling)
 *   2. Polling getUpdates every 2 seconds
 *   3. Forwarding each update to the LOCAL dev server's webhook
 *      (http://localhost:3000/api/telegram/webhook) which runs the FIXED
 *      code with the resilient telegram-user-helpers.ts
 *
 * The local webhook registers users in the LOCAL SQLite DB and sends
 * welcome messages via the Telegram Bot API.
 *
 * NEW SUBSCRIBERS:
 * Users who /start the bot are registered in the LOCAL DB. The local
 * instrumentation.ts scheduler sends hourly reports to these local users
 * (in addition to calling production /api/automation/run for production
 * users). This ensures new subscribers receive hourly reports even before
 * the production deploy.
 *
 * AFTER PRODUCTION DEPLOY:
 * Once the resilient helper code is deployed to Vercel:
 *   1. Stop this service
 *   2. Re-set the Telegram webhook to production:
 *      GET https://omda-gold-bot.vercel.app/api/telegram/webhook?setup=true
 *   3. Migrate local DB users to production via admin API (now working)
 */

const BOT_TOKEN = "8935785205:AAFaHMrOMdiPVf6LupXdHh0BSBjadB3dzns";
const LOCAL_WEBHOOK_URL = "http://localhost:3000/api/telegram/webhook";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const POLL_TIMEOUT_SEC = 30; // long-poll timeout
const POLL_INTERVAL_MS = 1500; // delay between polls (in addition to long-poll timeout)
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

let offset = 0; // Telegram update offset (acknowledge updates by setting offset = update_id + 1)
let isPolling = false;
let totalUpdates = 0;
let totalForwarded = 0;
let totalErrors = 0;
let lastError: string | null = null;

/**
 * Delete the Telegram webhook so getUpdates works.
 * Telegram doesn't allow both webhook and getUpdates simultaneously.
 */
async function deleteWebhook(): Promise<boolean> {
  try {
    console.log("[poller] Deleting Telegram webhook to enable getUpdates...");
    const resp = await fetch(`${TELEGRAM_API}/deleteWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: false }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await resp.json() as { ok: boolean; description?: string };
    if (data.ok) {
      console.log("[poller] ✅ Webhook deleted — getUpdates is now active");
      return true;
    }
    console.error("[poller] ❌ Failed to delete webhook:", data.description);
    return false;
  } catch (err) {
    console.error("[poller] ❌ deleteWebhook error:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

/**
 * Check current webhook status (for diagnostics)
 */
async function checkWebhookStatus(): Promise<void> {
  try {
    const resp = await fetch(`${TELEGRAM_API}/getWebhookInfo`, { signal: AbortSignal.timeout(10000) });
    const data = await resp.json() as {
      ok: boolean;
      result?: { url: string; pending_update_count: number; last_error_message?: string };
    };
    if (data.ok && data.result) {
      console.log(`[poller] Webhook status: url="${data.result.url}" pending=${data.result.pending_update_count}`);
      if (data.result.last_error_message) {
        console.log(`[poller] Last webhook error: ${data.result.last_error_message}`);
      }
    }
  } catch {
    // Non-critical
  }
}

/**
 * Forward a Telegram update to the local webhook.
 * The local webhook handles /start, /stop, /help and registers users.
 */
async function forwardToUpdate(update: unknown): Promise<boolean> {
  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      const resp = await fetch(LOCAL_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
        signal: AbortSignal.timeout(15000),
      });
      const data = await resp.json() as { ok?: boolean; registered?: boolean; error?: string };
      if (resp.ok) {
        return true;
      }
      console.error(`[poller] Local webhook returned ${resp.status}:`, data.error || data);
      return false;
    } catch (err) {
      retries++;
      const msg = err instanceof Error ? err.message : String(err);
      if (retries < MAX_RETRIES) {
        console.warn(`[poller] Forward failed (attempt ${retries}/${MAX_RETRIES}): ${msg} — retrying in ${RETRY_DELAY_MS}ms`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      } else {
        console.error(`[poller] Forward failed after ${MAX_RETRIES} attempts:`, msg);
        return false;
      }
    }
  }
  return false;
}

/**
 * Poll Telegram getUpdates with long-polling.
 * Returns the list of updates received.
 */
async function pollUpdates(): Promise<Array<{ update_id: number }>> {
  const url = `${TELEGRAM_API}/getUpdates?offset=${offset}&timeout=${POLL_TIMEOUT_SEC}&allowed_updates=["message"]`;
  const resp = await fetch(url, { signal: AbortSignal.timeout((POLL_TIMEOUT_SEC + 10) * 1000) });
  const data = await resp.json() as {
    ok: boolean;
    result?: Array<{ update_id: number; message?: { from?: { first_name?: string }; text?: string } }>;
    description?: string;
  };

  if (!data.ok) {
    throw new Error(`getUpdates failed: ${data.description || "unknown error"}`);
  }

  return data.result || [];
}

/**
 * Main polling loop.
 */
async function pollLoop(): Promise<void> {
  console.log("[poller] 🔄 Starting polling loop...");
  isPolling = true;

  while (isPolling) {
    try {
      const updates = await pollUpdates();

      if (updates.length > 0) {
        console.log(`[poller] 📨 Received ${updates.length} update(s)`);
        for (const update of updates) {
          totalUpdates++;
          // Acknowledge this update by advancing offset
          offset = update.update_id + 1;

          // Log the update
          const text = update.message?.text || "";
          const fromName = update.message?.from?.first_name || "unknown";
          console.log(`[poller]   → update_id=${update.update_id} from=${fromName} text="${text}"`);

          // Forward to local webhook
          const ok = await forwardToUpdate(update);
          if (ok) {
            totalForwarded++;
            console.log(`[poller]   ✅ Forwarded to local webhook`);
          } else {
            totalErrors++;
            console.log(`[poller]   ❌ Failed to forward to local webhook`);
          }
        }
      }

      // Small delay before next poll (in addition to long-poll timeout)
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    } catch (err) {
      totalErrors++;
      lastError = err instanceof Error ? err.message : String(err);
      console.error("[poller] ❌ Polling error:", lastError);
      // Wait before retrying to avoid tight error loop
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

// =============================================
// Start
// =============================================
async function main() {
  const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
  console.log(`[poller] 🚀 Telegram Poller Service started at ${cairoTime}`);
  console.log(`[poller] 📡 Bot token: ****${BOT_TOKEN.slice(-5)}`);
  console.log(`[poller] 🎯 Local webhook: ${LOCAL_WEBHOOK_URL}`);
  console.log(`[poller] ⏱️  Long-poll timeout: ${POLL_TIMEOUT_SEC}s, interval: ${POLL_INTERVAL_MS}ms`);
  console.log("");

  // Check current webhook status
  await checkWebhookStatus();

  // Delete webhook to enable getUpdates
  const deleted = await deleteWebhook();
  if (!deleted) {
    console.error("[poller] ❌ Could not delete webhook. getUpdates may fail with 'Conflict'.");
    console.error("[poller]    Retrying anyway in case webhook was already deleted...");
  }

  console.log("");
  await pollLoop();
}

// Heartbeat — log stats every 5 minutes
setInterval(() => {
  const now = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
  console.log(
    `[poller] 💓 [${now}] Stats: ${totalUpdates} updates | ${totalForwarded} forwarded | ${totalErrors} errors | lastError: ${lastError || "none"}`
  );
}, 300000);

main().catch((err) => {
  console.error("[poller] 💀 Fatal error:", err);
  process.exit(1);
});
