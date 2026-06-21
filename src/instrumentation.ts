/**
 * Instrumentation — Reliable hourly Telegram report scheduler
 *
 * STRATEGY: TTL-BASED POLLING (not wall-clock aligned)
 * ----------------------------------------------------
 * Previous design fired only when UTC minute === :01. This was fragile:
 * if the dev server was down/restarting at :01, the entire hour was
 * missed with no catch-up (this caused 06:02, 07:02, 08:02 UTC to be
 * skipped when the dev server restarted at 08:33).
 *
 * New design: poll every 5 minutes. Each tick calls production
 * /api/cron/refresh-prices. That endpoint checks the global hourly lock
 * (59-min TTL) FIRST and returns immediately if the lock is held (no
 * scraping, no sending — cheap). Only when the lock has expired does it
 * scrape + send. This means:
 *
 *   • Exactly ONE send per hour (lock guarantees it)
 *   • Self-healing: if the dev server was down for 3 hours, the first
 *     tick after restart sees an expired lock and sends immediately
 *   • No dependency on wall-clock alignment
 *
 * REDUNDANCY:
 *   - This scheduler (in the dev server) is the PRIMARY trigger.
 *   - mini-services/cron-service (standalone bun process) is the
 *     SECONDARY trigger — survives dev server restarts.
 *   - Homepage self-heal is the TERTIARY trigger — fires when the owner
 *     opens the dashboard.
 *   All three call the same production endpoint; the 3-layer dedup
 *   (global lock + per-chat dedup + in-memory dedup) prevents duplicates.
 *
 * LOCAL USERS:
 * Also sends to LOCAL DB users (new subscribers via telegram-poller)
 * that are NOT on production, to avoid duplicate sends.
 */

