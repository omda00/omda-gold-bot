#!/bin/bash
# Keep-alive wrapper for Cron Service
# Restarts the service if it dies

cd /home/z/my-project/mini-services/cron-service

while true; do
    echo "[$(date)] Starting cron-service..." >> /tmp/cron-service-keepalive.log
    bun index.ts >> /tmp/cron-service.log 2>&1
    EXIT_CODE=$?
    echo "[$(date)] Cron service exited with code $EXIT_CODE, restarting in 5s..." >> /tmp/cron-service-keepalive.log
    sleep 5
done
