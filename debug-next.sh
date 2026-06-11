#!/bin/bash
cd /home/z/my-project

# Trap signals to log them
trap 'echo "[$(date)] Received SIGHUP" >> /tmp/next-signals.log' SIGHUP
trap 'echo "[$(date)] Received SIGINT" >> /tmp/next-signals.log' SIGINT
trap 'echo "[$(date)] Received SIGTERM" >> /tmp/next-signals.log' SIGTERM
trap 'echo "[$(date)] Received SIGUSR1" >> /tmp/next-signals.log' SIGUSR1
trap 'echo "[$(date)] Received SIGUSR2" >> /tmp/next-signals.log' SIGUSR2

echo "[$(date)] Starting Next.js with PID $$" >> /tmp/next-signals.log

NODE_OPTIONS="--max-old-space-size=1024" node node_modules/.bin/next dev -p 3000 -H 0.0.0.0 >> /tmp/next-debug.log 2>&1
EXIT_CODE=$?
echo "[$(date)] Next.js exited with code $EXIT_CODE" >> /tmp/next-signals.log
