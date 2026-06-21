#!/bin/bash
# Start cron-service as a detached daemon
cd /home/z/my-project/mini-services/cron-service
exec bun index.ts >> cron-service.log 2>&1
