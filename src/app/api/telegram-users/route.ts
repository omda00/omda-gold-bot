import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/telegram-users - Return all registered Telegram users
 * (botToken is masked for security - each user only sees their own full token)
 */
export async function GET() {
  try {
    const users = await db.telegramUser.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Mask bot tokens for security - only show last 5 chars
    const masked = users.map((u) => ({
      ...u,
      botToken: u.botToken
        ? `****${u.botToken.slice(-5)}`
        : "",
    }));

    return NextResponse.json(masked);
  } catch (error) {
    console.error("Error fetching telegram users:", error);
    return NextResponse.json(
      { error: "Failed to fetch telegram users" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/telegram-users - Register a new Telegram user
 * Body: { name: string, botToken: string, chatId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, botToken, chatId } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "الاسم مطلوب" },
        { status: 400 }
      );
    }

    if (!botToken || typeof botToken !== "string" || botToken.trim().length === 0) {
      return NextResponse.json(
        { error: "Bot Token مطلوب" },
        { status: 400 }
      );
    }

    if (!chatId || typeof chatId !== "string" || chatId.trim().length === 0) {
      return NextResponse.json(
        { error: "Chat ID مطلوب" },
        { status: 400 }
      );
    }

    // Check if this bot token + chat ID combination already exists
    const existing = await db.telegramUser.findFirst({
      where: {
        botToken: botToken.trim(),
        chatId: chatId.trim(),
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "هذا البوت مسجل بالفعل" },
        { status: 409 }
      );
    }

    const user = await db.telegramUser.create({
      data: {
        name: name.trim(),
        botToken: botToken.trim(),
        chatId: chatId.trim(),
        active: true,
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error("Error creating telegram user:", error);
    return NextResponse.json(
      { error: "Failed to create telegram user" },
      { status: 500 }
    );
  }
}
