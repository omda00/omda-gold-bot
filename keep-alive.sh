#!/bin/bash
# Keep-alive wrapper for Next.js dev server
# Restarts the server if it dies

cd /home/z/my-project

while true; do
    echo "[$(date)] Starting Next.js dev server..." >> /home/z/my-project/dev.log
    node node_modules/.bin/next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
    EXIT_CODE=$?
    echo "[$(date)] Next.js exited with code $EXIT_CODE, restarting in 3s..." >> /home/z/my-project/dev.log
    sleep 3
done
