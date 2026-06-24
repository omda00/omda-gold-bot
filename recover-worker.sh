#!/bin/bash
# ============================================================
# recover-worker.sh — Manual one-command recovery
# ============================================================
# Use this if the watchdog is somehow down and you need to
# manually restore the Cloudflare Worker. It performs the exact
# same steps as the watchdog's recover() function:
#   1. wrangler deploy
#   2. re-apply 3 secrets
#   3. re-create cron schedule
#   4. re-set Telegram webhook
#   5. verify health
#
# Usage: ./recover-worker.sh
# ============================================================
set -e

ENV_FILE="/home/z/my-project/mini-services/cf-watchdog/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ .env file not found at $ENV_FILE"
  exit 1
fi

# Source env
set -a
source "$ENV_FILE"
set +b

CF_API="https://api.cloudflare.com/client/v4"

echo "============================================================"
echo "🔧 Manual Worker Recovery"
echo "============================================================"
echo "Worker: $WORKER_NAME"
echo "URL:    $WORKER_URL"
echo ""

# Step 1: wrangler deploy
echo "[1/5] Redeploying Worker via wrangler..."
cd /home/z/my-project/cloudflare-worker
CLOUDFLARE_API_TOKEN="$CF_API_TOKEN" CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT_ID" npx wrangler deploy 2>&1 | grep -E "Deployed|Uploaded|error|ERROR" | head -5
echo "[1/5] ✅ Done"
echo ""

# Step 2: secrets
echo "[2/5] Re-applying secrets..."
for KV in "BOT_TOKEN:$BOT_TOKEN" "ADMIN_PASSWORD:$ADMIN_PASSWORD" "PRODUCTION_URL:$PRODUCTION_URL"; do
  NAME="${KV%%:*}"
  VAL="${KV#*:}"
  RESULT=$(curl -s -X PUT "$CF_API/accounts/$CF_ACCOUNT_ID/workers/scripts/$WORKER_NAME/secrets" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$NAME\",\"text\":\"$VAL\",\"type\":\"secret_text\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('success',False))")
  echo "   $NAME: $RESULT"
done
echo "[2/5] ✅ Done"
echo ""

# Step 3: cron schedule
echo "[3/5] Re-creating cron schedule '$CRON_EXPRESSION'..."
curl -s -X PUT "$CF_API/accounts/$CF_ACCOUNT_ID/workers/scripts/$WORKER_NAME/schedules" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "[{\"cron\":\"$CRON_EXPRESSION\"}]" | python3 -c "import sys,json;d=json.load(sys.stdin);print('   success:',d.get('success'))"
echo "[3/5] ✅ Done"
echo ""

# Step 4: Telegram webhook
echo "[4/5] Re-setting Telegram webhook..."
curl -s -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"$TELEGRAM_WEBHOOK_URL\",\"allowed_updates\":[\"message\"]}" | python3 -c "import sys,json;d=json.load(sys.stdin);print('   ok:',d.get('ok'),'|',d.get('description',''))"
echo "[4/5] ✅ Done"
echo ""

# Step 5: verify health
echo "[5/5] Verifying health..."
sleep 3
HEALTH=$(curl -s -w "\nHTTP:%{http_code}" "$WORKER_URL/__health")
echo "   $HEALTH"
echo ""
echo "============================================================"
echo "🎉 Recovery complete!"
echo "============================================================"
