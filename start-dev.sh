#!/bin/bash
cd /home/z/my-project
exec node node_modules/.bin/next dev -p 3000 2>&1 | tee /home/z/my-project/dev.log
