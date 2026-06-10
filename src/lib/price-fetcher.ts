import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

export interface PriceFetchResult {
  price: number;
  source: string;
}

/**
 * Extract the USD/EGP exchange rate from Google Finance HTML content.
 * Google Finance stores price data in AF_initDataCallback blocks like:
 * [51.8218758, 0.1017758, 0.1967819, 4, 4, 2]
 */
function extractUsdEgpFromGoogleFinanceHtml(html: string): number | null {
  // Pattern 1: Look for the AF_initDataCallback with USD/EGP data
  const usdEgpPattern = /USD\s*\/\s*EGP[^[]*\[([0-9]+\.[0-9]+),[0-9]+\.[0-9]+,[0-9]+\.[0-9]+/g;
  const match = usdEgpPattern.exec(html);
  if (match && match[1]) {
    const price = parseFloat(match[1]);
    if (price > 0 && price < 200) {
      return price;
    }
  }

  // Pattern 2: Most frequent rate
  const allRates = html.match(/5[0-9]\.[0-9]{4,}/g) || [];
  if (allRates.length > 0) {
    const rateFreq: Record<string, number> = {};
    for (const r of allRates) {
      rateFreq[r] = (rateFreq[r] || 0) + 1;
    }
    const sorted = Object.entries(rateFreq).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const price = parseFloat(sorted[0][0]);
      if (price > 0 && price < 200) {
        return price;
      }
    }
  }

  return null;
}

/**
 * Extract gold price per gram (21 karat) in EGP from gold-price-live.com HTML.
 * This site updates prices every second and shows gold per gram for all karats in Egypt.
 */
function extractGoldPriceFromHtml(html: string): number | null {
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  // Pattern 1: Look for عيار 21 with price
  const karat21Match = text.match(/عيار\s*21[^0-9]{0,30}([0-9,]+)/);
  if (karat21Match && karat21Match[1]) {
    const price = parseFloat(karat21Match[1].replace(/,/g, ""));
    // 21 karat gold per gram in EGP is typically 4000-8000
    if (price >= 3000 && price <= 15000) {
      return price;
    }
  }

  // Pattern 2: Look for عيار 24 with price and convert
  const karat24Match = text.match(/عيار\s*24[^0-9]{0,30}([0-9,]+)/);
  if (karat24Match && karat24Match[1]) {
    const price24 = parseFloat(karat24Match[1].replace(/,/g, ""));
    if (price24 >= 5000 && price <= 15000) {
      // Convert 24K to 21K: multiply by (21/24)
      return Math.round(price24 * (21 / 24));
    }
  }

  // Pattern 3: Find the most frequent 4-digit number in the 5000-8000 range
  const priceMatches = text.match(/[5-7][0-9]{3}/g) || [];
  if (priceMatches.length > 0) {
    const freq: Record<string, number> = {};
    for (const p of priceMatches) {
      freq[p] = (freq[p] || 0) + 1;
    }
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const price = parseFloat(sorted[0][0]);
      if (price >= 5000 && price <= 8000) {
        return price;
      }
    }
  }

  return null;
}

/**
 * Extract gold price per ounce from Investing.com XAU/EGP page.
 * Convert to per gram 21K.
 */
function extractGoldFromInvestingHtml(html: string): number | null {
  // Look for the JSON-LD structured data with the current price
  const jsonLdMatch = html.match(
    /سعر الصرف الحالي للزوج XAU\/EGP هو ([0-9,]+\.?[0-9]*)/
  );
  if (jsonLdMatch && jsonLdMatch[1]) {
    const ouncePrice = parseFloat(jsonLdMatch[1].replace(/,/g, ""));
    if (ouncePrice > 100000) {
      // Convert ounce to gram 24K then to 21K
      const gram24 = ouncePrice / 31.1035;
      const gram21 = gram24 * (21 / 24);
      return Math.round(gram21);
    }
  }

  // Also check bid/ask prices
  const bidMatch = html.match(/سعر العرض هو ([0-9,]+\.?[0-9]*)/);
  if (bidMatch && bidMatch[1]) {
    const ouncePrice = parseFloat(bidMatch[1].replace(/,/g, ""));
    if (ouncePrice > 100000) {
      const gram24 = ouncePrice / 31.1035;
      const gram21 = gram24 * (21 / 24);
      return Math.round(gram21);
    }
  }

  return null;
}

/**
 * Fetch the current USD/EGP exchange rate from Google Finance.
 * Falls back to web_search + LLM if page_reader fails.
 */
