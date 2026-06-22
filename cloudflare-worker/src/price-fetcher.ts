/**
 * Price Fetcher — Cloudflare Worker compatible
 *
 * Fetches gold prices (iSagha) + USD/EGP (Google Finance) using standard
 * fetch(). No Z-AI SDK, no Node.js-specific APIs — runs natively in the
 * Cloudflare Workers runtime.
 */

export interface KaratPrice {
  karat: number;
  sellPrice: number | null;
  buyPrice: number | null;
  sellWorkmanship: number | null;
  buyWorkmanship: number | null;
  changeAmount: number | null;
  changePercent: number | null;
}

export interface GoldPound {
  sellPrice: number | null;
  buyPrice: number | null;
  sellWorkmanship: number | null;
  buyWorkmanship: number | null;
  changeAmount: number | null;
  changePercent: number | null;
}

export interface PricesResult {
  gold: { price: number; sellPrice: number; buyPrice: number; source: string } | null;
  usdEgp: { price: number; source: string } | null;
  allKarats: KaratPrice[];
  goldPound: GoldPound | null;
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7",
};

const GOOGLE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

async function fetchHtml(url: string, headers: Record<string, string>, timeoutMs = 12000): Promise<string> {
  try {
    const response = await fetch(url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs) as unknown as AbortSignal,
    });
    if (!response.ok) return "";
    return await response.text();
  } catch {
    return "";
  }
}

// ===========================================
// Gold prices from iSagha (market.isagha.com)
// ===========================================
function parsePriceCell(cell: string): number | null {
  const m = cell.match(/-?\d[\d,]*\.?\d*/);
  if (!m) return null;
  const val = parseFloat(m[0].replace(/,/g, ""));
  return isNaN(val) ? null : val;
}

/**
 * Extract karat prices from table cells.
 * Cell layout: [0]=name (e.g. "عيار 21"), [1]=sellPrice, [2]=sellWorkmanship,
 *              [3]=buyPrice, [4]=buyWorkmanship, [5]=changeAmount, [6]=changePercent
 * NOTE: cells[0] is the karat NAME and must be skipped — the original bug
 * returned the karat NUMBER (e.g. 21) as the sell price!
 */
function extractKaratFromCells(cells: string[]): Omit<KaratPrice, "karat"> {
  if (cells.length < 5) {
    return {
      sellPrice: null,
      buyPrice: null,
      sellWorkmanship: null,
      buyWorkmanship: null,
      changeAmount: null,
      changePercent: null,
    };
  }

  return {
    sellPrice: parsePriceCell(cells[1]),
    sellWorkmanship: parsePriceCell(cells[2]),
    buyPrice: parsePriceCell(cells[3]),
    buyWorkmanship: parsePriceCell(cells[4]),
    changeAmount: cells.length >= 6 ? parsePriceCell(cells[5]) : null,
    changePercent: cells.length >= 7 ? parsePriceCell(cells[6]) : null,
  };
}

function extractFromIsaghaHtml(html: string) {
  const emptyKarat = () => ({
    sellPrice: null as number | null,
    buyPrice: null as number | null,
    sellWorkmanship: null as number | null,
    buyWorkmanship: null as number | null,
    changeAmount: null as number | null,
    changePercent: null as number | null,
  });

  const result: {
    gold24: ReturnType<typeof emptyKarat>;
    gold22: ReturnType<typeof emptyKarat>;
    gold21: ReturnType<typeof emptyKarat>;
    gold18: ReturnType<typeof emptyKarat>;
    goldPound: ReturnType<typeof emptyKarat>;
  } = {
    gold24: emptyKarat(),
    gold22: emptyKarat(),
    gold21: emptyKarat(),
    gold18: emptyKarat(),
    goldPound: emptyKarat(),
  };

  const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || [];
  for (const row of rows) {
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
    const cleanCells = cells.map((c) =>
      c.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    );
    if (cleanCells.length === 0) continue;

    const firstCell = cleanCells[0];
    const karatMatch = firstCell.match(/عيار\s*(\d+)/);
    if (karatMatch) {
      const karatNum = parseInt(karatMatch[1]);
      const extracted = extractKaratFromCells(cleanCells);
      if (karatNum === 24) result.gold24 = extracted;
      else if (karatNum === 22) result.gold22 = extracted;
      else if (karatNum === 21) result.gold21 = extracted;
      else if (karatNum === 18) result.gold18 = extracted;
      continue;
    }

    if (firstCell.includes("جنيه ذهب")) {
      result.goldPound = extractKaratFromCells(cleanCells);
      continue;
    }
  }

  return result;
}

