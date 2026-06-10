import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchAllPrices, savePriceRecord } from "@/lib/price-fetcher";
import { detectSignal, detectUsdDrop } from "@/lib/signal-detector";
import { sendTelegramMessage } from "@/lib/telegram";
import { getConfig } from "@/lib/config-seeder";

/**
 * POST /api/automation/run - Run the full automation cycle:
 * 1. Fetch current prices (Gold EGP + USD/EGP)
 * 2. Check if any buy/sell signals are triggered based on the investment plan
 * 3. Check if USD/EGP has a significant drop
 * 4. Send Telegram notifications for any alerts
 * 5. Log all notifications
 */
export async function POST() {
  const results: {
    prices?: { gold?: { price: number; change: number }; usdEgp?: { price: number; change: number } };
    signals?: { action: string; label: string } | null;
    usdDrop?: boolean;
    notifications?: { type: string; sent: boolean; error?: string }[];
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

    // Step 4: Send Telegram notifications
    const botToken = await getConfig("TELEGRAM_BOT_TOKEN");
    const chatId = await getConfig("TELEGRAM_CHAT_ID");

    const canSendTelegram = botToken && chatId;

    if (canSendTelegram) {
      // Always send daily report with both prices
      const goldBuySell = goldRecord.buyPrice && goldRecord.sellPrice
        ? `\n   بيع: ${goldRecord.sellPrice.toLocaleString()} | شراء: ${goldRecord.buyPrice.toLocaleString()}`
        : "";
      const dailyReport = "📊 <b>التقرير اليومي - أسعار الذهب والعملات</b>\n\n" +
        `🥇 <b>ذهب عيار 21:</b> ${goldRecord.price.toLocaleString()} EGP/جرام` +
        `${goldBuySell}` +
        `${goldRecord.change ? (goldRecord.change >= 0 ? " ▲" : " ▼") + Math.abs(goldRecord.change).toFixed(2) + "%" : ""}\n` +
        `💱 <b>USD/EGP:</b> ${usdEgpRecord.price.toFixed(2)} EGP` +
        `${usdEgpRecord.change ? (usdEgpRecord.change >= 0 ? " ▲" : " ▼") + Math.abs(usdEgpRecord.change).toFixed(2) + "%" : ""}\n\n` +
        `📌 المصدر: edahabapp.com`;

      const dailyResult = await sendTelegramMessage(botToken, chatId, dailyReport);
      results.notifications?.push({
        type: "daily_report",
        sent: dailyResult.ok,
        error: dailyResult.error,
      });

      await db.notificationLog.create({
        data: {
          type: "daily_report",
          title: "Daily Price Report",
          message: dailyReport,
          success: dailyResult.ok,
          error: dailyResult.error,
        },
      });

      // Send signal notification if there's a buy/sell signal
      if (signal && (signal.action.includes("شراء") || signal.action.includes("بيع"))) {
        const isBuy = signal.action.includes("شراء");
        const emoji = isBuy ? "🟢" : "🔴";
        const signalMessage = `${emoji} <b>${signal.action}</b>\n\n` +
          `🥇 ذهب عيار 21: ${goldRecord.price.toLocaleString()} EGP/جرام\n` +
          `📋 الخطة: ${signal.plan.label}\n` +
          `💰 العائد المتوقع: ${signal.plan.expectedReturn > 0 ? "+" : ""}${signal.plan.expectedReturn}%\n` +
          `📈 التغيير: ${goldRecord.change > 0 ? "+" : ""}${goldRecord.change?.toFixed(2)}%`;

        const sendResult = await sendTelegramMessage(botToken, chatId, signalMessage);
        results.notifications?.push({
          type: isBuy ? "buy_signal" : "sell_signal",
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
        const dropMessage = "⚠️ <b>تنبيه نزول قوي لسعر الدولار</b>\n\n" +
          `💱 USD/EGP: ${usdEgpRecord.price.toFixed(2)} EGP\n` +
          `📉 السابق: ${previousUsdEgp?.price.toFixed(2)} EGP\n` +
          `📊 التغيير: ${usdEgpRecord.change?.toFixed(2)}%\n` +
          `🎯 الحد: ${threshold}%\n` +
          `📌 المصدر: edahabapp.com`;

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
