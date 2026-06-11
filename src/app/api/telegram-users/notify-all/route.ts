import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";

/**
 * POST /api/telegram-users/notify-all - Send a message to ALL registered and active Telegram users
 * Body: { message: string, type?: string, title?: string }
 *
 * This endpoint is used by the cron service to send hourly updates to all users.
 * Each user receives the message on their OWN bot, ensuring privacy.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, type, title } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    // Get all active Telegram users
    const users = await db.telegramUser.findMany({
      where: { active: true },
    });

    if (users.length === 0) {
      return NextResponse.json({
        sent: 0,
        total: 0,
        message: "لا يوجد مستخدمين مسجلين نشطين",
      });
    }

    // Send to each user individually using their own bot token and chat ID
    const results = await Promise.allSettled(
      users.map(async (user) => {
        const result = await sendTelegramMessage(user.botToken, user.chatId, message);

        // Log each notification
        await db.notificationLog.create({
          data: {
            type: type || "hourly_update",
            title: title || `Hourly update for ${user.name}`,
            message,
            success: result.ok,
            error: result.error,
          },
        });

        return {
          userId: user.id,
          userName: user.name,
          sent: result.ok,
          error: result.error,
        };
      })
    );

    const succeeded = results.filter(
      (r) => r.status === "fulfilled" && r.value.sent
    ).length;
    const failed = results.length - succeeded;

    return NextResponse.json({
      sent: succeeded,
      failed,
      total: users.length,
      results: results.map((r) =>
        r.status === "fulfilled" ? r.value : { sent: false, error: "Unknown error" }
      ),
    });
  } catch (error) {
    console.error("Error notifying all telegram users:", error);
    return NextResponse.json(
      { error: "Failed to send notifications" },
      { status: 500 }
    );
  }
}