export async function fetchUsdEgpRate(): Promise<PriceFetchResult> {
  const zai = await ZAI.create();

  // Strategy 1: Read Google Finance page directly
  try {
    const pageResult = await zai.functions.invoke("page_reader", {
      url: "https://www.google.com/finance/quote/USD-EGP",
    });

    if (pageResult?.data?.html) {
      const html = pageResult.data.html as string;
      const rate = extractUsdEgpFromGoogleFinanceHtml(html);

      if (rate && rate > 0) {
        return { price: rate, source: "Google Finance" };
      }

      // Try LLM extraction
      try {
        const textContent = html
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const relevantText = textContent.substring(0, 5000);
        const completion = await zai.chat.completions.create({
          model: "glm-4",
          messages: [
            {
              role: "system",
              content:
                "You are a financial data extractor. Extract the current USD to EGP exchange rate from this Google Finance page. Return ONLY a JSON: {\"rate\": number, \"source\": \"Google Finance\"}. If not found: {\"rate\": null, \"source\": \"unknown\"}.",
            },
            {
              role: "user",
              content: `Page content:\n${relevantText}`,
            },
          ],
        });

        const content = completion.choices?.[0]?.message?.content || "";
        const parsed = extractJsonFromText(content);
        if (parsed && typeof parsed.rate === "number" && parsed.rate > 0) {
          return { price: parsed.rate, source: "Google Finance" };
        }
      } catch (llmError) {
        console.error("LLM extraction from Google Finance page failed:", llmError);
      }
    }
  } catch (pageError) {
    console.error("Google Finance page_reader failed:", pageError);
  }

  // Strategy 2: Fallback to web_search + LLM
  try {
    const searchResults = await zai.functions.invoke("web_search", {
      query: "site:google.com/finance USD EGP exchange rate",
      num: 5,
    });
    const searchText =
      typeof searchResults === "string"
        ? searchResults
        : JSON.stringify(searchResults);

    const completion = await zai.chat.completions.create({
      model: "glm-4",
      messages: [
        {
          role: "system",
          content:
            "Extract the current USD/EGP rate. Return ONLY JSON: {\"rate\": number, \"source\": \"string\"}.",
        },
        {
          role: "user",
          content: `Search results:\n${searchText}`,
        },
      ],
    });

    const content = completion.choices?.[0]?.message?.content || "";
    const parsed = extractJsonFromText(content);
    if (parsed && typeof parsed.rate === "number" && parsed.rate > 0) {
      return { price: parsed.rate, source: parsed.source || "Google Finance" };
    }
  } catch (searchError) {
    console.error("Web search fallback failed:", searchError);
  }

  throw new Error("Could not extract USD/EGP rate");
}

/**
 * Fetch the current gold price per gram (21 karat) in EGP.
 * Uses gold-price-live.com (updates every second) as primary source.
 * Falls back to Investing.com XAU/EGP then web_search.
 */
export async function fetchGoldEgpPrice(): Promise<PriceFetchResult> {
  const zai = await ZAI.create();

  // Strategy 1: gold-price-live.com (updates every second, most reliable for Egypt)
  try {
    const pageResult = await zai.functions.invoke("page_reader", {
      url: "https://gold-price-live.com",
    });

    if (pageResult?.data?.html) {
      const html = pageResult.data.html as string;
      const price = extractGoldPriceFromHtml(html);

      if (price && price > 0) {
        return { price, source: "gold-price-live.com" };
      }

      // Try LLM extraction
      try {
        const textContent = html
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const relevantText = textContent.substring(0, 8000);
        const completion = await zai.chat.completions.create({
          model: "glm-4",
          messages: [
            {
              role: "system",
              content:
                "You are a financial data extractor. Extract the current gold price per gram (21 karat / عيار 21) in Egyptian Pounds (EGP) from this page about gold prices in Egypt. Return ONLY JSON: {\"price\": number, \"source\": \"gold-price-live.com\"}. If not found: {\"price\": null, \"source\": \"unknown\"}. The price should be between 4000-8000 EGP per gram.",
            },
            {
              role: "user",
              content: `Page content:\n${relevantText}`,
            },
          ],
        });

        const content = completion.choices?.[0]?.message?.content || "";
        const parsed = extractJsonFromText(content);
        if (parsed && typeof parsed.price === "number" && parsed.price > 0) {
          return { price: parsed.price, source: "gold-price-live.com" };
        }
      } catch (llmError) {
        console.error("LLM extraction from gold-price-live.com failed:", llmError);
      }
    }
  } catch (pageError) {
    console.error("gold-price-live.com page_reader failed:", pageError);
  }

  // Strategy 2: Investing.com XAU/EGP (convert from ounce to gram)
  try {
    const pageResult = await zai.functions.invoke("page_reader", {
      url: "https://sa.investing.com/currencies/xau-egp",
    });

    if (pageResult?.data?.html) {
      const html = pageResult.data.html as string;
      const price = extractGoldFromInvestingHtml(html);

      if (price && price > 0) {
        return { price, source: "Investing.com" };
      }
    }
  } catch (pageError) {
    console.error("Investing.com page_reader failed:", pageError);
  }

  // Strategy 3: Web search fallback
  try {
    const searchResults = await zai.functions.invoke("web_search", {
      query: "سعر الذهب عيار 21 في مصر اليوم جنيه مصري",
      num: 5,
    });
    const searchText =
      typeof searchResults === "string"
        ? searchResults
        : JSON.stringify(searchResults);

    const completion = await zai.chat.completions.create({
      model: "glm-4",
      messages: [
        {
          role: "system",
          content:
            "Extract the current gold price per gram (21 karat / عيار 21) in Egyptian Pounds from the search results. Return ONLY JSON: {\"price\": number, \"source\": \"string\"}. The price should be between 4000-8000 EGP.",
        },
        {
          role: "user",
          content: `Search results:\n${searchText}`,
        },
      ],
    });

    const content = completion.choices?.[0]?.message?.content || "";
    const parsed = extractJsonFromText(content);
    if (parsed && typeof parsed.price === "number" && parsed.price > 0) {
      return { price: parsed.price, source: parsed.source || "web_search" };
    }
  } catch (searchError) {
    console.error("Web search fallback failed:", searchError);
  }

  throw new Error("Could not extract gold price in EGP");
}

/**
 * Save a price record to the database and calculate change from previous
 */
export async function savePriceRecord(
  symbol: string,
  price: number,
  currency: string,
  source: string
) {
  const previous = await db.priceRecord.findFirst({
    where: { symbol },
    orderBy: { createdAt: "desc" },
  });

  const change = previous ? ((price - previous.price) / previous.price) * 100 : 0;

  return db.priceRecord.create({
    data: {
      symbol,
      price,
      currency,
      change: Math.round(change * 100) / 100,
      source,
    },
  });
}

/**
 * Try to extract JSON from text that might contain markdown code blocks
 */
function extractJsonFromText(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    // Continue
  }

  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch {
      // Continue
    }
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // Give up
    }
  }

  return null;
}
