import { db } from "@/lib/db";

/**
 * Resilient TelegramUser helpers.
 *
 * WHY THIS EXISTS:
 * The Prisma schema declares `@@unique([chatId, botToken])` which generates the
 * compound unique key `chatId_botToken`. However, on the production Neon
 * database this constraint was never applied via `prisma db push` / migration.
 * Any Prisma call that references `where: { chatId_botToken: {...} }` (upsert
 * or findUnique) FAILS at runtime with an "Unknown argument" / "constraint
 * not found" error.
 *
 * This caused the Telegram webhook /start handler to crash silently for EVERY
 * new subscriber — the bot appeared dead even though the webhook URL was
 * correctly registered with Telegram.
 *
 * These helpers transparently fall back to `findFirst` + `create`/`update`
 * (which work without the compound unique key) whenever the compound-key
 * operation fails. This keeps the app fully functional on both:
 *   - databases WITH the constraint (race-safe upsert path)
 *   - databases WITHOUT the constraint (fallback path)
 *
 * Once the production DB has the constraint applied via `prisma db push`,
 * the fast path is used automatically.
 */

interface TelegramUserRecord {
  id: string;
  name: string;
  botToken: string;
  chatId: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Find a TelegramUser by (chatId, botToken).
 * Tries the compound unique key first, falls back to findFirst.
 */
export async function findTelegramUser(
  chatId: string,
  botToken: string
): Promise<TelegramUserRecord | null> {
  // Fast path: compound unique key
  try {
    const user = await db.telegramUser.findUnique({
      where: { chatId_botToken: { chatId, botToken } },
    });
    return user;
  } catch {
    // Fallback: compound key not defined on this DB — use findFirst
    const user = await db.telegramUser.findFirst({
      where: { chatId, botToken },
    });
    return user;
  }
}

/**
 * Upsert a TelegramUser by (chatId, botToken).
 *
 * Tries the compound-key upsert first (race-safe). If that fails because the
 * constraint doesn't exist on the DB, falls back to findFirst + create/update.
 *
 * Sets `active: true` and updates `name` on existing rows.
 */
export async function upsertTelegramUser(params: {
  chatId: string;
  botToken: string;
  name: string;
}): Promise<{ user: TelegramUserRecord; created: boolean }> {
  const { chatId, botToken, name } = params;

  // Fast path: compound unique key upsert (race-safe)
  try {
    const user = await db.telegramUser.upsert({
      where: { chatId_botToken: { chatId, botToken } },
      update: { active: true, name },
      create: { name, botToken, chatId, active: true },
    });
    const created = user.createdAt.getTime() === user.updatedAt.getTime();
    return { user, created };
  } catch (err) {
    console.warn(
      "[telegram-user-helpers] upsert with chatId_botToken failed, falling back to findFirst+create/update:",
      err instanceof Error ? err.message : String(err)
    );
  }

  // Fallback path: findFirst + create/update
  const existing = await db.telegramUser.findFirst({
    where: { chatId, botToken },
  });

  if (existing) {
    const user = await db.telegramUser.update({
      where: { id: existing.id },
      data: { active: true, name },
    });
    return { user, created: false };
  }

  const user = await db.telegramUser.create({
    data: { name, botToken, chatId, active: true },
  });
  return { user, created: true };
}
