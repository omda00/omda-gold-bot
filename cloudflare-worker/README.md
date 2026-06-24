# Omda Gold Bot — Cloudflare Worker

24/7 hourly Telegram gold price reports via Cloudflare Workers Cron Triggers.

## Why Cloudflare Workers?

The previous setup relied on:
- A Vercel Hobby deployment (no hourly cron support — only daily)
- A local dev-server scheduler (depends on the dev server being up)
- A standalone cron-service (redundancy, but another process to maintain)

Cloudflare Workers Cron Triggers are **guaranteed to fire** on schedule, with
no uptime concerns. This Worker is the **primary** hourly delivery mechanism
now — the Vercel app remains for the dashboard + admin UI.

## Architecture

```
Telegram ──webhook──> Cloudflare Worker (fetch handler)
                            │
                            ├─ /start → upsert subscriber (KV + sync to Vercel)
                            ├─ /stop  → deactivate subscriber
                            └─ /help  → show help

Cloudflare Cron ──:00──> Worker (scheduled handler)
                            │
                            ├─ acquireHourlyLock (KV hour-bucket)
                            ├─ fetchAllPrices (iSagha + Google Finance)
                            ├─ getActiveSubscribers (Vercel admin API + KV cache)
                            └─ send to each (per-chat KV hour-bucket dedup)
```

### Dedup (3 layers, all in Cloudflare KV)
1. **Global hour-bucket lock** — `HOURLY_REPORT_LOCK` = current Cairo hour bucket
2. **Per-chat hour-bucket** — `LAST_REPORT_CHAT_<chatId>` = current Cairo hour bucket
3. **In-memory chatId dedup** — within a single send loop

KV entries have a 1-hour TTL so they auto-cleanup.

## Files
- `src/index.ts` — entry point: `fetch` (webhook) + `scheduled` (cron) handlers
- `src/price-fetcher.ts` — iSagha gold + Google Finance USD/EGP extraction
- `src/db.ts` — subscriber management (Vercel API + KV cache + lock/dedup)
- `src/telegram.ts` — Telegram Bot API sender
- `src/env.ts` — shared Env interface
- `wrangler.toml` — Worker config + KV binding + cron schedule

## Deploy

```bash
cd cloudflare-worker
bun install

# Set secrets (one-time)
echo "8935785205:AAFa..." | npx wrangler secret put BOT_TOKEN
echo "908070" | npx wrangler secret put ADMIN_PASSWORD
echo "https://omda-gold-bot.vercel.app" | npx wrangler secret put PRODUCTION_URL

# Deploy
npx wrangler deploy

# Add cron schedule (if wrangler deploy didn't add it — token permission issue)
curl -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/workers/scripts/omda-gold-bot/schedules" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '[{"cron":"0 * * * *"}]'
```

## Telegram Webhook

After deploy, point the Telegram webhook at the Worker:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://omda-gold-bot.fces7007.workers.dev","allowed_updates":["message"]}'
```

## Endpoints
- `GET /` — status (use `?force=1` to manually trigger the hourly send)
- `GET /__health` — health check
- `GET /__test` — send a test report to the OWNER ONLY (750182271)
- `POST /` — Telegram webhook (handles /start, /stop, /help)

## Logs
```bash
npx wrangler tail
```

## KV Namespace
- Name: `SUBSCRIBERS`
- ID: `0b56e3ecfe53487daa7f436ae881c225`
- Keys: `active_subscribers`, `HOURLY_REPORT_LOCK`, `LAST_REPORT_CHAT_<id>`, `subscriber_<id>`
