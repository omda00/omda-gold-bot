#!/bin/bash
cd /home/z/my-project
while true; do
    echo "[$(date)] Starting Next.js..." >> /tmp/next-keep-alive.log
    node node_modules/.bin/next dev -p 3000 -H 0.0.0.0 >> /tmp/next-output.log 2>&1
    EXIT_CODE=$?
    echo "[$(date)] Next.js exited with code $EXIT_CODE, restarting in 2s..." >> /tmp/next-keep-alive.log
    sleep 2
done
