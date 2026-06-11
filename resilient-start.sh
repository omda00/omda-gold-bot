#!/bin/bash
cd /home/z/my-project

# Trap SIGTERM and just restart instead of dying
trap 'echo "[$(date)] Received SIGTERM, restarting in 2s..." >> /tmp/resilient.log; sleep 2' SIGTERM
trap 'echo "[$(date)] Received SIGINT, restarting in 2s..." >> /tmp/resilient.log; sleep 2' SIGINT

while true; do
    echo "[$(date)] Starting production server..." >> /tmp/resilient.log
    NODE_OPTIONS="--max-old-space-size=256" NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 node .next/standalone/server.js >> /tmp/resilient.log 2>&1
    EXIT_CODE=$?
    echo "[$(date)] Server exited with code $EXIT_CODE, restarting in 3s..." >> /tmp/resilient.log
    sleep 3
done
