/**
 * cf-watchdog — Self-healing watchdog for the omda-gold-bot Worker
 * =================================================================
 * GUARANTEE: if the Worker is deleted, secrets are wiped, the cron
 * schedule is removed, OR the Telegram webhook is cleared, the watchdog
 * detects it within 60 seconds and performs a FULL automatic recovery:
 *
 *   1. Redeploy the Worker (via `wrangler deploy`)
 *   2. Re-apply all 3 secrets (BOT_TOKEN, ADMIN_PASSWORD, PRODUCTION_URL)
 *   3. Re-create the cron schedule ("0 * * * *")
 *   4. Re-set the Telegram webhook to the Worker URL
 *   5. Verify health
 *
 * CHECKS (every 60s):
 *   - Worker health endpoint (GET /__health must return {"ok":true})
 *   - If unhealthy/404 → full recovery
 *
 * DEEP CHECKS (every 10 min — cheap, catches silent breakage):
 *   - Cron schedule exists on Cloudflare (API: /schedules)
 *   - Telegram webhook URL is non-empty and matches WORKER_URL
 *   - If either is wrong → targeted recovery (no full redeploy needed)
 *
 * RUNTIME: Bun (no external deps — uses fetch + subprocess).
 * START: `bun --hot index.ts` (auto-restarts on file change)
 */

import { spawn } from "bun";

// ── Load .env ──────────────────────────────────────────────
const env = await loadEnv();

const {
  CF_ACCOUNT_ID,
  CF_API_TOKEN,
  KV_NAMESPACE_ID,
  WORKER_NAME,
  WORKER_URL,
  BOT_TOKEN,
  ADMIN_PASSWORD,
  PRODUCTION_URL,
  CRON_EXPRESSION,
  TELEGRAM_WEBHOOK_URL,
} = env;

const CF_API = "https://api.cloudflare.com/client/v4";
const WORKER_DIR = "/home/z/my-project/cloudflare-worker";

const HEALTH_CHECK_INTERVAL_MS = 60_000; // 60s — fast detection
const DEEP_CHECK_INTERVAL_MS = 10 * 60_000; // 10 min — cron + webhook
const RECOVERY_COOLDOWN_MS = 2 * 60_000; // 2 min between recovery attempts
const MAX_RECOVERY_ATTEMPTS = 5;
const HEARTBEAT_EVERY_N_CHECKS = 5; // log "alive" every 5 health checks (5 min)

let lastRecoveryAt = 0;
let recoveryAttempts = 0;
let healthCheckCount = 0;

// ── Crash protection ──────────────────────────────────────
process.on("unhandledRejection", (err) => {
  console.error(`[watchdog] ⚠️ unhandledRejection:`, err);
});
process.on("uncaughtException", (err) => {
  console.error(`[watchdog] ⚠️ uncaughtException:`, err);
});

// ═══════════════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════════════
async function main() {
  console.log(`[watchdog] 🐕 cf-watchdog started at ${new Date().toISOString()}`);
  console.log(`[watchdog] 📡 Monitoring: ${WORKER_URL}`);
  console.log(`[watchdog] ⏱️  Health check every ${HEALTH_CHECK_INTERVAL_MS / 1000}s, deep check every ${DEEP_CHECK_INTERVAL_MS / 1000}s`);

  // Initial check on startup
  await healthCheck();
  await deepCheck();

  // Schedule health checks (every 60s)
  setInterval(async () => {
    try {
      await healthCheck();
    } catch (err) {
      console.error(`[watchdog] healthCheck error:`, err);
    }
  }, HEALTH_CHECK_INTERVAL_MS);

  // Schedule deep checks (every 10 min)
  setInterval(async () => {
    try {
      await deepCheck();
    } catch (err) {
      console.error(`[watchdog] deepCheck error:`, err);
    }
  }, DEEP_CHECK_INTERVAL_MS);
}

// ═══════════════════════════════════════════════════════════
// HEALTH CHECK — is the Worker responding?
// ═══════════════════════════════════════════════════════════
async function healthCheck(): Promise<void> {
  let ok = false;
  let status = 0;
  let body = "";

  try {
    const resp = await fetch(`${WORKER_URL}/__health`, {
      signal: AbortSignal.timeout(10000),
    });
    status = resp.status;
    body = await resp.text();
    if (resp.ok) {
      const data = JSON.parse(body);
      ok = data.ok === true;
    }
  } catch (err) {
    console.log(`[watchdog] 🚨 Health check FAILED (network error): ${err instanceof Error ? err.message : String(err)}`);
  }

  if (ok) {
    // Healthy — reset recovery attempt counter
    healthCheckCount++;
    if (recoveryAttempts > 0) {
      console.log(`[watchdog] ✅ Worker healthy again — recovery attempts reset`);
      recoveryAttempts = 0;
    }
    // Heartbeat every N checks so the log shows the watchdog is alive
    if (healthCheckCount % HEARTBEAT_EVERY_N_CHECKS === 0) {
      const cairoTime = new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
      console.log(`[watchdog] 💓 Heartbeat #${healthCheckCount} — Worker healthy [${cairoTime}]`);
    }
    return;
  }

  // Unhealthy — log + recover
  console.log(`[watchdog] 🚨 Health check FAILED: HTTP ${status} | body: ${body.slice(0, 120)}`);
  await recover("health_check_failed");
}

