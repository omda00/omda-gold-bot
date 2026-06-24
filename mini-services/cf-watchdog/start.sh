#!/bin/bash
# ============================================================
# cf-watchdog start script
# Runs the watchdog as a resilient background daemon with auto-restart.
# ============================================================
cd "$(dirname "$0")"

# Kill any existing watchdog
pkill -f "cf-watchdog/index.ts" 2>/dev/null
sleep 1

# Start with keep-alive loop (restarts if bun crashes)
nohup bash -c '
  while true; do
    cd /home/z/my-project/mini-services/cf-watchdog
    /usr/local/bin/bun run index.ts >> /home/z/my-project/mini-services/cf-watchdog/watchdog.log 2>&1
    EXIT=$?
    echo "[$(date)] watchdog exited ($EXIT), restarting in 5s..." >> watchdog.log
    sleep 5
  done
' > /dev/null 2>&1 &

echo $! > watchdog.pid
disown 2>/dev/null || true
echo "✅ cf-watchdog started (PID $(cat watchdog.pid))"
echo "   Logs: $(pwd)/watchdog.log"
