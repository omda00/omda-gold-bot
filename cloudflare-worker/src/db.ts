/**
 * Subscriber management via the production Vercel API.
 *
 * WHY NOT CONNECT TO NEON DIRECTLY?
 * The Neon DATABASE_URL is not available locally (it's only set as a
 * Vercel environment variable). Rather than risk exposing it or creating
 * a second connection, this Worker fetches the active subscriber list
 * from the production admin API (authenticated via admin password).
 *
 * The Worker also caches subscribers in Cloudflare KV for resilience —
 * if the Vercel API is briefly unreachable, the Worker still sends to
 * the last-known subscriber list.
 *
 * LOCK + DEDUP are stored in Cloudflare KV too (no DB needed):
 *   - HOURLY_REPORT_LOCK = current Cairo hour bucket
 *   - LAST_REPORT_CHAT_<chatId> = current Cairo hour bucket
 */

import type { Env } from "./env";

export interface Subscriber {
  id?: string;
  name: string;
  botToken: string;
  chatId: string;
  active: boolean;
}

/** Get the Cairo hour bucket: "YYYY-MM-DD-HH". */
export function getCairoHourBucket(date: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  return fmt.format(date);
}

/** Get an admin session token from the production API. */
async function getAdminToken(env: Env): Promise<string | null> {
  try {
    const response = await fetch(`${env.PRODUCTION_URL}/api/auth/admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: env.ADMIN_PASSWORD }),
      signal: AbortSignal.timeout(10000) as unknown as AbortSignal,
    });
    const setCookie = response.headers.get("set-cookie") || "";
    const match = setCookie.match(/admin_session=([^;]+)/);
    return match ? match[1] : null;
  } catch (err) {
    console.error("[admin] Failed to get admin token:", err);
    return null;
  }
}

/** Fetch active subscribers from the production Vercel API. */
async function fetchSubscribersFromProduction(env: Env): Promise<Subscriber[]> {
  const token = await getAdminToken(env);
  if (!token) {
    console.error("[subscribers] No admin token — using KV cache");
    return [];
  }

  try {
    const response = await fetch(`${env.PRODUCTION_URL}/api/telegram-users`, {
      headers: { Cookie: `admin_session=${token}` },
      signal: AbortSignal.timeout(15000) as unknown as AbortSignal,
    });
    if (!response.ok) {
      console.error(`[subscribers] Production API returned ${response.status}`);
      return [];
    }
    const data = (await response.json()) as Array<{
      name?: string;
      botToken?: string;
      chatId?: string;
      active?: boolean;
    }>;
    // NOTE: The production API returns botToken MASKED (e.g. "****3dzns") for
    // security. Since ALL subscribers use the SAME bot token (it's a single
    // bot), we override with env.BOT_TOKEN (the full secret) so Telegram API
    // calls succeed.
    return data
      .filter((u) => u.active === true && u.chatId)
      .map((u) => ({
        name: u.name || "Unknown",
        botToken: env.BOT_TOKEN,
        chatId: u.chatId as string,
        active: true,
      }));
  } catch (err) {
    console.error("[subscribers] Fetch failed:", err);
    return [];
  }
}

/** Get active subscribers — from production API, falling back to KV cache. */
export async function getActiveSubscribers(env: Env): Promise<Subscriber[]> {
  // Try production first
  const fresh = await fetchSubscribersFromProduction(env);

  if (fresh.length > 0) {
    // Cache in KV for resilience (1 hour TTL)
    try {
      await env.SUBSCRIBERS.put(
        "active_subscribers",
        JSON.stringify(fresh),
        { expirationTtl: 3600 }
      );
    } catch (err) {
      console.warn("[subscribers] KV cache write failed:", err);
    }
    return fresh;
  }

  // Fallback to KV cache
  try {
    const cached = await env.SUBSCRIBERS.get("active_subscribers");
    if (cached) {
      console.log("[subscribers] Using KV cache fallback");
      return JSON.parse(cached) as Subscriber[];
    }
  } catch (err) {
    console.warn("[subscribers] KV cache read failed:", err);
  }

  // Last resort: hardcode the known active subscribers
  // (updated manually if needed — used only if both production + KV fail)
  console.log("[subscribers] Using hardcoded fallback list");
  const botToken = env.BOT_TOKEN;
  return [
    { name: "Owner", botToken, chatId: "750182271", active: true },
  ];
}

// ===========================================
// HOUR-BUCKET LOCK + DEDUP (stored in KV)
// ===========================================

/**
 * Acquire the global hourly lock (Cairo hour-bucket based, stored in KV).
 * Returns true if this caller should send, false if already sent this hour.
 */
export async function acquireHourlyLock(env: Env): Promise<boolean> {
  const bucket = getCairoHourBucket();
  const existing = await env.SUBSCRIBERS.get("HOURLY_REPORT_LOCK");

  if (existing === bucket) {
    // Already sent this hour
    return false;
  }

  // Acquire: store the bucket with a 1-hour TTL (auto-cleanup)
  await env.SUBSCRIBERS.put("HOURLY_REPORT_LOCK", bucket, { expirationTtl: 3600 });
  return true;
}

/** Check if a specific chatId received a report this Cairo hour. */
export async function wasChatSentThisHour(env: Env, chatId: string): Promise<boolean> {
  const bucket = getCairoHourBucket();
  const key = `LAST_REPORT_CHAT_${chatId}`;
  const existing = await env.SUBSCRIBERS.get(key);
  return existing === bucket;
}

/** Mark a chatId as sent this hour (1-hour TTL auto-cleanup). */
export async function markChatSent(env: Env, chatId: string): Promise<void> {
  const bucket = getCairoHourBucket();
  const key = `LAST_REPORT_CHAT_${chatId}`;
  try {
    await env.SUBSCRIBERS.put(key, bucket, { expirationTtl: 3600 });
  } catch (err) {
    console.error(`[db] Failed to mark chat ${chatId} as sent:`, err);
  }
}

/** Log a notification to the production Vercel API (best-effort). */
export async function logNotification(
  env: Env,
  params: { type: string; title: string; message: string; success: boolean; error?: string | null }
): Promise<void> {
  // Best-effort: we don't have direct DB access, so we skip logging to the
  // NotificationLog table. The Worker's own logs (via wrangler tail / the
  // Cloudflare dashboard) serve as the audit trail.
  // To re-enable DB logging, set DATABASE_URL and switch to the Neon version.
  void env;
  console.log(
    `[log] ${params.success ? "✅" : "❌"} ${params.type} | ${params.title}${params.error ? ` | ${params.error}` : ""}`
  );
}

/**
 * Upsert a subscriber by calling the production webhook-equivalent.
 *
 * The /start handler can't write to the production DB directly (no DATABASE_URL),
 * so it registers the user via a simple approach: we store the subscriber in
 * KV AND forward the registration to the production webhook endpoint.
 *
 * The production webhook (https://omda-gold-bot.vercel.app/api/telegram/webhook)
 * writes to Neon. This keeps the two systems in sync.
 */
export async function upsertSubscriber(
  env: Env,
  params: { chatId: string; botToken: string; name: string }
): Promise<{ created: boolean }> {
  const { chatId, botToken, name } = params;

  // Check KV to see if we already know this subscriber
  const kvKey = `subscriber_${chatId}`;
  const existing = await env.SUBSCRIBERS.get(kvKey);
  const created = !existing;

  // Store/update in KV (no TTL — persists until removed)
  await env.SUBSCRIBERS.put(
    kvKey,
    JSON.stringify({ name, botToken, chatId, active: true, updatedAt: Date.now() })
  );

  // ALSO forward to production webhook so the Neon DB stays in sync.
  // This runs in the background — we don't await it (best-effort).
  try {
    const fakeUpdate = {
      update_id: Math.floor(Date.now() / 1000),
      message: {
        message_id: Math.floor(Math.random() * 1e9),
        from: { first_name: name, last_name: "", id: parseInt(chatId) || 0, is_bot: false },
        chat: { id: parseInt(chatId) || 0, type: "private" },
        date: Math.floor(Date.now() / 1000),
        text: "/start",
      },
    };
    // Fire and forget — don't block the webhook response
    fetch(`${env.PRODUCTION_URL}/api/telegram/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fakeUpdate),
      signal: AbortSignal.timeout(10000) as unknown as AbortSignal,
    }).catch((err) => {
      console.warn(`[upsert] Failed to sync to production:`, err);
    });
  } catch (err) {
    console.warn(`[upsert] Production sync error:`, err);
  }

  return { created };
}

