#!/bin/bash
cd /home/z/my-project
# Double fork to completely detach
(setsid node node_modules/.bin/next dev -p 3000 > /home/z/my-project/dev.log 2>&1 &)
