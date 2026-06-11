import { NextRequest, NextResponse } from "next/server";
import { getAllConfig, setConfig, seedDefaultConfig } from "@/lib/config-seeder";

/**
 * GET /api/config - Return all config as key-value pairs
 */
export async function GET() {
  try {
    await seedDefaultConfig();
    const config = await getAllConfig();
    return NextResponse.json(config);
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
 * Body: { key: string, value: string }
 */
export async function POST(request: NextRequest) {
  try {
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

    return NextResponse.json({ key, value, updated: true });
  } catch (error) {
    console.error("Error updating config:", error);
    return NextResponse.json(
      { error: "Failed to update config" },
      { status: 500 }
    );
  }
}
