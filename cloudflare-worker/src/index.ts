/**
 * Omda Gold Bot — Cloudflare Worker
 * ==================================
 * 24/7 hourly Telegram gold price reports via Cloudflare Cron Triggers.
 *
 * HANDLERS:
 *   1. fetch()   — Telegram webhook (handles /start, /stop, /help)
 *                  Also exposes /__health and /__test endpoints.
 *   2. scheduled() — Cron Trigger fires at :00 every hour.
 *                    Fetches prices, acquires hour-bucket lock, sends to
 *                    ALL active subscribers.
 *
 * DEDUP (3 layers, same as the Vercel app):
 *   1. Global hour-bucket lock (Neon AppConfig key "HOURLY_REPORT_LOCK")
 *   2. Per-chat hour-bucket (Neon AppConfig key "LAST_REPORT_CHAT_<id>")
 *   3. In-memory chatId dedup of the subscriber list
 *
 * This guarantees exactly ONE message per chat per Cairo hour — 24/7.
 */

import { fetchAllPrices, buildHourlyReport } from "./price-fetcher";
import {
  getActiveSubscribers,
  acquireHourlyLock,
  wasChatSentThisHour,
  markChatSent,
  logNotification,
  upsertSubscriber,
  deactivateSubscriber,
} from "./db";
import { sendTelegramMessage } from "./telegram";
import type { Env } from "./env";

export type { Env };

const OWNER_CHAT_ID = "750182271";

