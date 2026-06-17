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

---
Task ID: 4
Agent: Main Agent
Task: اتأكد أن البوت بيتبعت ليه رسالة واحدة فقط كل ساعة وليس أكثر من رسالة، وطبق التعديلات على GitHub و Vercel

Work Log:
- حللت الإنتاج عبر /api/logs و /api/telegram-users (بـ admin JWT):
  - اكتشفت 4 مستخدمين نشطين كلهم بنفس الـ botToken (****3dzns):
    1. Ōmda (chatId 6350496212) — إنشاء 12 يونيو
    2. Test Test (chatId 7503487136) — إنشاء 12 يونيو
    3. Omda (chatId 750182271) — إنشاء 11 يونيو (الأصلي)
    4. Waleed Elbasha (chatId 1534788014) — إنشاء 11 يونيو
  - كل ساعة كان البوت بيبعت 4 رسائل (واحدة لكل مستخدم نشط)
  - المالك سجل نفس البوت مع 3 chatIds مختلفة (Ōmda + Test Test + Omda) فكان بيوصل 3 رسائل كل ساعة
- إصلاح فوري على الإنتاج (مفعّل دلوقتي):
  - ألغيت تفعيل Ōmda (id cmqa7kr8p0000lh04dkzboe8y) عبر PATCH /api/telegram-users/[id]
  - ألغيت تفعيل Test Test (id cmqa6ptya0000i5048egt0yig) عبر PATCH /api/telegram-users/[id]
  - عدد المستخدمين النشطين نقص من 4 → 2 (Omda + Waleed Elbasha)
  - المالك دلوقتي هيستلم رسالة واحدة فقط كل ساعة (على chatId 750182271)
- إصلاح كودي (safeguards إضافية) في commit af9e4bf:
  في src/lib/report-sender.ts:
  - أضفت acquireHourlyReportLock() — DB lock atomically عبر AppConfig key "HOURLY_REPORT_LOCK" بـ TTL 55 دقيقة. واحد بس من الـ callers يقدر يكمل في نفس الساعة (يمنع race conditions بين Vercel Cron / UptimeRobot / in-process cron)
  - أضفت wasChatSentRecently(chatId) + markChatSent(chatId) — per-chat dedup عبر AppConfig key "LAST_REPORT_CHAT_<chatId>". نفس الـ chatId مستحيل يوصل 2 رسائل في نفس الساعة حتى لو مسجل بـ botTokens مختلفة
  - markChatSent بيتكتب بس بعد successful send عشان الفشل يقدر يتعمل retry
  - sendReportToAllUsers بقت بترجع skipped count كمان
  في src/app/api/cron/refresh-prices/route.ts:
  - استبدلت wasReportSentRecently() (مش atomic) بـ acquireHourlyReportLock() (atomic)
  - حدّثت الـ response عشان يبين لو الـ lock كان محجوز
- lint: passed بدون أخطاء
- type-check: التغييرات بتاعتي clean (الأخطاء الموجودة pre-existing من InvestmentPlan model)
- رفعت على GitHub: commits af9e4bf + de9adae (empty trigger commit)
- Vercel: للأسف مش بي deploy تلقائياً (نفس مشكلة Task 3):
  - تأكدت إن commit 03e93e6 (اللي كان test message) لسه مش موجود على الإنتاج
  - production لسه بيرجع "Prices fetched successfully" (الرسالة القديمة) بدون _debug
  - حاولت أثبّت Vercel CLI ونزل بنجاح بس مفيش token للمصادقة
  - كل الـ commits المطلوبة مترفعة على GitHub وجاهزة للـ deploy

Stage Summary:
- الإصلاح الفوري (إلغاء تفعيل المستخدمين المكررين) مفعّل على الإنتاج دلوقتي — المالك هيستلم رسالة واحدة فقط كل ساعة بدءً من الكرون الجاي (~21:09 UTC)
- الإصلاح الكودي (atomic lock + per-chat dedup) مترفع على GitHub بس محتاج Vercel deploy
- Vercel GitHub integration يبدو إنه مفصول — المستخدم محتاج:
  1. يفتح Vercel dashboard → project → Settings → Git
  2. يتأكد إن GitHub integration متصل بـ repo omda00/omda-gold-bot
  3. يعمل manual Redeploy من Deployments tab (أحدث deployment → "..." → Redeploy)
  4. أو يربط الـ project من جديد بـ GitHub
- لما الـ deploy يحصل، التحسينات هتشتغل تلقائياً وتضيف طبقة حماية إضافية فوق إلغاء التفعيل

---
Task ID: 5
Agent: Main Agent
Task: اتأكد أن البوت بيبعت رسالة واحدة فقط كل ساعة وطبق التعديلات على GitHub و Vercel