export async function register() {
  // Only run in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Only run in development (this is the local dev server scheduler)
  if (process.env.NODE_ENV !== "development") return;

  const PRODUCTION_URL = "https://omda-gold-bot.vercel.app";
  const ADMIN_PASSWORD = "908070";
  const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  // Guard against double-registration (HMR in dev mode)
  const globalAny = globalThis as unknown as { __hourlySchedulerStarted?: boolean };
  if (globalAny.__hourlySchedulerStarted) {
    console.log("[scheduler] Already started, skipping registration");
    return;
  }
  globalAny.__hourlySchedulerStarted = true;

  let isSending = false;

  // Dynamically import DB + telegram (only available in Node runtime)
  const { db } = await import("@/lib/db");
  const { sendTelegramMessage } = await import("@/lib/telegram");
  const { getConfig } = await import("@/lib/config-seeder");
  const { buildHourlyReport } = await import("@/lib/report-sender");
  const { fetchAllPrices } = await import("@/lib/price-fetcher");

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

  /**
   * Fetch the list of production chatIds so we can skip local users
   * that are ALSO on production (avoids duplicate sends).
   */
  async function getProductionChatIds(): Promise<Set<string>> {
    const token = await getAdminToken();
    if (!token) return new Set();
    try {
      const resp = await fetch(`${PRODUCTION_URL}/api/telegram-users`, {
        headers: { Cookie: `admin_session=${token}` },
        signal: AbortSignal.timeout(10000),
      });
      const users = await resp.json() as Array<{ chatId: string; active: boolean }>;
      return new Set(users.filter((u) => u.active).map((u) => u.chatId));
    } catch {
      return new Set();
    }
  }

  /**
   * Send the hourly report to LOCAL DB users that are NOT on production.
   * This handles new subscribers registered via the telegram-poller.
   */
  async function sendToLocalUsers(productionChatIds: Set<string>): Promise<void> {
    try {
      const localUsers = await db.telegramUser.findMany({ where: { active: true } });
      // Skip users that are also on production (they get reports from production)
      const localOnly = localUsers.filter((u) => !productionChatIds.has(u.chatId));
      if (localOnly.length === 0) {
        console.log(`[scheduler] 📭 No local-only users to send to (local total: ${localUsers.length})`);
        return;
      }

      console.log(`[scheduler] 📤 Sending to ${localOnly.length} local-only user(s)...`);

      // Fetch current prices + build report
      const allPrices = await fetchAllPrices();
      if (!allPrices.gold && !allPrices.usdEgp) {
        console.log("[scheduler] ⚠️ No prices available — skipping local send");
        return;
      }

      const goldPrice = allPrices.gold?.price ?? 0;
      const goldBuyPrice = allPrices.gold?.buyPrice ?? null;
      const goldSellPrice = allPrices.gold?.sellPrice ?? null;
      const gold21 = allPrices.allKarats.find((k) => k.karat === 21);
      const goldChange = gold21?.changePercent ?? 0;
      const goldSource = allPrices.gold?.source ?? "unknown";
      const allKarats = allPrices.allKarats ?? [];
      const goldPound = allPrices.goldPound ?? null;
      const usdEgpPrice = allPrices.usdEgp?.price ?? 0;
      const usdEgpChange = 0;
      const usdEgpSource = allPrices.usdEgp?.source ?? "unknown";

      const message = buildHourlyReport({
        goldPrice,
        goldBuyPrice,
        goldSellPrice,
        goldChange,
        goldSource,
        allKarats,
        goldPound,
        usdEgpPrice,
        usdEgpChange,
        usdEgpSource,
      });

      const botToken = await getConfig("TELEGRAM_BOT_TOKEN");
      if (!botToken) {
        console.error("[scheduler] ❌ No TELEGRAM_BOT_TOKEN configured locally");
        return;
      }

      let sent = 0;
      let failed = 0;
      for (const user of localOnly) {
        try {
          const result = await sendTelegramMessage(user.botToken, user.chatId, message);
          await db.notificationLog.create({
            data: {
              type: "hourly_report",
              title: `Hourly Price Report (local) - ${user.name}`,
              message,
              success: result.ok,
              error: result.error,
            },
          });
          if (result.ok) {
            sent++;
            console.log(`[scheduler]   ✅ ${user.name} (chatId ${user.chatId})`);
          } else {
            failed++;
            console.error(`[scheduler]   ❌ ${user.name} (chatId ${user.chatId}): ${result.error}`);

            // Auto-deactivate blocked users
            if (result.error && (result.error.includes("blocked by the user") || result.error.toLowerCase().includes("forbidden"))) {
              try {
                await db.telegramUser.updateMany({
                  where: { chatId: user.chatId },
                  data: { active: false },
                });
                console.log(`[scheduler]   🚫 Auto-deactivated ${user.name} — bot was blocked`);
              } catch {
                // ignore
              }
            }
          }
        } catch (err) {
          failed++;
          console.error(`[scheduler]   ❌ ${user.name}:`, err instanceof Error ? err.message : String(err));
        }
      }

      console.log(`[scheduler] 📊 Local send complete: ${sent} sent, ${failed} failed`);
    } catch (err) {
      console.error("[scheduler] ❌ Local send error:", err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Poll production /api/cron/refresh-prices.
   * Production checks the global lock FIRST — if held, returns immediately
   * (no scrape, no send). If the lock has expired (~1 hour since last send),
   * production scrapes fresh prices and sends to ALL production users.
   *
   * After triggering production, also send to LOCAL-only users (those not
   * on production) so new subscribers via telegram-poller get reports too.
   */
  async function pollAndTrigger(): Promise<void> {
    if (isSending) return;
    isSending = true;
    try {
      const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });

      // Obtain an admin session token so the auth-protected
      // /api/automation/run endpoint accepts the request.
      const adminToken = await getAdminToken();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (adminToken) {
        headers.Cookie = `admin_session=${adminToken}`;
      }

      // Call production /api/automation/run (auth-protected) which redirects
      // to /api/cron/refresh-prices (the single source of truth with the
      // 3-layer dedup system).
      const response = await fetch(`${PRODUCTION_URL}/api/automation/run`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(120000),
      });
      const data = await response.json() as {
        skipped?: string;
        hourlyReport?: { sent: boolean; details?: string };
        notifications?: Array<{ type: string; sent: boolean; details?: string }>;
        error?: string;
      };

      if (response.ok) {
        if (data.skipped === "lock_held") {
          // Lock held — no report due this tick. This is the normal case
          // (11 out of 12 ticks per hour). Log quietly.
          console.log(`[scheduler] ⏭️ [${cairoTime}] Lock held — no report due`);
        } else if (data.hourlyReport?.sent) {
          const notif = data.notifications?.[0];
          console.log(`[scheduler] 📨 [${cairoTime}] Report sent: ${notif?.details || data.hourlyReport.details || "OK"}`);
          // Also send to LOCAL-only users (production send just completed)
          const productionChatIds = await getProductionChatIds();
          await sendToLocalUsers(productionChatIds);
        } else {
          console.log(`[scheduler] ℹ️ [${cairoTime}] No report sent: ${data.hourlyReport?.details || "unknown reason"}`);
        }
      } else {
        console.error(`[scheduler] ❌ [${cairoTime}] Production call failed: ${data.error || response.status}`);
      }
    } catch (err) {
      console.error(`[scheduler] ❌ Poll error:`, err instanceof Error ? err.message : String(err));
    } finally {
      isSending = false;
    }
  }

  // Fire immediately on startup (catch-up for any missed hours while the
  // dev server was down), then every 5 minutes.
  console.log(`[scheduler] 🚀 Starting TTL-based scheduler (polls every ${POLL_INTERVAL_MS / 1000}s)`);
  console.log(`[scheduler] 📡 Production target: ${PRODUCTION_URL}/api/automation/run`);
  console.log(`[scheduler] 🔄 Self-healing: if dev server was down, first tick sends catch-up report`);

  // Initial fire after a short delay (let the server finish booting)
  setTimeout(() => {
    pollAndTrigger().catch((err) =>
      console.error("[scheduler] Initial poll error:", err)
    );
  }, 10000);

  // Then every 5 minutes
  const interval = setInterval(() => {
    pollAndTrigger().catch((err) =>
      console.error("[scheduler] Interval poll error:", err)
    );
  }, POLL_INTERVAL_MS);

  // Keep the interval alive
  interval.unref?.();

  const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
  console.log(`[scheduler] ✅ Scheduler active since ${cairoTime}`);
}
