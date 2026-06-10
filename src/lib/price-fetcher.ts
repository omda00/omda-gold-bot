import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

export interface PriceFetchResult {
  price: number;
  source: string;
}

/**
 * Use web search + LLM to fetch the current Aramco (Saudi Aramco) stock price in SAR
 */
export async function fetchAramcoPrice(): Promise<PriceFetchResult> {
  const zai = await ZAI.create();

  // Step 1: Web search for Aramco stock price
  const searchResults = await zai.functions.invoke("web_search", {
    query: "Saudi Aramco stock price today SAR Tadawul 2222",
    num: 5,
  });

  const searchText =
    typeof searchResults === "string"
      ? searchResults
      : JSON.stringify(searchResults);

  // Step 2: Use LLM to extract the price number from search results
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

  throw new Error("Could not extract Aramco price from search results");
}

/**
 * Use web search + LLM to fetch the current USD to EGP exchange rate
 */
export async function fetchUsdEgpRate(): Promise<PriceFetchResult> {
  const zai = await ZAI.create();

  // Step 1: Web search for USD/EGP rate
  const searchResults = await zai.functions.invoke("web_search", {
    query: "USD to EGP exchange rate today Egyptian pound",
    num: 5,
  });

  const searchText =
    typeof searchResults === "string"
      ? searchResults
      : JSON.stringify(searchResults);

  // Step 2: Use LLM to extract the rate number from search results
  const completion = await zai.chat.completions.create({
    model: "glm-4",
    messages: [
      {
        role: "system",
        content:
          "You are a financial data extractor. Extract the current USD to EGP (Egyptian Pound) exchange rate from the given search results. Return ONLY a JSON object with 'rate' (number, how many EGP per 1 USD) and 'source' (string, the source of the data). If you cannot find a rate, return {\"rate\": null, \"source\": \"unknown\"}. Do not include any other text.",
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
      source: parsed.source || "web_search",
    };
  }

  throw new Error("Could not extract USD/EGP rate from search results");
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
