import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchAramcoPrice, fetchUsdEgpRate, savePriceRecord } from "@/lib/price-fetcher";
import { detectSignal, detectUsdDrop } from "@/lib/signal-detector";
import { sendTelegramMessage } from "@/lib/telegram";
import { getConfig } from "@/lib/config-seeder";

/**
 * POST /api/automation/run - Run the full automation cycle:
 * 1. Fetch current prices (Aramco + USD/EGP)
 * 2. Check if any buy/sell signals are triggered based on the investment plan
 * 3. Check if USD/EGP has a significant drop
 * 4. Send Telegram notifications for any alerts
 * 5. Log all notifications
 */
export async function POST() {
  const results: {
    prices?: { aramco?: { price: number; change: number }; usdEgp?: { price: number; change: number } };
    signals?: { action: string; label: string } | null;
    usdDrop?: boolean;
    notifications?: { type: string; sent: boolean; error?: string }[];
    errors?: string[];
  } = {
    notifications: [],
    errors: [],
  };

  try {
    // Check if automation is enabled
    const automationEnabled = await getConfig("AUTOMATION_ENABLED");
    if (automationEnabled !== "true") {
      return NextResponse.json(
        { error: "Automation is not enabled. Enable it in config first." },
        { status: 400 }
      );
    }

    // Step 1: Fetch current prices
    let aramcoRecord;
    let usdEgpRecord;

    try {
      const [aramcoResult, usdEgpResult] = await Promise.all([
        fetchAramcoPrice(),
        fetchUsdEgpRate(),
      ]);

      [aramcoRecord, usdEgpRecord] = await Promise.all([
        savePriceRecord("ARAMCO", aramcoResult.price, "SAR", aramcoResult.source),
        savePriceRecord("USD_EGP", usdEgpResult.price, "EGP", usdEgpResult.source),
      ]);

      results.prices = {
        aramco: { price: aramcoRecord.price, change: aramcoRecord.change ?? 0 },
        usdEgp: { price: usdEgpRecord.price, change: usdEgpRecord.change ?? 0 },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error fetching prices";
      results.errors?.push(`Price fetch failed: ${msg}`);
      return NextResponse.json({ ...results, error: "Price fetch failed" }, { status: 500 });
    }

    // Step 2: Check investment plan signals
    const plans = await db.investmentPlan.findMany({
      where: { active: true },
      orderBy: { order: "asc" },
    });

    const signal = detectSignal(aramcoRecord.price, plans);
    results.signals = signal ? { action: signal.action, label: signal.plan.label } : null;

    // Step 3: Check USD/EGP drop
    const thresholdStr = await getConfig("USD_DROP_THRESHOLD");
    const threshold = thresholdStr ? parseFloat(thresholdStr) : 2;

    // Get previous USD/EGP record
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

    // Step 4: Send Telegram notifications
    const botToken = await getConfig("TELEGRAM_BOT_TOKEN");
    const chatId = await getConfig("TELEGRAM_CHAT_ID");

    const canSendTelegram = botToken && chatId;

    if (canSendTelegram) {
      // Send signal notification if there's a buy/sell signal
      if (signal && (signal.action.includes("شراء") || signal.action.includes("بيع"))) {
        const isBuy = signal.action.includes("شراء");
        const emoji = isBuy ? "🟢" : "🔴";
        const signalMessage = `${emoji} <b>${signal.action}</b>\n\n` +
          `📊 أرامكو: ${aramcoRecord.price.toFixed(2)} SAR\n` +
          `📋 الخطة: ${signal.plan.label}\n` +
          `💰 العائد المتوقع: ${signal.plan.expectedReturn > 0 ? "+" : ""}${signal.plan.expectedReturn}%\n` +
          `📈 التغيير: ${aramcoRecord.change > 0 ? "+" : ""}${aramcoRecord.change?.toFixed(2)}%`;

        const sendResult = await sendTelegramMessage(botToken, chatId, signalMessage);
        results.notifications?.push({
          type: "buy_signal",
          sent: sendResult.ok,
          error: sendResult.error,
        });

        await db.notificationLog.create({
          data: {
            type: isBuy ? "buy_signal" : "sell_signal",
            title: `${signal.action} Signal`,
            message: signalMessage,
            success: sendResult.ok,
            error: sendResult.error,
          },
        });
      }

      // Send USD drop alert
      if (usdDropDetected) {
        const dropMessage = "⚠️ <b>تنبيه انخفاض الدولار</b>\n\n" +
          `💱 USD/EGP: ${usdEgpRecord.price.toFixed(2)} EGP\n` +
          `📉 السابق: ${previousUsdEgp?.price.toFixed(2)} EGP\n` +
          `📊 التغيير: ${usdEgpRecord.change?.toFixed(2)}%\n` +
          `🎯 الحد: ${threshold}%`;

        const sendResult = await sendTelegramMessage(botToken, chatId, dropMessage);
        results.notifications?.push({
          type: "usd_drop_alert",
          sent: sendResult.ok,
          error: sendResult.error,
        });

        await db.notificationLog.create({
          data: {
            type: "usd_drop_alert",
            title: "USD/EGP Drop Alert",
            message: dropMessage,
            success: sendResult.ok,
            error: sendResult.error,
          },
        });
      }
    } else {
      if (signal || usdDropDetected) {
        results.notifications?.push({
          type: "skipped",
          sent: false,
          error: "Telegram not configured (missing bot token or chat ID)",
        });
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
