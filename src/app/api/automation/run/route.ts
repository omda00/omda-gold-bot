import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchAllPrices, savePriceRecord } from "@/lib/price-fetcher";
import { detectSignal, detectUsdDrop } from "@/lib/signal-detector";
import { sendTelegramMessage } from "@/lib/telegram";
import { getConfig } from "@/lib/config-seeder";

/**
 * Send a message to ALL active Telegram users.
 * Each user receives via their OWN bot token and chat ID for privacy.
 */
async function notifyAllUsers(
  message: string,
  type: string,
  title: string
): Promise<{ sent: number; failed: number; total: number }> {
  const users = await db.telegramUser.findMany({ where: { active: true } });
  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const result = await sendTelegramMessage(user.botToken, user.chatId, message);

      await db.notificationLog.create({
        data: {
          type,
          title: `${title} - ${user.name}`,
          message,
          success: result.ok,
          error: result.error,
        },
      });

      if (result.ok) {
        sent++;
      } else {
        failed++;
        console.error(`[automation] Failed to send to ${user.name}: ${result.error}`);
      }
    } catch (err) {
      failed++;
      console.error(`[automation] Error sending to ${user.name}:`, err);
    }
  }

  return { sent, failed, total: users.length };
}

/**
 * POST /api/automation/run - Run the full automation cycle:
 * 1. Fetch current prices (Gold EGP + USD/EGP)
 * 2. Check if any buy/sell signals are triggered based on the investment plan
 * 3. Check if USD/EGP has a significant drop
 * 4. Send Telegram notifications to ALL registered users (each via their own bot)
 * 5. Log all notifications
 */
