import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchAllPrices, savePriceRecord } from "@/lib/price-fetcher";
import { sendTelegramMessage } from "@/lib/telegram";
import { getConfig } from "@/lib/config-seeder";
import {
  wasReportSentRecently,
  sendReportToAllUsers,
  sendReportViaGlobalConfig,
  buildHourlyReport,
} from "@/lib/report-sender";

/**
 * Detect if USD/EGP has experienced a significant drop.
 */
function detectUsdDrop(
  currentRate: number,
  previousRate: number,
  threshold: number
): boolean {
  if (previousRate <= 0) return false;
  const changePercent = ((currentRate - previousRate) / previousRate) * 100;
  return changePercent <= -threshold;
}

/**
 * GET /api/automation/run - Triggered by Vercel Cron or UptimeRobot
 */
export async function GET() {
  return POST();
}

/**
 * POST /api/automation/run - Run the full automation cycle:
 * 1. Fetch current prices (Gold EGP + USD/EGP + all karats)
 * 2. Check if USD/EGP has a significant drop
 * 3. Send Telegram notifications (DEDUPLICATED — only once per hour)
 */
export async function POST() {
  const results: {
    prices?: { gold?: { price: number; change: number }; usdEgp?: { price: number; change: number } };
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

    // Step 1: Fetch current prices
    let goldRecord;
    let usdEgpRecord;
    let allKaratsData: { karat: number; sellPrice: number; buyPrice: number | null; sellWorkmanship: number | null; buyWorkmanship: number | null; changeAmount: number | null; changePercent: number | null }[] = [];
    let goldPoundData: { sellPrice: number | null; buyPrice: number | null; sellWorkmanship: number | null; buyWorkmanship: number | null; changeAmount: number | null; changePercent: number | null } | null = null;

    try {
      const allPrices = await fetchAllPrices();

      if (!allPrices.gold && !allPrices.usdEgp) {
        throw new Error("Could not fetch any prices from any source");
      }

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

    // Step 2: Check USD/EGP drop
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

    // Step 3: Send hourly report (DEDUPLICATED — only once per 55 minutes)
    const alreadySent = await wasReportSentRecently("hourly_report", 55);

    if (alreadySent) {
      console.log("[automation] ⏭️ Hourly report already sent in last 55 min — skipping");
      results.notifications?.push({
        type: "hourly_report",
        sent: false,
        details: "تم إرسال التقرير بالفعل في آخر ساعة — تم التخطي",
      });
    } else {
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
      });

      const activeUsers = await db.telegramUser.findMany({ where: { active: true } });

      if (activeUsers.length > 0) {
        const dailyResult = await sendReportToAllUsers(hourlyReport, "hourly_report", "Hourly Price Report");
        results.notifications?.push({
          type: "hourly_report",
          sent: dailyResult.sent > 0,
          details: `تم الإرسال إلى ${dailyResult.sent}/${dailyResult.total} مستخدم`,
        });
      } else {
        const result = await sendReportViaGlobalConfig(hourlyReport, "hourly_report", "Hourly Price Report");
        results.notifications?.push({
          type: "hourly_report",
          sent: result.ok,
          error: result.error,
          details: "تم الإرسال عبر الإعدادات العامة",
        });
      }
    }

    // Send USD drop alert (separate type, also deduplicated per 10 min)
    if (usdDropDetected) {
      const dropAlreadySent = await wasReportSentRecently("usd_drop_alert", 10);

      if (dropAlreadySent) {
        console.log("[automation] ⏭️ USD drop alert already sent recently — skipping");
      } else {
        const usdSource = usdEgpRecord.source || "multi-source";
        const dropMessage = "⚠️ <b>تنبيه نزول قوي لسعر الدولار</b>\n\n" +
          `💱 USD/EGP: ${usdEgpRecord.price.toFixed(2)} ج.م\n` +
          `📉 السابق: ${previousUsdEgp?.price.toFixed(2)} ج.م\n` +
          `📊 التغيير: ${usdEgpRecord.change?.toFixed(2)}%\n` +
          `🎯 الحد: ${threshold}%\n` +
          `📌 المصدر: ${usdSource}`;

        const activeUsers = await db.telegramUser.findMany({ where: { active: true } });

        if (activeUsers.length > 0) {
          const dropResult = await sendReportToAllUsers(dropMessage, "usd_drop_alert", "USD/EGP Drop Alert");
          results.notifications?.push({
            type: "usd_drop_alert",
            sent: dropResult.sent > 0,
            details: `تم الإرسال إلى ${dropResult.sent}/${dropResult.total} مستخدم`,
          });
        } else {
          const result = await sendReportViaGlobalConfig(dropMessage, "usd_drop_alert", "USD/EGP Drop Alert");
          results.notifications?.push({
            type: "usd_drop_alert",
            sent: result.ok,
            error: result.error,
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