// ===========================================
// FETCH handler — Telegram webhook + admin endpoints
// ===========================================
const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── Health check ──────────────────────────────────
    if (path === "/__health") {
      return Response.json({
        ok: true,
        service: "omda-gold-bot-worker",
        time: new Date().toISOString(),
        cairo: new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" }),
      });
    }

    // ── Test endpoint: send to owner only ─────────────
    if (path === "/__test" || path === "/test") {
      return handleTestSend(env, ctx);
    }

    // ── Telegram webhook (POST) ───────────────────────
    if (request.method === "POST") {
      return handleTelegramWebhook(request, env, ctx);
    }

    // ── Manual trigger (GET) — for testing the cron path ──
    if (request.method === "GET" && (path === "/__trigger" || path === "/")) {
      // Don't run the full cron manually unless triggered with ?force=1
      // (avoids accidental sends). Just return status.
      if (url.searchParams.get("force") === "1") {
        return handleManualTrigger(env, ctx);
      }
      return Response.json({
        ok: true,
        message: "Omda Gold Bot Worker is running. Use /__health for status, /__test for a test send to the owner, or ?force=1 to trigger the hourly send.",
        next_cron: "minute 0 of every hour (Cairo time)",
      });
    }

    return new Response("Not found", { status: 404 });
  },

  // ===========================================
  // SCHEDULED handler — Cron Trigger at :00 every hour
  // ===========================================
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[cron] 🔔 Scheduled trigger fired at ${new Date().toISOString()}`);
    ctx.waitUntil(runHourlyReport(env));
  },
};

export default worker;

// ===========================================
// Telegram webhook handler (/start, /stop, /help)
// ===========================================
async function handleTelegramWebhook(
  request: Request,
  env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  const botToken = env.BOT_TOKEN;
  if (!botToken) {
    console.error("[webhook] BOT_TOKEN secret not set");
    return Response.json({ ok: true });
  }

  try {
    const body = (await request.json()) as {
      update_id: number;
      message?: {
        chat: { id: number };
        from?: { first_name?: string; last_name?: string };
        text?: string;
      };
    };

    if (!body.update_id) {
      return Response.json({ error: "Invalid update" }, { status: 400 });
    }

    const message = body.message;
    if (!message || !message.from) {
      return Response.json({ ok: true });
    }

    const chatId = String(message.chat.id);
    const fromUser = message.from;
    const text = (message.text || "").trim();

    // ── /start — Register / reactivate ───────────────
    if (text === "/start" || text.startsWith("/start ")) {
      const userName =
        (fromUser.first_name || "") + (fromUser.last_name ? ` ${fromUser.last_name}` : "");

      const { created } = await upsertSubscriber(env, {
        chatId,
        botToken: botToken,
        name: userName,
      });

      if (created) {
        await logNotification(env, {
          type: "bot_registration",
          title: `تسجيل مشترك جديد: ${userName}`,
          message: `مشترك جديد: ${userName} (Chat ID: ${chatId}) — via Cloudflare Worker`,
          success: true,
        });

        const welcomeMessage =
          `🎉 أهلاً بيك يا ${userName}!\n\n` +
          `✅ تم تسجيلك بنجاح في بوت أسعار الذهب والعملات\n\n` +
          `📊 هتصلك تحديثات كل ساعة:\n` +
          `  • أسعار الذهب (عيار 24، 22، 21، 18)\n` +
          `  • جنيه الذهب\n` +
          `  • سعر الدولار\n\n` +
          `🔔 أول تقرير هيوصلك في الساعة الجاية (على :00)\n\n` +
          `💡 أوامر البوت:\n` +
          `/start — تسجيل / تفعيل\n` +
          `/stop — إيقاف الإشعارات\n` +
          `/help — المساعدة\n\n` +
          `🤖 <i>يعمل عبر Cloudflare Workers — إرسال مضمون 24/7</i>`;

        await sendTelegramMessage(botToken, chatId, welcomeMessage);
        console.log(`[webhook] ✅ New subscriber: ${userName} (chatId ${chatId})`);
      } else {
        await sendTelegramMessage(
          botToken,
          chatId,
          `👋 أهلاً بيك تاني يا ${userName}!\n\n✅ تم تفعيل الإشعارات\n📊 هتصلك التحديثات كل ساعة على :00\n\n💡 لو عايز توقف الإشعارات ابعت /stop`
        );
        console.log(`[webhook] ✅ Reactivated: ${userName} (chatId ${chatId})`);
      }

      return Response.json({ ok: true, registered: true });
    }

    // ── /stop — Deactivate ───────────────────────────
    if (text === "/stop") {
      const deactivated = await deactivateSubscriber(env, chatId, botToken);
      if (deactivated) {
        await sendTelegramMessage(
          botToken,
          chatId,
          `⏸️ تم إيقاف الإشعارات\n\nلو عايز ترجع تفعّلهم تاني ابعت /start`
        );
      } else {
        await sendTelegramMessage(
          botToken,
          chatId,
          `❌ أنت مش مسجل عندنا\n\nابعت /start عشان تسجل وتستقبل التحديثات`
        );
      }
      return Response.json({ ok: true });
    }

    // ── /help ─────────────────────────────────────────
    if (text === "/help") {
      const helpMessage =
        `🤖 بوت أسعار الذهب والعملات\n\n` +
        `📋 الأوامر المتاحة:\n\n` +
        `/start — تسجيل وتفعيل الإشعارات\n` +
        `/stop — إيقاف الإشعارات\n` +
        `/help — عرض المساعدة\n\n` +
        `📊 البيانات المرسلة كل ساعة:\n` +
        `  • أسعار الذهب (عيار 24، 22، 21، 18)\n` +
        `  • جنيه الذهب\n` +
        `  • سعر الدولار\n\n` +
        `📌 المصادر: iSagha.com + Google Finance\n\n` +
        `Made With ❤️ By Omda`;
      await sendTelegramMessage(botToken, chatId, helpMessage);
      return Response.json({ ok: true });
    }

    // ── Unknown message ───────────────────────────────
    await sendTelegramMessage(
      botToken,
      chatId,
      `🤔 مش فاهم الأمر ده\n\nابعت /start عشان تسجل\nابعت /help عشان تعرف الأوامر`
    );
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[webhook] Error:", error);
    return Response.json({ ok: true }); // Always 200 to Telegram
  }
}

// ===========================================
// Hourly report — the core cron logic
// ===========================================
async function runHourlyReport(env: Env): Promise<void> {
  const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
  console.log(`[hourly] 📨 [${cairoTime}] Starting hourly report...`);

  try {
    // ── Layer 1: global hour-bucket lock ───────────────
    const gotLock = await acquireHourlyLock(env);
    if (!gotLock) {
      console.log(`[hourly] ⏭️ [${cairoTime}] Lock held — already sent this hour`);
      return;
    }
    console.log(`[hourly] 🔓 [${cairoTime}] Lock acquired — proceeding`);

    // ── Fetch prices ───────────────────────────────────
    const prices = await fetchAllPrices();
    if (!prices.gold && !prices.usdEgp) {
      console.error(`[hourly] ❌ [${cairoTime}] No prices fetched — aborting`);
      await logNotification(env, {
        type: "hourly_report_failed",
        title: "Hourly Report Failed — No Prices",
        message: "fetchAllPrices returned no gold and no usdEgp",
        success: false,
        error: "no prices",
      });
      return;
    }

    // ── Build the report ───────────────────────────────
    const message = buildHourlyReport({
      gold: prices.gold,
      usdEgp: prices.usdEgp,
      allKarats: prices.allKarats,
      goldPound: prices.goldPound,
    });

    // ── Get all active subscribers ─────────────────────
    const subscribers = await getActiveSubscribers(env);
    console.log(`[hourly] 👥 ${subscribers.length} active subscriber(s)`);

    if (subscribers.length === 0) {
      console.log(`[hourly] ℹ️ No subscribers — sending to owner only`);
      const result = await sendTelegramMessage(env.BOT_TOKEN, OWNER_CHAT_ID, message);
      await logNotification(env, {
        type: "hourly_report",
        title: "Hourly Price Report (owner fallback)",
        message,
        success: result.ok,
        error: result.error,
      });
      if (result.ok) await markChatSent(env, OWNER_CHAT_ID);
      return;
    }

    // ── Send to each subscriber (with per-chat dedup) ──
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let deactivated = 0;

    for (const sub of subscribers) {
      // Layer 2: per-chat hour-bucket dedup
      if (await wasChatSentThisHour(env, sub.chatId)) {
        console.log(`[hourly] ⏭️ Skipping ${sub.name} (chatId ${sub.chatId}) — already sent this hour`);
        skipped++;
        continue;
      }

      const result = await sendTelegramMessage(sub.botToken, sub.chatId, message);

      await logNotification(env, {
        type: "hourly_report",
        title: `Hourly Price Report - ${sub.name}`,
        message,
        success: result.ok,
        error: result.error,
      });

      if (result.ok) {
        await markChatSent(env, sub.chatId);
        sent++;
        console.log(`[hourly] ✅ Sent to ${sub.name} (chatId ${sub.chatId})`);
      } else {
        failed++;
        console.error(`[hourly] ❌ Failed for ${sub.name}: ${result.error}`);

        // Auto-deactivate blocked users (stored in KV; production sync is best-effort)
        if (
          result.error &&
          (result.error.includes("blocked by the user") ||
            result.error.toLowerCase().includes("forbidden"))
        ) {
          try {
            const kvKey = `subscriber_${sub.chatId}`;
            const existing = await env.SUBSCRIBERS.get(kvKey);
            if (existing) {
              const data = JSON.parse(existing);
              data.active = false;
              data.updatedAt = Date.now();
              await env.SUBSCRIBERS.put(kvKey, JSON.stringify(data));
            }
            deactivated++;
            console.log(`[hourly] 🚫 Auto-deactivated ${sub.name} — bot blocked by user`);
          } catch (err) {
            console.error(`[hourly] Failed to deactivate ${sub.name}:`, err);
          }
        }
      }
    }

    console.log(
      `[hourly] 📊 [${cairoTime}] Done: ${sent} sent, ${failed} failed, ${skipped} skipped, ${deactivated} deactivated`
    );
  } catch (error) {
    console.error(`[hourly] ❌ Fatal error:`, error);
  }
}

// ===========================================
// Test send — owner only (bypasses lock)
// ===========================================
async function handleTestSend(env: Env, _ctx: ExecutionContext): Promise<Response> {
  try {
    console.log("[test] 🧪 Sending test report to owner only");
    const prices = await fetchAllPrices();
    if (!prices.gold && !prices.usdEgp) {
      return Response.json(
        { ok: false, error: "لم يتم العثور على الأسعار" },
        { status: 500 }
      );
    }

    const message =
      `🧪 <b>رسالة تجريبية — للمالك فقط (Cloudflare Worker)</b>\n\n` +
      buildHourlyReport({
        gold: prices.gold,
        usdEgp: prices.usdEgp,
        allKarats: prices.allKarats,
        goldPound: prices.goldPound,
      });

    const result = await sendTelegramMessage(env.BOT_TOKEN, OWNER_CHAT_ID, message);
    await logNotification(env, {
      type: "test_report_owner",
      title: "Test Report (Owner Only) — Cloudflare Worker",
      message,
      success: result.ok,
      error: result.error,
    });

    return Response.json({
      ok: result.ok,
      test: true,
      recipient: `owner (${OWNER_CHAT_ID})`,
      via: "cloudflare-worker",
      error: result.error,
      prices: {
        gold: prices.gold?.sellPrice ?? null,
        usdEgp: prices.usdEgp?.price ?? null,
      },
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// ===========================================
// Manual trigger — run the full hourly logic
// ===========================================
async function handleManualTrigger(env: Env, ctx: ExecutionContext): Promise<Response> {
  ctx.waitUntil(runHourlyReport(env));
  return Response.json({
    ok: true,
    message: "Hourly report triggered — check Worker logs for results",
    via: "cloudflare-worker",
  });
}
