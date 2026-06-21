/**
 * Instrumentation — Starts the hourly Telegram report scheduler
 *
 * This runs ONCE when the Next.js server starts. It sets up a setInterval
 * that fires every 60 seconds and checks if the current UTC minute is :01.
 * When it is, the scheduler:
 *   1. Calls PRODUCTION /api/automation/run — sends to all PRODUCTION users
 *   2. Sends directly to LOCAL DB users — new subscribers registered via
 *      the telegram-poller mini-service (which handles /start locally
 *      because the production webhook is broken)
 *
 * WHY LOCAL SENDS:
 * The production webhook is broken (missing @@unique constraint on Neon DB).
 * The telegram-poller mini-service handles /start by forwarding to the LOCAL
 * webhook, which registers users in the LOCAL SQLite DB. These local users
 * need to receive hourly reports too. The scheduler sends to them directly
 * via the Telegram Bot API, skipping any user that also exists on production
 * (to avoid duplicates — production /api/automation/run handles those).
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
      // Change % for 21k is on the KaratPriceResult, not on PriceFetchResult
      const gold21 = allPrices.allKarats.find((k) => k.karat === 21);
      const goldChange = gold21?.changePercent ?? 0;
      const goldSource = allPrices.gold?.source ?? "unknown";
      const allKarats = allPrices.allKarats ?? [];
      const goldPound = allPrices.goldPound ?? null;
      const usdEgpPrice = allPrices.usdEgp?.price ?? 0;
      const usdEgpChange = 0; // USD change % not available from fetchAllPrices; DB-only
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
          // Log to local DB
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

  async function sendHourlyReport(): Promise<void> {
    if (isSending) return;
    isSending = true;
    try {
      const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
      console.log(`[scheduler] ⏰ [${cairoTime}] Firing production /api/automation/run...`);

      // Obtain an admin session token so the (now auth-protected)
      // /api/automation/run endpoint accepts the request.
      const adminToken = await getAdminToken();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (adminToken) {
        headers.Cookie = `admin_session=${adminToken}`;
      } else {
        console.warn(
          `[scheduler] ⚠️ No admin token — /api/automation/run may reject with 401 on the new production code`
        );
      }

      const response = await fetch(`${PRODUCTION_URL}/api/automation/run`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(120000),
      });
      const data = await response.json() as {
        notifications?: Array<{ type: string; sent: boolean; details?: string }>;
        error?: string;
      };

      if (response.ok) {
        const notif = data.notifications?.[0];
        console.log(`[scheduler] ✅ Production send: ${notif?.details || "OK"}`);
      } else {
        console.error(`[scheduler] ❌ Production send failed: ${data.error}`);
      }

      // Also send to LOCAL DB users (new subscribers via telegram-poller)
      const productionChatIds = await getProductionChatIds();
      await sendToLocalUsers(productionChatIds);
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
  console.log(`[scheduler] 📡 Production target: ${PRODUCTION_URL}/api/automation/run`);
  console.log(`[scheduler] 📤 Local DB users: also sent directly (skipping production users)`);
  console.log(`[scheduler] ⏰ Fires at :01 UTC every hour (= :01 Cairo every hour)`);
}
