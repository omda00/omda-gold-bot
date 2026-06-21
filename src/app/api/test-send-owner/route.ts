import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { sendTelegramMessage } from "@/lib/telegram";

/**
 * POST /api/test-send-owner
 *
 * Admin-only endpoint for TESTING the Telegram bot without disturbing
 * real subscribers.
 *
 * Sends a test message ONLY to the bot owner (Omda, chatId 750182271)
 * — never to the customer list. Also does NOT touch any dedup state
 * (HOURLY_REPORT_LOCK, LAST_REPORT_CHAT_*) so it cannot interfere with
 * the scheduled hourly send at :01.
 *
 * This is the safe way to verify the bot is alive / message formatting
 * is correct, without risking duplicate or spurious messages to customers.
 */

// Owner identity — the bot owner (dukeomda / Omda).
// Hardcoded for safety: even if the DB user list changes, test sends
// always go to this single chatId and nowhere else.
const OWNER_CHAT_ID = "750182271";

export async function POST(request: NextRequest) {
  // ── Auth gate ──────────────────────────────────────────────
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    return NextResponse.json(
      { success: false, error: "غير مصرح — هذه العملية للمسؤول فقط" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const customMessage =
      typeof body?.message === "string" && body.message.trim()
        ? body.message.trim()
        : null;

    // Resolve bot token: prefer the owner's registered token, fall back
    // to the global TELEGRAM_BOT_TOKEN config.
    const ownerUser = await db.telegramUser.findFirst({
      where: { chatId: OWNER_CHAT_ID },
    });

    let botToken: string | null = null;
    if (ownerUser?.botToken) {
      botToken = ownerUser.botToken;
    } else {
      const globalToken = await db.appConfig.findUnique({
        where: { key: "TELEGRAM_BOT_TOKEN" },
      });
      botToken = globalToken?.value ?? null;
    }

    if (!botToken) {
      return NextResponse.json(
        { success: false, error: "لم يتم العثور على bot token" },
        { status: 500 }
      );
    }

    const message =
      customMessage ||
      [
        "🧪 <b>رسالة تجريبية</b>",
        "",
        "هذه رسالة تجريبية من لوحة تحكم البوت.",
        "تُرسل فقط لصاحب البوت ولا تصل للعملاء.",
        `🕐 ${new Date().toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}`,
      ].join("\n");

    const result = await sendTelegramMessage(botToken, OWNER_CHAT_ID, message);

    // Log the test send for auditability, but do NOT mark any dedup keys.
    await db.notificationLog.create({
      data: {
        type: "test_send_owner",
        title: "Test Send — Owner Only",
        message,
        success: result.ok,
        error: result.error,
      },
    });

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error || "فشل الإرسال" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      sentTo: OWNER_CHAT_ID,
      ownerName: ownerUser?.name ?? "Owner",
      message: "تم إرسال الرسالة التجريبية لصاحب البوت فقط — لم يتم إزعاج العملاء",
    });
  } catch (error) {
    console.error("[test-send-owner] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
