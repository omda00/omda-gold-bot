import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";

/**
 * POST /api/telegram/send - Send a custom message via Telegram Bot API
 * Body: { message: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "message is required and must be a string" },
        { status: 400 }
      );
    }

    const botToken = await db.appConfig.findUnique({ where: { key: "TELEGRAM_BOT_TOKEN" } });
    const chatId = await db.appConfig.findUnique({ where: { key: "TELEGRAM_CHAT_ID" } });

    if (!botToken?.value) {
      return NextResponse.json(
        { error: "TELEGRAM_BOT_TOKEN is not configured" },
        { status: 400 }
      );
    }

    if (!chatId?.value) {
      return NextResponse.json(
        { error: "TELEGRAM_CHAT_ID is not configured" },
        { status: 400 }
      );
    }

    const result = await sendTelegramMessage(botToken.value, chatId.value, message);

    // Log the notification
    await db.notificationLog.create({
      data: {
        type: "custom",
        title: "Custom Telegram Message",
        message,
        success: result.ok,
        error: result.error,
      },
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: `Failed to send message: ${result.error}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, message: "Message sent successfully" });
  } catch (error) {
    console.error("Error sending message:", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
