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
 * The first number is the current price, second is the absolute change,
 * third is the percentage change.
 */
function extractUsdEgpFromGoogleFinanceHtml(html: string): number | null {
  // Pattern 1: Look for the AF_initDataCallback with USD/EGP data
  // Format: ["USD / EGP",..., [PRICE, CHANGE, CHANGE_PCT, ...], ...]
  const usdEgpPattern = /USD\s*\/\s*EGP[^[]*\[([0-9]+\.[0-9]+),[0-9]+\.[0-9]+,[0-9]+\.[0-9]+/g;
  const match = usdEgpPattern.exec(html);
  if (match && match[1]) {
    const price = parseFloat(match[1]);
    if (price > 0 && price < 200) {
      return price;
    }
  }

  // Pattern 2: Look for the most frequent rate (current price is usually the most repeated)
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
 * Extract Aramco stock price from Google Finance HTML content.
 */
function extractAramcoFromGoogleFinanceHtml(html: string): number | null {
  // Pattern 1: Look for Aramco data in AF_initDataCallback with "Saudi Aramco" or "Saudi Arabian Oil"
  const saudiPattern = /Saudi(?:\s+Arabian\s+Oil|\s+Aramco)[^[]*\[([0-9]+\.[0-9]+),/g;
  let match = saudiPattern.exec(html);
  if (match && match[1]) {
    const price = parseFloat(match[1]);
    // Aramco stock is typically between 20-40 SAR
    if (price > 0 && price < 100) {
      return price;
    }
  }

  // Pattern 2: Look for the most frequent 27.xx price (current price is most repeated)
  const allPrices = html.match(/2[5-9]\.[0-9]{2,4}/g) || [];
  if (allPrices.length > 0) {
    const priceFreq: Record<string, number> = {};
    for (const p of allPrices) {
      priceFreq[p] = (priceFreq[p] || 0) + 1;
    }
    const sorted = Object.entries(priceFreq).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const price = parseFloat(sorted[0][0]);
      // Verify it's in a reasonable range for Aramco stock (20-40 SAR)
      if (price >= 20 && price <= 40) {
        return price;
      }
    }
  }

  return null;
}

/**
 * Fetch the current USD/EGP exchange rate from Google Finance using page_reader.
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

      // Try to extract the rate from the HTML
      const rate = extractUsdEgpFromGoogleFinanceHtml(html);

      if (rate && rate > 0) {
        return {
          price: rate,
          source: "Google Finance",
        };
      }

      // If regex extraction fails, try LLM on the HTML content
      try {
        // Get a sample of the HTML that might contain the price
        const textContent = html
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        // Look for numbers around the USD/EGP mention
        const usdEgpContext = textContent.match(
          /USD.{0,200}EGP.{0,500}([0-9]+\.[0-9]{2,4})/
        );

        if (usdEgpContext && usdEgpContext[1]) {
          const rate = parseFloat(usdEgpContext[1]);
          if (rate > 0 && rate < 200) {
            return {
              price: rate,
              source: "Google Finance",
            };
          }
        }

        // Last resort: use LLM on a subset of the content
        const relevantText = textContent.substring(0, 5000);
        const completion = await zai.chat.completions.create({
          model: "glm-4",
          messages: [
            {
              role: "system",
              content:
                "You are a financial data extractor. Extract the current USD to EGP exchange rate from this Google Finance page content. Return ONLY a JSON object with 'rate' (number, how many EGP per 1 USD) and 'source' (always 'Google Finance'). If you cannot find a rate, return {\"rate\": null, \"source\": \"unknown\"}. Do not include any other text.",
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
          return {
            price: parsed.rate,
            source: "Google Finance",
          };
        }
      } catch (llmError) {
        console.error("LLM extraction from Google Finance page failed:", llmError);
      }
    }
  } catch (pageError) {
    console.error("Google Finance page_reader failed, falling back to web search:", pageError);
  }

  // Strategy 2: Fallback to web_search + LLM (with Google Finance preference)
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
            "You are a financial data extractor. Extract the current USD to EGP (Egyptian Pound) exchange rate. Prefer data from Google Finance if available. Return ONLY a JSON object with 'rate' (number, how many EGP per 1 USD) and 'source' (string, prefer 'Google Finance'). If you cannot find a rate, return {\"rate\": null, \"source\": \"unknown\"}. Do not include any other text.",
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
      return {
        price: parsed.rate,
        source: parsed.source || "Google Finance",
      };
    }
  } catch (searchError) {
    console.error("Web search fallback also failed:", searchError);
  }

  throw new Error("Could not extract USD/EGP rate from Google Finance or web search");
}

/**
 * Fetch the current Aramco stock price from Google Finance using page_reader.
 * Falls back to web_search + LLM if page_reader fails.
 */
export async function fetchAramcoPrice(): Promise<PriceFetchResult> {
  const zai = await ZAI.create();

  // Strategy 1: Read Google Finance page directly for Aramco (Tadawul: 2222)
  try {
    const pageResult = await zai.functions.invoke("page_reader", {
      url: "https://www.google.com/finance/quote/2222:TADAWUL",
    });

    if (pageResult?.data?.html) {
      const html = pageResult.data.html as string;

      // Try regex extraction first
      const price = extractAramcoFromGoogleFinanceHtml(html);

      if (price && price > 0) {
        return {
          price,
          source: "Google Finance",
        };
      }

      // Try LLM on the HTML content
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
                "You are a financial data extractor. Extract the current Saudi Aramco (Tadawul: 2222) stock price in SAR from this Google Finance page content. Return ONLY a JSON object with 'price' (number) and 'source' (always 'Google Finance'). If you cannot find a price, return {\"price\": null, \"source\": \"unknown\"}. Do not include any other text.",
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
          return {
            price: parsed.price,
            source: "Google Finance",
          };
        }
      } catch (llmError) {
        console.error("LLM extraction from Google Finance page failed:", llmError);
      }
    }
  } catch (pageError) {
    console.error("Google Finance page_reader failed for Aramco, falling back to web search:", pageError);
  }

  // Strategy 2: Fallback to web_search + LLM
  try {
    const searchResults = await zai.functions.invoke("web_search", {
      query: "Saudi Aramco stock price today SAR Tadawul 2222",
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
            "You are a financial data extractor. Extract the current Saudi Aramco (Tadawul: 2222) stock price in SAR from the given search results. Return ONLY a JSON object with 'price' (number) and 'source' (string, the source of the data). If you cannot find a price, return {\"price\": null, \"source\": \"unknown\"}. Do not include any other text.",
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
      return {
        price: parsed.price,
        source: parsed.source || "web_search",
      };
    }
  } catch (searchError) {
    console.error("Web search fallback also failed:", searchError);
  }

  throw new Error("Could not extract Aramco price from Google Finance or web search");
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
  // Get the previous record to calculate change
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
  // Try to parse the text directly
  try {
    return JSON.parse(text);
  } catch {
    // Continue to other methods
  }

  // Try to extract JSON from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch {
      // Continue
    }
  }

  // Try to find JSON object in the text
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
