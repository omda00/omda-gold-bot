import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fetchAllPrices,
  savePriceRecord,
  isRateLimited,
} from "@/lib/price-fetcher";
import { getConfig } from "@/lib/config-seeder";
import {
  wasReportSentRecently,
  sendReportToAllUsers,
  sendReportViaGlobalConfig,
  buildHourlyReport,
} from "@/lib/report-sender";

// Karat symbol mapping
const KARAT_SYMBOLS: Record<number, string> = {
  24: "GOLD_24K_EGP",
  22: "GOLD_22K_EGP",
  21: "GOLD_21K_EGP",
  18: "GOLD_18K_EGP",
};

const GOLD_POUND_SYMBOL = "GOLD_POUND_EGP";

/**
 * GET /api/cron/refresh-prices - Cron: Refresh prices AND auto-send hourly reports
 *
 * Called by UptimeRobot every 30 minutes and Vercel Cron every hour.
 * - Always refreshes prices from the web
 * - Automatically sends Telegram hourly report IF 55+ minutes since last report
 *   (deduplicated — won't send twice in the same hour)
 */
export async function GET() {
  try {
    console.log("[cron/refresh-prices] 🔄 Starting price refresh...");

    const automationEnabled = await getConfig("AUTOMATION_ENABLED");

    const allPrices = await fetchAllPrices();

    // Save whatever we got from the web
    if (allPrices.gold || allPrices.usdEgp || allPrices.allKarats.length > 0) {
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

      for (const karatPrice of allPrices.allKarats) {
        const symbol = KARAT_SYMBOLS[karatPrice.karat];
        if (symbol) {
          savePromises.push(
            savePriceRecord(symbol, karatPrice.sellPrice, "EGP", "iSagha.com", {
              buyPrice: karatPrice.buyPrice ?? undefined,
              sellPrice: karatPrice.sellPrice,
              sellWorkmanship: karatPrice.sellWorkmanship ?? undefined,
              buyWorkmanship: karatPrice.buyWorkmanship ?? undefined,
              changeAmount: karatPrice.changeAmount ?? undefined,
              changePercent: karatPrice.changePercent ?? undefined,
            })
          );
        }
      }

      if (allPrices.goldPound && allPrices.goldPound.sellPrice) {
        savePromises.push(
          savePriceRecord(GOLD_POUND_SYMBOL, allPrices.goldPound.sellPrice, "EGP", "iSagha.com", {
            buyPrice: allPrices.goldPound.buyPrice ?? undefined,
            sellPrice: allPrices.goldPound.sellPrice,
            sellWorkmanship: allPrices.goldPound.sellWorkmanship ?? undefined,
            buyWorkmanship: allPrices.goldPound.buyWorkmanship ?? undefined,
            changeAmount: allPrices.goldPound.changeAmount ?? undefined,
            changePercent: allPrices.goldPound.changePercent ?? undefined,
          })
        );
      }

      await Promise.all(savePromises);
    }

    // Persist the fetch timestamp so /api/prices POST can short-circuit
    // for the next 60s (DB-based cache shared across Vercel instances).
    if (allPrices.gold || allPrices.usdEgp) {
      try {
        await db.appConfig.upsert({
          where: { key: "LAST_FETCH_AT" },
          update: { value: String(Date.now()) },
          create: { key: "LAST_FETCH_AT", value: String(Date.now()) },
        });
      } catch (err) {
        console.error("[cron/refresh-prices] Failed to persist LAST_FETCH_AT:", err);
      }
    }

    const gold = await db.priceRecord.findFirst({
      where: { symbol: "GOLD_EGP" },
      orderBy: { createdAt: "desc" },
    });

    const usdEgp = await db.priceRecord.findFirst({
      where: { symbol: "USD_EGP" },
      orderBy: { createdAt: "desc" },
    });

    console.log(
      `[cron/refresh-prices] ✅ Prices refreshed: gold=${gold?.sellPrice ?? "N/A"}, usdEgp=${usdEgp?.price ?? "N/A"}`
    );

    // ========================================
    // Auto-send hourly report (DEDUPLICATED)
    // ========================================
    let reportSent = false;
    let reportDetails = "";

    if (automationEnabled === "true" && gold && usdEgp) {
      const alreadySent = await wasReportSentRecently("hourly_report", 55);

      if (!alreadySent) {
        console.log("[cron/refresh-prices] 📨 No report sent in last 55 min — sending now...");

        const hourlyReport = buildHourlyReport({
          goldPrice: gold.price,
          goldBuyPrice: gold.buyPrice,
          goldSellPrice: gold.sellPrice,
          goldChange: gold.change ?? 0,
          goldSource: gold.source || "multi-source",
          allKarats: allPrices.allKarats || [],
          goldPound: allPrices.goldPound || null,
          usdEgpPrice: usdEgp.price,
          usdEgpChange: usdEgp.change ?? 0,
          usdEgpSource: usdEgp.source || "multi-source",
        });

        const activeUsers = await db.telegramUser.findMany({ where: { active: true } });

        if (activeUsers.length > 0) {
          const result = await sendReportToAllUsers(hourlyReport, "hourly_report", "Hourly Price Report");
          reportSent = result.sent > 0;
          reportDetails = `تم الإرسال إلى ${result.sent}/${result.total} مستخدم`;
          console.log(`[cron/refresh-prices] 📨 Report sent: ${result.sent}/${result.total}`);
        } else {
          const result = await sendReportViaGlobalConfig(hourlyReport, "hourly_report", "Hourly Price Report");
          reportSent = result.ok;
          reportDetails = result.ok ? "تم الإرسال عبر الإعدادات العامة" : `فشل: ${result.error}`;
          console.log(`[cron/refresh-prices] 📨 Report via global config: ${result.ok ? "success" : result.error}`);
        }
      } else {
        console.log("[cron/refresh-prices] ⏭️ Report already sent in last 55 min — skipping");
      }
    } else if (automationEnabled !== "true") {
      console.log("[cron/refresh-prices] ⏭️ Automation disabled — skipping report");
    }

    return NextResponse.json({
      success: true,
      fetched: {
        gold: allPrices.gold !== null,
        usdEgp: allPrices.usdEgp !== null,
        karats: allPrices.allKarats.length,
        goldPound: allPrices.goldPound !== null,
      },
      prices: {
        gold: gold?.sellPrice ?? null,
        usdEgp: usdEgp?.price ?? null,
      },
      hourlyReport: {
        sent: reportSent,
        details: reportDetails || "Not needed yet",
      },
      rateLimited: isRateLimited(),
    });
  } catch (error) {
    console.error("[cron/refresh-prices] ❌ Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
