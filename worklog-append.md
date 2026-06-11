
---
Task ID: 7
Agent: Main Agent
Task: Implement per-user Telegram bot registration with private bot tokens/chat IDs and hourly notifications

Work Log:
- Added TelegramUser model to Prisma schema (id, name, botToken, chatId, active, createdAt, updatedAt)
- Ran `bun run db:push` to sync schema to database
- Created API endpoints:
  - GET/POST /api/telegram-users - List all users (masked tokens), Register new user
  - GET/DELETE/PATCH /api/telegram-users/[id] - Get/Delete/Update specific user
  - POST /api/telegram-users/[id]/test - Test Telegram connection for specific user
  - POST /api/telegram-users/notify-all - Send message to ALL active users
- Updated automation run to send notifications to ALL registered Telegram users individually
- Updated cron service to run EVERY HOUR (Cairo time) instead of every 4 hours
- Updated dashboard-types.ts with TelegramUser interface
- Updated use-dashboard.ts hook with telegramUsers state and CRUD functions
- Completely redesigned settings.tsx with per-user Telegram bot registration UI
- Verified with Agent Browser - settings page and dialog render correctly

Stage Summary:
- Each customer has their OWN bot token and chat ID (TelegramUser table)
- Bot tokens are masked in API responses for security
- No user can see another user's full bot configuration
- Hourly cron job (every hour Cairo time) sends gold prices, USD/EGP, and signals to ALL registered users
- Each user receives notifications via their OWN Telegram bot
- Backward compatible with global config
- Lint passed with no errors
