#!/bin/bash
cd /home/z/my-project/mini-services/cron-service
exec /usr/local/bin/bun index.ts >> /home/z/my-project/mini-services/cron-service/cron-service.log 2>&1