/** Deactivate a subscriber (for /stop). */
export async function deactivateSubscriber(
  env: Env,
  chatId: string,
  botToken: string
): Promise<boolean> {
  void botToken;
  const kvKey = `subscriber_${chatId}`;
  const existing = await env.SUBSCRIBERS.get(kvKey);
  if (!existing) return false;

  try {
    const data = JSON.parse(existing);
    data.active = false;
    data.updatedAt = Date.now();
    await env.SUBSCRIBERS.put(kvKey, JSON.stringify(data));
  } catch {
    await env.SUBSCRIBERS.delete(kvKey);
  }

  // Also sync to production by forwarding a /stop-like update
  try {
    const fakeUpdate = {
      update_id: Math.floor(Date.now() / 1000),
      message: {
        message_id: Math.floor(Math.random() * 1e9),
        from: { first_name: "", last_name: "", id: parseInt(chatId) || 0, is_bot: false },
        chat: { id: parseInt(chatId) || 0, type: "private" },
        date: Math.floor(Date.now() / 1000),
        text: "/stop",
      },
    };
    fetch(`${env.PRODUCTION_URL}/api/telegram/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fakeUpdate),
      signal: AbortSignal.timeout(10000) as unknown as AbortSignal,
    }).catch(() => {});
  } catch {
    // ignore
  }

  return true;
}