// ===========================================
// USD/EGP from Google Finance
// ===========================================
function extractUsdEgpFromGoogleHtml(html: string): number | null {
  if (html.length < 1000) return null;

  // Pattern 1: <span jsname="Pdsbrc">
  const pdsbrcMatches = [
    ...html.matchAll(/jsname="Pdsbrc"[^>]*>\s*(?:<span[^>]*>)?\s*([0-9.]+)\s*(?:<\/span>)?/g),
  ];
  for (const match of pdsbrcMatches) {
    const val = parseFloat(match[1]);
    if (val > 40 && val < 80) return Math.round(val * 100) / 100;
  }

  // Pattern 2: AF_initDataCallback
  const jsPattern = /"USD\s*\/\s*EGP".{0,200}?\[(5[0-2]\.[0-9]{2,4})/g;
  let jsMatch;
  while ((jsMatch = jsPattern.exec(html)) !== null) {
    const rate = parseFloat(jsMatch[1]);
    if (rate > 40 && rate < 80) return Math.round(rate * 100) / 100;
  }

  return null;
}

// ===========================================
// Main: fetch all prices in parallel
// ===========================================
export async function fetchAllPrices(): Promise<PricesResult> {
  console.log("[price-fetcher] 🌐 Fetching iSagha + Google Finance in parallel...");

  const [isaghaHtml, googleHtml] = await Promise.all([
    fetchHtml("https://market.isagha.com/prices", BROWSER_HEADERS, 10000),
    fetchHtml("https://www.google.com/finance/quote/USD-EGP?hl=en", GOOGLE_HEADERS, 12000),
  ]);

  // Parse iSagha gold prices
  const isagha = isaghaHtml ? extractFromIsaghaHtml(isaghaHtml) : null;
  const allKarats: KaratPrice[] = [];
  let gold: PricesResult["gold"] = null;
  let goldPound: GoldPound | null = null;

  if (isagha) {
    if (isagha.gold24.sellPrice) allKarats.push({ karat: 24, ...isagha.gold24 });
    if (isagha.gold22.sellPrice) allKarats.push({ karat: 22, ...isagha.gold22 });
    if (isagha.gold21.sellPrice) allKarats.push({ karat: 21, ...isagha.gold21 });
    if (isagha.gold18.sellPrice) allKarats.push({ karat: 18, ...isagha.gold18 });

    // Primary gold price = 21K sell price (Egyptian standard)
    const g21 = isagha.gold21;
    if (g21.sellPrice) {
      gold = {
        price: g21.sellPrice,
        sellPrice: g21.sellPrice,
        buyPrice: g21.buyPrice ?? g21.sellPrice,
        source: "iSagha.com",
      };
    }

    if (isagha.goldPound.sellPrice) {
      goldPound = { ...isagha.goldPound };
    }
  }

  // Parse Google Finance USD/EGP
  let usdEgp: PricesResult["usdEgp"] = null;
  const usdVal = googleHtml ? extractUsdEgpFromGoogleHtml(googleHtml) : null;
  if (usdVal !== null) {
    usdEgp = { price: usdVal, source: "Google Finance" };
  }

  console.log(
    `[price-fetcher] ✅ gold=${gold?.sellPrice ?? "N/A"}, usdEgp=${usdEgp?.price ?? "N/A"}, karats=${allKarats.length}`
  );

  return { gold, usdEgp, allKarats, goldPound };
}

// ===========================================
// Build the hourly report message (HTML)
// ===========================================
export function buildHourlyReport(params: {
  gold: PricesResult["gold"];
  usdEgp: PricesResult["usdEgp"];
  allKarats: KaratPrice[];
  goldPound: GoldPound | null;
}): string {
  const { gold, usdEgp, allKarats, goldPound } = params;

  let report = "📊 <b>تحديث ساعة — أسعار الذهب والعملات</b>\n";
  report += `🕐 ${new Date().toLocaleString("ar-EG", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" })} بتوقيت مصر\n\n`;

  report += "🥇 <b>أسعار الذهب (ج.م/جرام):</b>\n";
  report += "━━━━━━━━━━━━━━━━━━\n";

  for (const kp of allKarats) {
    const sell = kp.sellPrice?.toLocaleString("en-US") || "—";
    const buy = kp.buyPrice?.toLocaleString("en-US") || "—";
    report += `  عيار ${kp.karat}: بيع ${sell} | شراء ${buy}\n`;
  }

  if (goldPound && (goldPound.sellPrice || goldPound.buyPrice)) {
    report += "\n🪙 <b>جنيه الذهب:</b>\n";
    report += `  بيع ${goldPound.sellPrice?.toLocaleString("en-US") || "—"} | شراء ${goldPound.buyPrice?.toLocaleString("en-US") || "—"}\n`;
  }

  if (gold && goldPound) {
    const changePercent = goldPound.changePercent;
    if (changePercent !== null && changePercent !== 0) {
      const arrow = changePercent >= 0 ? "▲" : "▼";
      report += `\n📈 التغيير (عيار 21): ${arrow} ${Math.abs(changePercent).toFixed(2)}%\n`;
    }
  }

  if (usdEgp) {
    report += `\n💱 <b>USD/EGP:</b> ${usdEgp.price.toFixed(2)} ج.م\n`;
  }

  report += `\n📌 المصادر: iSagha.com + Google Finance`;
  report += `\n\n🤖 <i>يعمل عبر Cloudflare Workers — إرسال مضمون 24/7</i>`;

  return report;
}
