import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fetchAllPrices,
  savePriceRecord,
  isRateLimited,
} from "@/lib/price-fetcher";
import { getConfig } from "@/lib/config-seeder";
import { getCairoHourBucket } from "@/lib/report-sender";

// Karat symbol mapping
const KARAT_SYMBOLS: Record<number, string> = {
  24: "GOLD_24K_EGP",
  22: "GOLD_22K_EGP",
  21: "GOLD_21K_EGP",
  18: "GOLD_18K_EGP",
};

const GOLD_POUND_SYMBOL = "GOLD_POUND_EGP";

/**
 * GET /api/cron/refresh-prices - Refresh prices (Telegram send DISABLED)
 *
 * This endpoint ONLY refreshes prices from the web (scrape + save to DB) so
 * the dashboard has fresh data. It NO LONGER sends Telegram hourly reports —
 * those are handled EXCLUSIVELY by the Cloudflare Worker (Cron Trigger
 * "0 * * * *") to avoid duplicate sends from two independent lock systems.
 *
 * Owner-only test sends: use /api/automation/run?test=true or the Worker's
 * /__test endpoint.
 */
export async function GET() {
  try {
    console.log("[cron/refresh-prices] 🔄 Starting price refresh...");

    const automationEnabled = await getConfig("AUTOMATION_ENABLED");

    // ========================================
    // EARLY LOCK CHECK — avoid expensive web scraping when we won't send
    // ========================================
    // Callers (instrumentation.ts scheduler, cron-service, homepage self-heal)
    // poll this endpoint every 5 minutes. Without this early check, every
    // poll would trigger a full web scrape (iSagha + Google Finance) —
    // 288 scrapes/day, risking IP bans and wasting resources.
    //
    // The lock stores the Cairo hour-bucket ("YYYY-MM-DD-HH"). If the stored
    // bucket matches the current Cairo hour, a report was already sent this
    // hour → skip scraping entirely and return immediately. Prices are still
    // served from the DB (last fetched values) to the dashboard.
    //
    // Only when the bucket differs (i.e. a new Cairo hour has started) do we
    // proceed to scrape fresh prices and send the report.
    //
    // IMPORTANT: using hour-bucket (not timestamp TTL) means send-loop
    // latency never causes a false "already sent" in the next hour. This
    // fixes the intermittent delivery bug that affected non-owner
    // subscribers.
    let lockAlreadyHeld = false;
    if (automationEnabled === "true") {
      const existing = await db.appConfig.findUnique({ where: { key: "HOURLY_REPORT_LOCK" } });
      if (existing && existing.value === getCairoHourBucket()) {
        lockAlreadyHeld = true;
      }
    }

    if (lockAlreadyHeld) {
      // Lock is fresh — no report due this tick. Skip scraping entirely.
      // Return the latest known prices from the DB so the caller gets a
      // meaningful response without paying the scrape cost.
      const gold = await db.priceRecord.findFirst({
        where: { symbol: "GOLD_EGP" },
        orderBy: { createdAt: "desc" },
      });
      const usdEgp = await db.priceRecord.findFirst({
        where: { symbol: "USD_EGP" },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({
        success: true,
        skipped: "lock_held",
        message: "Hourly report already sent this hour — skipping scrape",
        prices: {
          gold: gold?.sellPrice ?? null,
          usdEgp: usdEgp?.price ?? null,
        },
        hourlyReport: { sent: false, details: "lock held (already sent this hour)" },
      });
    }

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
    // HOURLY REPORT — now handled by Cloudflare Worker (cron "0 * * * *")
    // ========================================
    // Telegram hourly reports are sent EXCLUSIVELY by the Cloudflare Worker
    // at https://omda-gold-bot.fces7007.workers.dev (Cron Trigger at minute 0
    // of every hour). This Vercel endpoint NO LONGER sends Telegram messages.
    //
    // REASON: the Worker uses a Cloudflare KV lock while this endpoint used a
    // Neon DB lock — two INDEPENDENT locks. When both systems ran, the Worker
    // sent at :00 (KV lock) and this endpoint sent again at ~:04 (Neon lock
    // not held) → duplicate messages. Disabling the send here makes Cloudflare
    // the SOLE sender; this endpoint now ONLY refreshes prices (scrape + save)
    // so the dashboard has fresh data.
    //
    // Owner-only test sends are still available via /api/automation/run?test=true
    // and the Worker's /__test endpoint.
    const reportSent = false;
    const reportDetails = "Handled by Cloudflare Worker (cron 0 * * * *)";
    console.log("[cron/refresh-prices] ℹ️ Telegram send disabled — handled by Cloudflare Worker");

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
