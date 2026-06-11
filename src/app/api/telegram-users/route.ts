import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

/**
 * GET /api/telegram-users - Return all registered Telegram users
 * ADMIN ONLY — requires admin session cookie
 */
export async function GET() {
  try {
    const isAdmin = await getAdminSession();
    if (!isAdmin) {
      return NextResponse.json(
        { error: "غير مصرح — يرجى تسجيل الدخول كمسؤول" },
        { status: 401 }
      );
    }

    const users = await db.telegramUser.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Mask bot tokens for security
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
