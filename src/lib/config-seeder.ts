import { db } from "@/lib/db";

const DEFAULT_CONFIGS: Record<string, string> = {
  TELEGRAM_BOT_TOKEN: "",
  TELEGRAM_CHAT_ID: "",
  AUTOMATION_ENABLED: "false",
  DAILY_REPORT_TIME: "09:00",
  USD_DROP_THRESHOLD: "2",
  ADMIN_PASSWORD: "", // Empty = first login sets it
};

/**
 * Seed default config values if they don't already exist in the database.
 * This is idempotent - it won't overwrite existing values.
 */
export async function seedDefaultConfig(): Promise<void> {
  for (const [key, value] of Object.entries(DEFAULT_CONFIGS)) {
    const existing = await db.appConfig.findUnique({ where: { key } });
    if (!existing) {
      await db.appConfig.create({ data: { key, value } });
    }
  }
}

/**
 * Get a config value by key
 */
export async function getConfig(key: string): Promise<string | null> {
  const config = await db.appConfig.findUnique({ where: { key } });
  return config?.value ?? null;
}

/**
 * Get all config as key-value pairs
 */
export async function getAllConfig(): Promise<Record<string, string>> {
  const configs = await db.appConfig.findMany();
  const result: Record<string, string> = {};
  for (const c of configs) {
    result[c.key] = c.value;
  }
  return result;
}

/**
 * Set a config value by key (upsert)
 */
export async function setConfig(key: string, value: string): Promise<void> {
  await db.appConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
