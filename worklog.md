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