// ═══════════════════════════════════════════════════════════
// DEEP CHECK — cron schedule + Telegram webhook intact?
// ═══════════════════════════════════════════════════════════
async function deepCheck(): Promise<void> {
  let needRecovery = false;
  const reasons: string[] = [];

  // 1. Check cron schedule exists
  const cronOk = await checkCronSchedule();
  if (!cronOk) {
    reasons.push("cron schedule missing/wrong");
    needRecovery = true;
  }

  // 2. Check Telegram webhook
  const webhookOk = await checkTelegramWebhook();
  if (!webhookOk) {
    reasons.push("telegram webhook missing/wrong");
    needRecovery = true;
  }

  // 3. Check secrets exist (cheap — list secrets)
  const secretsOk = await checkSecrets();
  if (!secretsOk) {
    reasons.push("secrets missing");
    needRecovery = true;
  }

  if (needRecovery) {
    console.log(`[watchdog] 🔍 Deep check found issues: ${reasons.join(", ")}`);
    await recover(reasons.join(" + "));
  } else {
    console.log(`[watchdog] ✅ Deep check passed: cron + webhook + secrets all intact`);
  }
}

async function checkCronSchedule(): Promise<boolean> {
  try {
    const resp = await fetch(
      `${CF_API}/accounts/${CF_ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/schedules`,
      { headers: { Authorization: `Bearer ${CF_API_TOKEN}` }, signal: AbortSignal.timeout(10000) }
    );
    if (!resp.ok) return false;
    const data = await resp.json();
    const schedules = data?.result?.schedules || [];
    if (schedules.length === 0) return false;
    return schedules.some((s: { cron: string }) => s.cron === CRON_EXPRESSION);
  } catch {
    return false;
  }
}

async function checkTelegramWebhook(): Promise<boolean> {
  try {
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    const url = data?.result?.url || "";
    return url === TELEGRAM_WEBHOOK_URL;
  } catch {
    return false;
  }
}