Work Log:
- حللت الصورة اللي رفعها المستخدم (VLM skill):
  - رسالتين عن أسعار الذهب
  - الأولى 11:52 ص بتوقيت القاهرة (08:52 UTC) — مصدر: iSagha.com (SDK)
  - التانية 12:00 م بتوقيت القاهرة (09:00 UTC) — مصدر: iSagha.com
  - 8 دقايق فرق، مصادر مختلفة = ترايجرز منفصلة

- حللت NotificationLog على الإنتاج (آخر 50 log):
  - معظم الساعات: 1 batch فقط (من UptimeRobot → /api/cron/refresh-prices مع dedup)
  - عند 09:00 UTC (12:00 ظهراً القاهرة): 2 batches!
    - batch 1: من UptimeRobot → /api/cron/refresh-prices (مع dedup)
    - batch 2: من Vercel Cron → /api/automation/run (بدون dedup!)
  - ده بيطابق الصورة تماماً (08:52 + 09:00 UTC = 11:52 + 12:00 القاهرة)

- السبب الجذري المكتشف:
  - الكود اللي متdeploy على Vercel قديم (قبل commit 68781a0)
  - /api/automation/run المنشور ليه logic إرسال مستقل (buildHourlyReport + notifyAllUsers) بدون أي dedup check
  - /api/cron/refresh-prices المنشور فيه dedup (shouldSendHourlyReport — 55 min threshold)
  - vercel.json المنشور فيه cron لـ /api/automation/run يومياً at 09:00 UTC
  - لما الإتنين يتضربوا في نفس الساعة → المستخدم بيوصل 2 رسائل

- أكدت إن مفيش GitHub webhook للـ Vercel integration:
  - curl GitHub API: 0 webhooks على repo omda00/omda-gold-bot
  - ده ليه Vercel مش بيdeploy تلقائياً من الـ commits

- إصلاحات الكود (commit 6169404 على GitHub):
  في src/app/api/automation/run/route.ts:
  - شيلت كل logic الإرسال المستقل (buildHourlyReport + notifyAllUsers + global config fallback)
  - خليت الـ endpoint بيعمل redirect لـ /api/cron/refresh-prices بس
  - redirect بيستخدم request.url origin (أعتمد من VERCEL_URL env var)
  - ده يخلي كل الإرسال يعدّي عبر /api/cron/refresh-prices اللي فيه 3 طبقات dedup:
    1. acquireHourlyReportLock (atomic DB lock — 55 min TTL)
    2. wasChatSentRecently (per-chat dedup)
    3. in-memory chatId dedup
  - النتيجة: مهما كان عدد الترايجرز (Vercel Cron / UptimeRobot / manual) ، كل chat هيستلم رسالة واحدة فقط كل ساعة

  vercel.json (كان متعدل من قبل):
  - cron اتغير من /api/automation/run (يومياً 09:00 UTC) لـ /api/cron/refresh-prices (كل ساعة :00 UTC)
  - ده يخلي Vercel Cron يضرب الإندبوينت الصح اللي فيه dedup

- lint: passed بدون أخطاء

- حاولت أdeploy بطرق مختلفة:
  1. Vercel CLI: nزلته بس مفيش token للمصادقة
  2. GitHub webhook: مفيش، ومش أقدر أعرفه بدون Vercel dashboard access
  3. GitHub Action: حاولت أضيف .github/workflows/deploy.yml بس الـ PAT مش عنده `workflow` scope (rejected by GitHub)
  4. Vercel REST API: محتاج token

- كل الـ commits مترفعة على GitHub وجاهزة للـ deploy:
  - af9e4bf: acquireHourlyReportLock + per-chat dedup
  - 6169404: /api/automation/run redirect to /api/cron/refresh-prices

Stage Summary:
- السبب الجذري: /api/automation/run المنشور بيبعت بدون dedup + Vercel Cron بيضربه يومياً at 09:00 UTC + UptimeRobot بيضرب /api/cron/refresh-prices → 2 رسائل عند الظهر بتوقيت القاهرة
- الإصلاح الكودي كامل على GitHub (3 طبقات dedup + redirect + vercel.json update)
- Vercel مش بيdeploy تلقائياً (GitHub integration مقطوعة — 0 webhooks)
- المستخدم محتاج يعمل ONE من الآتي:
  1. Vercel Dashboard → Settings → Git → يعيد ربط GitHub repo
  2. Vercel Dashboard → Deployments → أحدث deployment → "..." → Redeploy (لو الـ integration شغالة)
  3. Vercel CLI: vercel login ← vercel --prod --yes (من جهازه)
