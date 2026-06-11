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
 * Build a comprehensive hourly Telegram report with all karats, workmanship, gold pound, USD/EGP, and signals
 */
function buildHourlyReport(params: {
  goldPrice: number;
  goldBuyPrice: number | null;
  goldSellPrice: number | null;
  goldChange: number;
  goldSource: string;
  allKarats: { karat: number; sellPrice: number; buyPrice: number | null; sellWorkmanship: number | null; buyWorkmanship: number | null; changeAmount: number | null; changePercent: number | null }[];
  goldPound: { sellPrice: number | null; buyPrice: number | null; sellWorkmanship: number | null; buyWorkmanship: number | null; changeAmount: number | null; changePercent: number | null } | null;
  usdEgpPrice: number;
  usdEgpChange: number;
  usdEgpSource: string;
  signal: { action: string; label: string; plan: { label: string; expectedReturn: number } } | null;
}): string {
  const {
    goldPrice, goldBuyPrice, goldSellPrice, goldChange, goldSource,
    allKarats, goldPound, usdEgpPrice, usdEgpChange, usdEgpSource, signal,
  } = params;

  const goldArrow = goldChange >= 0 ? "▲" : "▼";
  const usdArrow = usdEgpChange >= 0 ? "▲" : "▼";

  let report = "📊 <b>تحديث ساعة — أسعار الذهب والعملات</b>\n";
  report += `🕐 ${new Date().toLocaleString("ar-EG", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" })} بتوقيت مصر\n\n`;

  // Gold prices for all karats with workmanship
  report += "🥇 <b>أسعار الذهب (ج.م/جرام):</b>\n";
  report += "━━━━━━━━━━━━━━━━━━\n";

  for (const kp of allKarats) {
    const sell = kp.sellPrice?.toLocaleString() || "—";
    const buy = kp.buyPrice?.toLocaleString() || "—";
    const line = `عيار ${kp.karat}: بيع ${sell} | شراء ${buy}`;
    report += `  ${line}\n`;
  }

  // Gold pound
  if (goldPound && (goldPound.sellPrice || goldPound.buyPrice)) {
    report += "\n🪙 <b>جنيه الذهب:</b>\n";
    const gpLine = `  بيع ${goldPound.sellPrice?.toLocaleString() || "—"} | شراء ${goldPound.buyPrice?.toLocaleString() || "—"}`;
    report += `${gpLine}\n`;
  }

  // Gold 21 change indicator
  if (goldChange !== 0) {
    report += `\n📈 التغيير (عيار 21): ${goldArrow} ${Math.abs(goldChange).toFixed(2)}%\n`;
  }

  // USD/EGP
  report += `\n💱 <b>USD/EGP:</b> ${usdEgpPrice.toFixed(2)} ج.م ${usdArrow} ${Math.abs(usdEgpChange).toFixed(2)}%\n`;

  // Trading signal
  if (signal) {
    const isBuy = signal.action.includes("شراء");
    const emoji = isBuy ? "🟢" : "🔴";
    report += `\n${emoji} <b>الإشارة: ${signal.action}</b>\n`;
    report += `📋 ${signal.plan.label}\n`;
    report += `💰 العائد المتوقع: ${signal.plan.expectedReturn > 0 ? "+" : ""}${signal.plan.expectedReturn}%\n`;
  }

  // Sources
  report += `\n📌 المصادر: ${goldSource} + ${usdEgpSource}`;

  return report;
}

/**
 * POST /api/automation/run - Run the full automation cycle:
 * 1. Fetch current prices (Gold EGP + USD/EGP + all karats)
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
    let allKaratsData: { karat: number; sellPrice: number; buyPrice: number | null; sellWorkmanship: number | null; buyWorkmanship: number | null; changeAmount: number | null; changePercent: number | null }[] = [];
    let goldPoundData: { sellPrice: number | null; buyPrice: number | null; sellWorkmanship: number | null; buyWorkmanship: number | null; changeAmount: number | null; changePercent: number | null } | null = null;

    try {
      const allPrices = await fetchAllPrices();

      if (!allPrices.gold && !allPrices.usdEgp) {
        throw new Error("Could not fetch any prices from any source");
      }

      // Save karat data for the report
      allKaratsData = allPrices.allKarats || [];
      goldPoundData = allPrices.goldPound || null;

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
        gold: goldRecord ? { price: goldRecord.price, change: goldRecord.change ?? 0 } : undefined,
        usdEgp: usdEgpRecord ? { price: usdEgpRecord.price, change: usdEgpRecord.change ?? 0 } : undefined,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error fetching prices";
      results.errors?.push(`Price fetch failed: ${msg}`);
      return NextResponse.json({ ...results, error: "Price fetch failed" }, { status: 500 });
    }

    if (!goldRecord || !usdEgpRecord) {
      return NextResponse.json(
        { ...results, error: "Missing price data" },
        { status: 500 }
      );
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
    const activeUsers = await db.telegramUser.findMany({ where: { active: true } });

    if (activeUsers.length > 0) {
      // Build the comprehensive hourly report with all karats and gold pound
      const hourlyReport = buildHourlyReport({
        goldPrice: goldRecord.price,
        goldBuyPrice: goldRecord.buyPrice,
        goldSellPrice: goldRecord.sellPrice,
        goldChange: goldRecord.change ?? 0,
        goldSource: goldRecord.source || "multi-source",
        allKarats: allKaratsData,
        goldPound: goldPoundData,
        usdEgpPrice: usdEgpRecord.price,
        usdEgpChange: usdEgpRecord.change ?? 0,
        usdEgpSource: usdEgpRecord.source || "multi-source",
        signal,
      });

      const dailyResult = await notifyAllUsers(hourlyReport, "hourly_report", "Hourly Price Report");
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
        const usdSource = usdEgpRecord.source || "multi-source";
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
        const hourlyReport = buildHourlyReport({
          goldPrice: goldRecord.price,
          goldBuyPrice: goldRecord.buyPrice,
          goldSellPrice: goldRecord.sellPrice,
          goldChange: goldRecord.change ?? 0,
          goldSource: goldRecord.source || "multi-source",
          allKarats: allKaratsData,
          goldPound: goldPoundData,
          usdEgpPrice: usdEgpRecord.price,
          usdEgpChange: usdEgpRecord.change ?? 0,
          usdEgpSource: usdEgpRecord.source || "multi-source",
          signal,
        });

        const dailySendResult = await sendTelegramMessage(botToken, chatId, hourlyReport);
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
            message: hourlyReport,
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
          const usdSource = usdEgpRecord.source || "multi-source";
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