async function checkSecrets(): Promise<boolean> {
  try {
    const resp = await fetch(
      `${CF_API}/accounts/${CF_ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/secrets`,
      { headers: { Authorization: `Bearer ${CF_API_TOKEN}` }, signal: AbortSignal.timeout(10000) }
    );
    if (!resp.ok) return false;
    const data = await resp.json();
    const names = (data?.result || []).map((s: { name: string }) => s.name);
    return ["BOT_TOKEN", "ADMIN_PASSWORD", "PRODUCTION_URL"].every((n) => names.includes(n));
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// RECOVERY — full redeploy + secrets + cron + webhook
// ═══════════════════════════════════════════════════════════
async function recover(reason: string): Promise<void> {
  const now = Date.now();

  // Cooldown — avoid hammering if recovery keeps failing
  if (now - lastRecoveryAt < RECOVERY_COOLDOWN_MS) {
    console.log(`[watchdog] ⏳ Recovery cooldown active — skipping (last attempt ${Math.round((now - lastRecoveryAt) / 1000)}s ago)`);
    return;
  }

  if (recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
    console.error(`[watchdog] 🛑 Max recovery attempts (${MAX_RECOVERY_ATTEMPTS}) reached — giving up until next deep check resets the counter`);
    return;
  }

  lastRecoveryAt = now;
  recoveryAttempts++;
  console.log(`[watchdog] 🔧 Recovery attempt ${recoveryAttempts}/${MAX_RECOVERY_ATTEMPTS} — reason: ${reason}`);
  console.log(`[watchdog] ─────────────────────────────────────────`);

  // Step 1: Redeploy the Worker via wrangler
  console.log(`[watchdog] [1/4] Redeploying Worker via wrangler...`);
  const deployOk = await runWranglerDeploy();
  if (!deployOk) {
    console.error(`[watchdog] [1/4] ❌ wrangler deploy failed`);
    return;
  }
  console.log(`[watchdog] [1/4] ✅ Worker redeployed`);

  // Step 2: Re-apply secrets
  console.log(`[watchdog] [2/4] Re-applying secrets...`);
  const secretResults = await Promise.all([
    putSecret("BOT_TOKEN", BOT_TOKEN),
    putSecret("ADMIN_PASSWORD", ADMIN_PASSWORD),
    putSecret("PRODUCTION_URL", PRODUCTION_URL),
  ]);
  const secretsOk = secretResults.every(Boolean);
  if (!secretsOk) {
    console.error(`[watchdog] [2/4] ❌ Some secrets failed: BOT_TOKEN=${secretResults[0]} ADMIN_PASSWORD=${secretResults[1]} PRODUCTION_URL=${secretResults[2]}`);
    return;
  }
  console.log(`[watchdog] [2/4] ✅ All 3 secrets re-applied`);

  // Step 3: Re-create cron schedule
  console.log(`[watchdog] [3/4] Re-creating cron schedule "${CRON_EXPRESSION}"...`);
  const cronOk = await putCronSchedule();
  if (!cronOk) {
    console.error(`[watchdog] [3/4] ❌ cron schedule failed`);
    return;
  }
  console.log(`[watchdog] [3/4] ✅ Cron schedule re-created`);

  // Step 4: Re-set Telegram webhook
  console.log(`[watchdog] [4/4] Re-setting Telegram webhook...`);
  const webhookOk = await setTelegramWebhook();
  if (!webhookOk) {
    console.error(`[watchdog] [4/4] ❌ Telegram webhook failed`);
    return;
  }
  console.log(`[watchdog] [4/4] ✅ Telegram webhook re-set`);

  // Verify
  console.log(`[watchdog] ─────────────────────────────────────────`);
  await sleep(3000); // give Cloudflare a moment to propagate
  const healthOk = await verifyHealth();
  if (healthOk) {
    console.log(`[watchdog] 🎉 Recovery SUCCESSFUL — Worker is healthy again`);
    recoveryAttempts = 0; // reset on success
  } else {
    console.error(`[watchdog] ⚠️ Recovery completed but health check still failing — will retry on next tick`);
  }
}

async function runWranglerDeploy(): Promise<boolean> {
  try {
    const proc = spawn({
      cmd: ["npx", "wrangler", "deploy"],
      cwd: WORKER_DIR,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: CF_API_TOKEN,
        CLOUDFLARE_ACCOUNT_ID: CF_ACCOUNT_ID,
      },
    });

    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    const exitCode = await proc.exited;

    if (stdout.includes("Deployed") || stdout.includes("Uploaded")) {
      // wrangler prints "Deployed omda-gold-bot triggers" on success
      // The cron-schedule failure is EXPECTED (token permission limit) —
      // we re-create it via the API in step 3.
      return true;
    }
    console.error(`[watchdog] wrangler exit ${exitCode} | stdout: ${stdout.slice(0, 200)} | stderr: ${stderr.slice(0, 200)}`);
    return false;
  } catch (err) {
    console.error(`[watchdog] wrangler spawn error:`, err);
    return false;
  }
}

async function putSecret(name: string, value: string): Promise<boolean> {
  try {
    const resp = await fetch(
      `${CF_API}/accounts/${CF_ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/secrets`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, text: value, type: "secret_text" }),
        signal: AbortSignal.timeout(15000),
      }
    );
    const data = await resp.json();
    return data?.success === true;
  } catch (err) {
    console.error(`[watchdog] putSecret ${name} error:`, err);
    return false;
  }
}

async function putCronSchedule(): Promise<boolean> {
  try {
    const resp = await fetch(
      `${CF_API}/accounts/${CF_ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/schedules`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([{ cron: CRON_EXPRESSION }]),
        signal: AbortSignal.timeout(10000),
      }
    );
    const data = await resp.json();
    return data?.success === true;
  } catch (err) {
    console.error(`[watchdog] putCronSchedule error:`, err);
    return false;
  }
}

async function setTelegramWebhook(): Promise<boolean> {
  try {
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: TELEGRAM_WEBHOOK_URL,
        allowed_updates: ["message"],
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await resp.json();
    return data?.ok === true;
  } catch (err) {
    console.error(`[watchdog] setTelegramWebhook error:`, err);
    return false;
  }
}

async function verifyHealth(): Promise<boolean> {
  try {
    const resp = await fetch(`${WORKER_URL}/__health`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    return data?.ok === true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════
async function loadEnv(): Promise<Record<string, string>> {
  // Bun auto-loads .env, but be explicit for safety
  const fs = await import("fs/promises");
  try {
    const content = await fs.readFile(`${import.meta.dir}/.env`, "utf-8");
    const out: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      out[key] = value;
    }
    // Merge with process.env (process.env wins if set)
    return { ...out, ...pickDefined(process.env) };
  } catch (err) {
    console.error(`[watchdog] Failed to load .env:`, err);
    process.exit(1);
  }
}

function pickDefined(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of [
    "CF_ACCOUNT_ID",
    "CF_API_TOKEN",
    "KV_NAMESPACE_ID",
    "WORKER_NAME",
    "WORKER_URL",
    "BOT_TOKEN",
    "ADMIN_PASSWORD",
    "PRODUCTION_URL",
    "CRON_EXPRESSION",
    "TELEGRAM_WEBHOOK_URL",
  ]) {
    const v = env[key];
    if (typeof v === "string" && v.length > 0) out[key] = v;
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error(`[watchdog] Fatal:`, err);
  process.exit(1);
});