export async function POST() {
  const results: {
    prices?: { gold?: { price: number; change: number }; usdEgp?: { price: number; change: number } };
    signals?: { action: string; label: string } | null;
    usdDrop?: boolean;
    notifications?: { type: string; sent: boolean; error?: string; details?: string }[];
    errors?: string[];
  } = {
    notifications: [],
    errors: [],
  };

  try {
    const automationEnabled = await getConfig("AUTOMATION_ENABLED");
    if (automationEnabled !== "true") {
      return NextResponse.json(
        { error: "Automation is not enabled. Enable it in config first." },
        { status: 400 }
      );
    }

    // Step 1: Fetch current prices (single call for efficiency)
    let goldRecord;
    let usdEgpRecord;

    try {
      const allPrices = await fetchAllPrices();

      if (!allPrices.gold && !allPrices.usdEgp) {
        throw new Error("Could not fetch any prices from any source");
      }

      const savePromises: Promise<unknown>[] = [];
      if (allPrices.gold) {
        savePromises.push(
          savePriceRecord("GOLD_EGP", allPrices.gold.price, "EGP", allPrices.gold.source, {
            buyPrice: allPrices.gold.buyPrice,
            sellPrice: allPrices.gold.sellPrice,
          })
        );
      }
      if (allPrices.usdEgp) {
        savePromises.push(
          savePriceRecord("USD_EGP", allPrices.usdEgp.price, "EGP", allPrices.usdEgp.source)
        );
      }

      const saved = await Promise.all(savePromises);
      goldRecord = allPrices.gold ? saved[0] as Awaited<ReturnType<typeof savePriceRecord>> : undefined;
      usdEgpRecord = allPrices.usdEgp ? saved[allPrices.gold ? 1 : 0] as Awaited<ReturnType<typeof savePriceRecord>> : undefined;

      results.prices = {
        gold: { price: goldRecord.price, change: goldRecord.change ?? 0 },
        usdEgp: { price: usdEgpRecord.price, change: usdEgpRecord.change ?? 0 },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error fetching prices";
      results.errors?.push(`Price fetch failed: ${msg}`);
      return NextResponse.json({ ...results, error: "Price fetch failed" }, { status: 500 });
    }

    // Step 2: Check investment plan signals (now based on gold price)
    const plans = await db.investmentPlan.findMany({
      where: { active: true },
      orderBy: { order: "asc" },
    });

    const signal = detectSignal(goldRecord.price, plans);
    results.signals = signal ? { action: signal.action, label: signal.plan.label } : null;

    // Step 3: Check USD/EGP drop
    const thresholdStr = await getConfig("USD_DROP_THRESHOLD");
    const threshold = thresholdStr ? parseFloat(thresholdStr) : 2;

    const previousUsdEgp = await db.priceRecord.findFirst({
      where: {
        symbol: "USD_EGP",
        id: { not: usdEgpRecord.id },
      },
      orderBy: { createdAt: "desc" },
    });

    let usdDropDetected = false;
    if (previousUsdEgp) {
      usdDropDetected = detectUsdDrop(usdEgpRecord.price, previousUsdEgp.price, threshold);
    }
    results.usdDrop = usdDropDetected;

    // Step 4: Send Telegram notifications to ALL registered users
    // Each user gets notifications via their OWN bot token and chat ID
    const activeUsers = await db.telegramUser.findMany({ where: { active: true } });

    if (activeUsers.length > 0) {
      // Build the daily report message
      const goldBuySell = goldRecord.buyPrice && goldRecord.sellPrice
        ? `\n   بيع: ${goldRecord.sellPrice.toLocaleString()} | شراء: ${goldRecord.buyPrice.toLocaleString()}`
        : "";
      const goldSource = goldRecord.source || "multi-source";
      const usdSource = usdEgpRecord.source || "multi-source";
      const dailyReport = "📊 <b>تحديث ساعي - أسعار الذهب والعملات</b>\n\n" +
        `🥇 <b>ذهب عيار 21:</b> ${goldRecord.price.toLocaleString()} ج.م/جرام` +
        `${goldBuySell}` +
        `${goldRecord.change ? (goldRecord.change >= 0 ? " ▲" : " ▼") + Math.abs(goldRecord.change).toFixed(2) + "%" : ""}\n` +
        `💱 <b>USD/EGP:</b> ${usdEgpRecord.price.toFixed(2)} ج.م` +
        `${usdEgpRecord.change ? (usdEgpRecord.change >= 0 ? " ▲" : " ▼") + Math.abs(usdEgpRecord.change).toFixed(2) + "%" : ""}\n\n` +
        `📌 المصدر: ${goldSource} + ${usdSource}`;

      const dailyResult = await notifyAllUsers(dailyReport, "hourly_report", "Hourly Price Report");
      results.notifications?.push({
        type: "hourly_report",
        sent: dailyResult.sent > 0,
        details: `تم الإرسال إلى ${dailyResult.sent}/${dailyResult.total} مستخدم`,
      });

      // Send signal notification if there's a buy/sell signal
      if (signal && (signal.action.includes("شراء") || signal.action.includes("بيع"))) {
        const isBuy = signal.action.includes("شراء");
        const emoji = isBuy ? "🟢" : "🔴";
        const signalMessage = `${emoji} <b>${signal.action}</b>\n\n` +
          `🥇 ذهب عيار 21: ${goldRecord.price.toLocaleString()} ج.م/جرام\n` +
          `📋 الخطة: ${signal.plan.label}\n` +
          `💰 العائد المتوقع: ${signal.plan.expectedReturn > 0 ? "+" : ""}${signal.plan.expectedReturn}%\n` +
          `📈 التغيير: ${goldRecord.change > 0 ? "+" : ""}${goldRecord.change?.toFixed(2)}%`;

        const signalResult = await notifyAllUsers(signalMessage, isBuy ? "buy_signal" : "sell_signal", `${signal.action} Signal`);
        results.notifications?.push({
          type: isBuy ? "buy_signal" : "sell_signal",
          sent: signalResult.sent > 0,
          details: `تم الإرسال إلى ${signalResult.sent}/${signalResult.total} مستخدم`,
        });
      }

      // Send USD drop alert
      if (usdDropDetected) {
        const dropMessage = "⚠️ <b>تنبيه نزول قوي لسعر الدولار</b>\n\n" +
          `💱 USD/EGP: ${usdEgpRecord.price.toFixed(2)} ج.م\n` +
          `📉 السابق: ${previousUsdEgp?.price.toFixed(2)} ج.م\n` +
          `📊 التغيير: ${usdEgpRecord.change?.toFixed(2)}%\n` +
          `🎯 الحد: ${threshold}%\n` +
          `📌 المصدر: ${usdSource}`;

        const dropResult = await notifyAllUsers(dropMessage, "usd_drop_alert", "USD/EGP Drop Alert");
        results.notifications?.push({
          type: "usd_drop_alert",
          sent: dropResult.sent > 0,
          details: `تم الإرسال إلى ${dropResult.sent}/${dropResult.total} مستخدم`,
        });
      }
    } else {
      // Fallback: Also check the old global config for backward compatibility
      const botToken = await getConfig("TELEGRAM_BOT_TOKEN");
      const chatId = await getConfig("TELEGRAM_CHAT_ID");

      if (botToken && chatId) {
        const goldBuySell = goldRecord.buyPrice && goldRecord.sellPrice
          ? `\n   بيع: ${goldRecord.sellPrice.toLocaleString()} | شراء: ${goldRecord.buyPrice.toLocaleString()}`
          : "";
        const goldSource = goldRecord.source || "multi-source";
        const usdSource = usdEgpRecord.source || "multi-source";
        const dailyReport = "📊 <b>تحديث ساعي - أسعار الذهب والعملات</b>\n\n" +
          `🥇 <b>ذهب عيار 21:</b> ${goldRecord.price.toLocaleString()} ج.م/جرام` +
          `${goldBuySell}` +
          `${goldRecord.change ? (goldRecord.change >= 0 ? " ▲" : " ▼") + Math.abs(goldRecord.change).toFixed(2) + "%" : ""}\n` +
          `💱 <b>USD/EGP:</b> ${usdEgpRecord.price.toFixed(2)} ج.م` +
          `${usdEgpRecord.change ? (usdEgpRecord.change >= 0 ? " ▲" : " ▼") + Math.abs(usdEgpRecord.change).toFixed(2) + "%" : ""}\n\n` +
          `📌 المصدر: ${goldSource} + ${usdSource}`;

        const dailySendResult = await sendTelegramMessage(botToken, chatId, dailyReport);
        results.notifications?.push({
          type: "hourly_report",
          sent: dailySendResult.ok,
          error: dailySendResult.error,
          details: "تم الإرسال عبر الإعدادات العامة",
        });

        await db.notificationLog.create({
          data: {
            type: "hourly_report",
            title: "Hourly Price Report (Global Config)",
            message: dailyReport,
            success: dailySendResult.ok,
            error: dailySendResult.error,
          },
        });

        if (signal && (signal.action.includes("شراء") || signal.action.includes("بيع"))) {
          const isBuy = signal.action.includes("شراء");
          const emoji = isBuy ? "🟢" : "🔴";
          const signalMessage = `${emoji} <b>${signal.action}</b>\n\n` +
            `🥇 ذهب عيار 21: ${goldRecord.price.toLocaleString()} ج.م/جرام\n` +
            `📋 الخطة: ${signal.plan.label}\n` +
            `💰 العائد المتوقع: ${signal.plan.expectedReturn > 0 ? "+" : ""}${signal.plan.expectedReturn}%\n` +
            `📈 التغيير: ${goldRecord.change > 0 ? "+" : ""}${goldRecord.change?.toFixed(2)}%`;

          const signalSendResult = await sendTelegramMessage(botToken, chatId, signalMessage);
          results.notifications?.push({
            type: isBuy ? "buy_signal" : "sell_signal",
            sent: signalSendResult.ok,
            error: signalSendResult.error,
          });

          await db.notificationLog.create({
            data: {
              type: isBuy ? "buy_signal" : "sell_signal",
              title: `${signal.action} Signal (Global Config)`,
              message: signalMessage,
              success: signalSendResult.ok,
              error: signalSendResult.error,
            },
          });
        }

        if (usdDropDetected) {
          const dropMessage = "⚠️ <b>تنبيه نزول قوي لسعر الدولار</b>\n\n" +
            `💱 USD/EGP: ${usdEgpRecord.price.toFixed(2)} ج.م\n` +
            `📉 السابق: ${previousUsdEgp?.price.toFixed(2)} ج.م\n` +
            `📊 التغيير: ${usdEgpRecord.change?.toFixed(2)}%\n` +
            `🎯 الحد: ${threshold}%\n` +
            `📌 المصدر: ${usdSource}`;

          const dropSendResult = await sendTelegramMessage(botToken, chatId, dropMessage);
          results.notifications?.push({
            type: "usd_drop_alert",
            sent: dropSendResult.ok,
            error: dropSendResult.error,
          });

          await db.notificationLog.create({
            data: {
              type: "usd_drop_alert",
              title: "USD/EGP Drop Alert (Global Config)",
              message: dropMessage,
              success: dropSendResult.ok,
              error: dropSendResult.error,
            },
          });
        }
      } else {
        if (signal || usdDropDetected) {
          results.notifications?.push({
            type: "skipped",
            sent: false,
            error: "لا يوجد مستخدمين مسجلين ولا إعدادات عامة للتيليجرام",
          });
        }
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Error running automation:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    results.errors?.push(msg);
    return NextResponse.json(
      { ...results, error: "Automation run failed" },
      { status: 500 }
    );
  }
}
