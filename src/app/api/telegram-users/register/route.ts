import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";

/**
 * POST /api/telegram-users/register - Public bot registration (no admin auth required)
 * Any visitor can register their own Telegram bot to receive price updates.
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

    // Check if this bot token + chat ID combination already exists — upsert to prevent duplicates
    const user = await db.telegramUser.upsert({
      where: { chatId_botToken: { chatId: chatId.trim(), botToken: botToken.trim() } },
      update: { active: true, name: name.trim() },
      create: {
        name: name.trim(),
        botToken: botToken.trim(),
        chatId: chatId.trim(),
        active: true,
      },
    });

    const isNewUser = user.createdAt.getTime() === user.updatedAt.getTime();

    if (!isNewUser) {
      // User was reactivated — test connection and notify
      const testMessage = `✅ تم تفعيل الإشعارات من جديد!\n\n🔔 ستصلك تحديثات أسعار الذهب والدولار كل ساعة بتوقيت مصر\n\n👤 الاسم: ${name.trim()}`;
      const testResult = await sendTelegramMessage(botToken.trim(), chatId.trim(), testMessage);

      if (!testResult.ok) {
        return NextResponse.json(
          { error: `فشل الاتصال بالبوت — تأكد من صحة Bot Token و Chat ID\nالخطأ: ${testResult.error || "غير معروف"}` },
          { status: 400 }
        );
      }

      return NextResponse.json({
        ok: true,
        message: "تم تفعيل الإشعارات من جديد — سيصلك التحديث كل ساعة",
        data: {
          id: user.id,
          name: user.name,
          active: user.active,
          reactivated: true,
        },
      });
    }

    // New user — test the bot connection before registering
    const testMessage = `✅ تم تسجيل بوتك بنجاح!\n\n🔔 ستصلك تحديثات أسعار الذهب والدولار كل ساعة بتوقيت مصر\n\n👤 الاسم: ${name.trim()}`;
    const testResult = await sendTelegramMessage(botToken.trim(), chatId.trim(), testMessage);

    if (!testResult.ok) {
      // Connection failed — delete the user we just created
      await db.telegramUser.delete({ where: { id: user.id } });
      return NextResponse.json(
        { error: `فشل الاتصال بالبوت — تأكد من صحة Bot Token و Chat ID\nالخطأ: ${testResult.error || "غير معروف"}` },
        { status: 400 }
      );
    }

    // Log the registration
    await db.notificationLog.create({
      data: {
        type: "bot_registration",
        title: `تسجيل بوت جديد: ${name.trim()}`,
        message: `تم تسجيل بوت جديد باسم "${name.trim()}"`,
        success: true,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "تم تسجيل البوت بنجاح — سيصلك التحديث كل ساعة بتوقيت مصر",
      data: {
        id: user.id,
        name: user.name,
        active: user.active,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Error registering telegram bot:", error);
    return NextResponse.json(
      { error: "حدث خطأ في تسجيل البوت — حاول مرة أخرى" },
      { status: 500 }
    );
  }
}
