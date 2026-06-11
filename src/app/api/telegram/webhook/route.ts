import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";
import { getConfig } from "@/lib/config-seeder";

/**
 * POST /api/telegram/webhook - Telegram Bot Webhook
 * 
 * Receives updates from Telegram when users interact with the bot.
 * When someone sends /start, they are automatically registered to receive
 * hourly gold price reports.
 * 
 * To set the webhook, call:
 * GET /api/telegram/webhook?setup=true
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  
  // Setup webhook mode
  if (url.searchParams.get("setup") === "true") {
    const botToken = await getConfig("TELEGRAM_BOT_TOKEN");
    if (!botToken) {
      return NextResponse.json(
        { error: "TELEGRAM_BOT_TOKEN not configured" },
        { status: 400 }
      );
    }

    // Determine the webhook URL based on the request origin
    const origin = request.headers.get("host") || url.host;
    const protocol = request.headers.get("x-forwarded-proto") || "https";
    const webhookUrl = `${protocol}://${origin}/api/telegram/webhook`;

    try {
      const setWebhookUrl = `https://api.telegram.org/bot${botToken}/setWebhook`;
      const response = await fetch(setWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl }),
      });
      const data = await response.json();

      if (data.ok) {
        return NextResponse.json({
          success: true,
          message: `Webhook set to ${webhookUrl}`,
          result: data,
        });
      } else {
        return NextResponse.json(
          { error: "Failed to set webhook", details: data },
          { status: 500 }
        );
      }
    } catch (error) {
      return NextResponse.json(
        { error: "Failed to set webhook", details: String(error) },
        { status: 500 }
      );
    }
  }

  // Webhook info mode
  const botToken = await getConfig("TELEGRAM_BOT_TOKEN");
  if (!botToken) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 400 });
  }

  try {
    const infoUrl = `https://api.telegram.org/bot${botToken}/getWebhookInfo`;
    const response = await fetch(infoUrl);
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get webhook info", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/telegram/webhook - Receive Telegram updates
 * 
 * Handles incoming messages from Telegram users:
 * - /start → Register the user for hourly reports
 * - /stop → Unregister the user
 * - Any other message → Show help
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate this is a real Telegram update
    if (!body.update_id) {
      return NextResponse.json({ error: "Invalid update" }, { status: 400 });
    }

    const message = body.message;
    if (!message || !message.from) {
      return NextResponse.json({ ok: true }); // Ignore non-message updates
    }

    const chatId = String(message.chat.id);
    const fromUser = message.from;
    const text = (message.text || "").trim();
    const botToken = await getConfig("TELEGRAM_BOT_TOKEN");

    if (!botToken) {
      console.error("[webhook] No TELEGRAM_BOT_TOKEN configured");
      return NextResponse.json({ ok: true });
    }

    // Handle /start command - Register user
    if (text === "/start" || text.startsWith("/start ")) {
      // Check if user is already registered
      const existing = await db.telegramUser.findFirst({
        where: { chatId, botToken },
      });

      if (existing) {
        // Already registered - reactivate if stopped, or welcome back
        if (!existing.active) {
          await db.telegramUser.update({
            where: { id: existing.id },
            data: { active: true },
          });
          await sendTelegramMessage(
            botToken,
            chatId,
            `👋 أهلاً بيك تاني يا ${existing.name}!\n\n✅ تم تفعيل الإشعارات من تاني\n📊 هتصلك التحديثات كل ساعة\n\n💡 لو عايز توقف الإشعارات ابعت /stop`
          );
        } else {
          await sendTelegramMessage(
            botToken,
            chatId,
            `👋 أهلاً بيك تاني يا ${existing.name}!\n\n✅ أنت مسجل بالفعل وبتستقبل التحديثات كل ساعة.\n\n💡 لو عايز توقف الإشعارات ابعت /stop`
          );
        }
        return NextResponse.json({ ok: true });
      }

      // Register new user
      const userName = fromUser.first_name 
        + (fromUser.last_name ? ` ${fromUser.last_name}` : "");

      const newUser = await db.telegramUser.create({
        data: {
          name: userName,
          botToken,
          chatId,
          active: true,
        },
      });

      // Log the registration
      await db.notificationLog.create({
        data: {
          type: "bot_registration",
          title: `تسجيل مشترك جديد: ${userName}`,
          message: `مشترك جديد: ${userName} (Chat ID: ${chatId})`,
          success: true,
        },
      });

      // Send welcome message
      const welcomeMessage = `🎉 أهلاً بيك يا ${userName}!\n\n✅ تم تسجيلك بنجاح في بوت أسعار الذهب والعملات\n\n📊 هتصلك تحديثات كل ساعة:\n  • أسعار الذهب (عيار 24، 22، 21، 18)\n  • جنيه الذهب\n  • سعر الدولار\n  • تنبيهات انخفاض الدولار\n\n🔔 أول تقرير هيوصلك في الساعة الجاية\n\n💡 أوامر البوت:\n/start — تسجيل / تفعيل\n/stop — إيقاف الإشعارات\n/help — المساعدة`;

      await sendTelegramMessage(botToken, chatId, welcomeMessage);

      console.log(`[webhook] ✅ New subscriber: ${userName} (Chat ID: ${chatId})`);

      return NextResponse.json({ ok: true, registered: true });
    }

    // Handle /stop command - Deactivate user
    if (text === "/stop") {
      const existing = await db.telegramUser.findFirst({
        where: { chatId, botToken },
      });

      if (existing) {
        await db.telegramUser.update({
          where: { id: existing.id },
          data: { active: false },
        });

        await sendTelegramMessage(
          botToken,
          chatId,
          `⏸️ تم إيقاف الإشعارات\n\nلو عايز ترجع تفعّلهم تاني ابعت /start`
        );
      } else {
        await sendTelegramMessage(
          botToken,
          chatId,
          `❌ أنت مش مسجل عندنا\n\nابعت /start عشان تسجل وتستقبل التحديثات`
        );
      }

      return NextResponse.json({ ok: true });
    }

    // Handle /help command
    if (text === "/help") {
      const helpMessage = `🤖 بوت أسعار الذهب والعملات\n\n📋 الأوامر المتاحة:\n\n/start — تسجيل وتفعيل الإشعارات\n/stop — إيقاف الإشعارات\n/help — عرض المساعدة\n\n📊 البيانات المرسلة كل ساعة:\n  • أسعار الذهب (عيار 24، 22، 21، 18)\n  • جنيه الذهب\n  • سعر الدولار\n  • تنبيهات انخفاض الدولار\n\n📌 المصادر: iSagha.com + Google Finance\n\nMade With ❤️ By Omda`;

      await sendTelegramMessage(botToken, chatId, helpMessage);
      return NextResponse.json({ ok: true });
    }

    // Handle unknown messages
    await sendTelegramMessage(
      botToken,
      chatId,
      `🤔 مش فاهم الأمر ده\n\nابعت /start عشان تسجل\nابعت /help عشان تعرف الأوامر`
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[webhook] Error processing update:", error);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}
