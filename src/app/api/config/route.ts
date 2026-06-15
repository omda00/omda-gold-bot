import { NextRequest, NextResponse } from "next/server";
import { getAllConfig, setConfig, seedDefaultConfig } from "@/lib/config-seeder";
import { getAdminSession } from "@/lib/admin-auth";

// Cache for config + seed status to avoid re-seeding on every request
let configCache: { data: Record<string, string>; timestamp: number } | null = null;
let seeded = false;
const CONFIG_CACHE_TTL = 30000; // 30 seconds — config rarely changes

/**
 * GET /api/config - Return all config as key-value pairs
 * Public: Anyone can READ config (needed for UI to show automation status, etc.)
 * But sensitive values (tokens, passwords) are masked for non-admins
 */
export async function GET() {
  try {
    // Only seed once per server instance (not on every request)
    if (!seeded) {
      await seedDefaultConfig();
      seeded = true;
    }

    // Return cached config if fresh
    if (configCache && (Date.now() - configCache.timestamp) < CONFIG_CACHE_TTL) {
      // Mask sensitive values even from cache
      const safeConfig: Record<string, string> = {};
      for (const [key, value] of Object.entries(configCache.data)) {
        if (key === "TELEGRAM_BOT_TOKEN" && value) {
          safeConfig[key] = `****${value.slice(-5)}`;
        } else if (key === "ADMIN_PASSWORD" && value) {
          safeConfig[key] = "****";
        } else {
          safeConfig[key] = value;
        }
      }
      return NextResponse.json(safeConfig);
    }

    const config = await getAllConfig();
    configCache = { data: config, timestamp: Date.now() };

    // Always mask sensitive values
    const safeConfig: Record<string, string> = {};
    for (const [key, value] of Object.entries(config)) {
      if (key === "TELEGRAM_BOT_TOKEN" && value) {
        safeConfig[key] = `****${value.slice(-5)}`;
      } else if (key === "ADMIN_PASSWORD" && value) {
        safeConfig[key] = "****"; // Never expose password
      } else {
        safeConfig[key] = value;
      }
    }

    return NextResponse.json(safeConfig);
  } catch (error) {
    console.error("Error fetching config:", error);
    return NextResponse.json(
      { error: "Failed to fetch config" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/config - Update config
 * ADMIN ONLY — requires admin session cookie
 */
export async function POST(request: NextRequest) {
  try {
    const isAdmin = await getAdminSession();
    if (!isAdmin) {
      return NextResponse.json(
        { error: "غير مصرح — يرجى تسجيل الدخول كمسؤول" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { key, value } = body;

    if (!key || typeof key !== "string") {
      return NextResponse.json(
        { error: "key is required and must be a string" },
        { status: 400 }
      );
    }

    if (typeof value !== "string") {
      return NextResponse.json(
        { error: "value must be a string" },
        { status: 400 }
      );
    }

    await setConfig(key, value);

    // Invalidate config cache so next GET fetches fresh data
    configCache = null;

    return NextResponse.json({ key, value, updated: true });
  } catch (error) {
    console.error("Error updating config:", error);
    return NextResponse.json(
      { error: "Failed to update config" },
      { status: 500 }
    );
  }
}
