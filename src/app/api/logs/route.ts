import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/logs - Return notification logs
 * Query params: type (optional), limit (default 50)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const type = searchParams.get("type") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const where = type ? { type } : {};

    const logs = await db.notificationLog.findMany({
      where,
      orderBy: { sentAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ logs, count: logs.length });
  } catch (error) {
    console.error("Error fetching notification logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch notification logs" },
      { status: 500 }
    );
  }
}
