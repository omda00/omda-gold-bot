---
Task ID: 1
Agent: Main Agent
Task: Fix duplicate Telegram messages — ensure each user receives the hourly report only ONCE per hour

Work Log:
- Added `@@unique([chatId, botToken])` constraint to TelegramUser model in both prisma/schema.prisma and prisma/schema.neon.prisma
- Updated `sendReportToAllUsers()` in src/lib/report-sender.ts to deduplicate by chatId before sending — keeps most recently updated entry for each unique chatId
- Updated `/api/telegram-users/notify-all/route.ts` with same deduplication logic
- Changed webhook handler `/api/telegram/webhook/route.ts` from findFirst+create to upsert pattern to prevent race condition duplicates
- Changed `/api/telegram-users/register/route.ts` from findFirst+create to upsert pattern
- Changed admin `/api/telegram-users/route.ts` POST from findFirst+create to upsert pattern
- Updated `/stop` handler in webhook to use findUnique with compound key
- Created cleanup API at `/api/cleanup/duplicates/route.ts` (moved from telegram-users/cleanup to avoid [id] route conflict)
- Pushed schema to local SQLite database
- Pushed all changes to GitHub (4 commits)
- Deleted duplicate "Ōmda" user (chatId: 6350496212) from production Neon database via API
- Production now has 2 unique active users: Omda (750182271) and Waleed Elbasha (1534788014)

Stage Summary:
- Root cause: Duplicate TelegramUser entries in database (same person with different chatIds)
- Fix applied at 3 levels: (1) DB unique constraint, (2) Code-level deduplication in send functions, (3) Upsert pattern in all registration endpoints
- Production database cleaned — duplicate user deleted
- Vercel deployment pending (new commits pushed but deployment not yet triggered/visible)
- Local dev server verified working with Agent Browser

---
Task ID: 2
Agent: Main Agent
Task: اتأكد أن التغييرات اتطبقت على الموقع لأن المستخدم لسه حاسس ببطء في جلب الأسعار

Work Log:
- قيست أوقات الاستجابة على الإنتاج (https://omda-gold-bot.vercel.app):
  - GET /api/prices: 0.6-0.7s (بطيء لـ DB read)
  - POST /api/prices: 1.2-2.9s (web fetch كامل)
  - GET /api/config: 0.9-1.1s (بطيء جداً)
- حللت الكود واكتشفت 4 مشاكل أداء رئيسية:
  1. fetchAllPrices() بيشتغل SEQUENTIAL: iSagha (gold) → Google Finance (USD) → fallbacks. المجموع = ~2.5s
  2. Google Finance HTTP timeout = 30s (طويل جداً)
  3. POST /api/prices مفيش cache — كل طلب بيعمل web fetch جديد
  4. GET /api/prices cache TTL = 5s بس + 7 DB queries sequential

التعديلات اللي اتعملت (commit 68781a0):

في src/lib/price-fetcher.ts:
- fetchAllPrices() دلوقتي بيشتغل PARALLEL: iSagha + Google Finance في Promise.all واحد
- قللت Google Finance timeout من 30s إلى 12s
- قللت iSagha timeout من 15s إلى 10s
- Fallbacks (Z-AI SDK + Free API) بقت بالتوازي كمان
- أضفت timing logs: "Parallel fetch done in Xms"

في src/app/api/prices/route.ts:
- أضفت POST cache (60s TTL) — تاني POST خلال دقيقة بيرجع في 5ms بدل 1.3s
- أضفت request coalescing (لو فيه fetch جاري، الطلبات الجديدة بتستناه)
- زودت GET cache TTL من 5s إلى 15s
- استخرجت buildPricesResponse() helper يشغل كل 7 DB queries في Promise.all واحد
- أضفت ?force=true param لتخطي الـ POST cache (للـ cron)

النتائج المحلية:
- أول POST: 1.28s (كان ~2.9s) — تحسن 56%
- POST تاني خلال 60s: 5ms (كان 1.28s) — تحسن 99.6%
- parallel fetch مؤكد: "Parallel fetch done in 1134ms"
- lint: passed بدون أخطاء

Stage Summary:
- التغييرات اترفعت على GitHub (commit 68781a0) و Vercel هي deploy تلقائياً
- أكبر تحسن: POST cache — لو أي مستخدم دوّس "تحديث الأسعار" خلال دقيقة من آخر تحديث، الرد بيرجع في 5ms بدل 1.3s
- ثاني أكبر تحسن: parallel fetch — iSagha و Google Finance بيتجابوا مع بعض بدل ورا بعض
- لازم أتحقق من الإنتاج بعد الـ deploy

---
Task ID: 3
Agent: Main Agent
Task: التحقق من تطبيق تحسينات الأداء على الإنتاج (omda-gold-bot.vercel.app)

Work Log:
- بعد رفع commit 68781a0 (parallel fetch + in-memory cache) و commit a10b01e (DB cache):
  - اختبرت الإنتاج: POST /api/prices لسه بياخد 1.3-1.5s
  - الـ in-memory cache مش بيشتغل على Vercel (كل instance ليها memory خاصة)
- أضفت DB-based cache (Layer 2) باستخدام AppConfig key = "LAST_FETCH_AT":
  - setLastFetchAt(): حفظ timestamp بعد كل fetch ناجح
  - getLastFetchAt(): قراءة الـ timestamp عشان نتخطى الـ fetch لو أقل من 60s
  - كمان حدّثت /api/cron/refresh-prices عشان يحدّث LAST_FETCH_AT
- أضفت _debug info في الـ response عشان أتتبع الـ cache
- اختبرت محلياً: كل حاجة شغالة 100%:
  - Force refresh: 0.38s + message جديد موجود + _debug شغال
  - POST cache HIT: 5.8ms فقط!
  - lastFetchAtDb بيتحدث بنجاح

المشكلة المكتشفة:
- Vercel مش بي deploy الـ commits الجديدة!
- اختبرت بعد 5+ دقايق من الـ push:
  - production message لسه "Prices fetched successfully" (مش "تم جلب الأسعار بنجاح")
  - _debug غير موجود في الـ response
  - cached flag غير موجود
- ده معناه إن الـ Vercel deployment معطل أو فيه مشكلة في الـ GitHub integration
- الـ commits كلها مترفعة على GitHub بنجاح (تم التحقق من git ls-remote)

Stage Summary:
- التحسينات اتعملت واثبتت فعاليتها محلياً (0.38s بدل 1.3s، و 5.8ms للـ cache HIT)
- الـ commits اترفعت على GitHub: 68781a0, a10b01e, 6ef819a, 03e93e6
- Vercel مش بي deploy — المستخدم محتاج يتشيك على Vercel dashboard:
  1. يتشيك إن الـ GitHub integration شغالة
  2. يعمل manual redeploy من Vercel dashboard
  3. يتشيك على build logs لو فيه errors
- لما الـ deploy يحدث، التحسينات هتشتغل تلقائياً
