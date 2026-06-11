import type { InvestmentPlan } from "@prisma/client";

export interface SignalResult {
  action: string;
  plan: InvestmentPlan;
}

/**
 * Simple signal: detect which investment plan action matches the current gold price in EGP.
 * Returns the matching plan or null if no active plan matches.
 */
export function detectSignal(
  goldPrice: number,
  plan: InvestmentPlan[]
): SignalResult | null {
  // Filter to active plans and sort by order
  const activePlans = plan
    .filter((p) => p.active)
    .sort((a, b) => a.order - b.order);

  for (const p of activePlans) {
    const minOk = goldPrice >= p.priceRangeMin;
    const maxOk = p.priceRangeMax === null || goldPrice <= p.priceRangeMax;

    if (minOk && maxOk) {
      return { action: p.action, plan: p };
    }
  }

  return null;
}

/**
 * Detect if USD/EGP has experienced a significant drop.
 * Returns true if the current rate dropped by at least the threshold percentage
 * compared to the previous rate.
 */
export function detectUsdDrop(
  currentRate: number,
  previousRate: number,
  threshold: number
): boolean {
  if (previousRate <= 0) return false;

  const changePercent = ((currentRate - previousRate) / previousRate) * 100;

  // A negative changePercent means the rate dropped
  return changePercent <= -threshold;
}

// ==========================================
// SMART SIGNAL ANALYSIS
// ==========================================

export interface PriceTrendPoint {
  price: number;
  timestamp: Date;
}

export interface SmartSignalAnalysis {
  /** The recommended action (e.g., "شراء قوي", "شراء تدريجي", etc.) */
  action: string;
  /** Confidence level 0-100 */
  confidence: number;
  /** Why this signal was generated */
  reason: string;
  /** Price position relative to recent range (0 = bottom, 100 = top) */
  pricePosition: number;
  /** Trend direction: "up" | "down" | "sideways" */
  trend: "up" | "down" | "sideways";
  /** Trend strength 0-100 */
  trendStrength: number;
  /** USD/EGP trend direction */
  usdEgpTrend: "up" | "down" | "stable";
  /** Current price */
  currentPrice: number;
  /** Recent average price */
  averagePrice: number;
  /** Recent high */
  recentHigh: number;
  /** Recent low */
  recentLow: number;
  /** Recommended budget allocation percentage */
  budgetAllocation: number;
  /** Expected return percentage */
  expectedReturn: number;
  /** Matching investment plan, if any */
  matchingPlan: InvestmentPlan | null;
  /** Signal label */
  label: string;
}

/**
 * Analyze price trend from a series of price points.
 * Uses linear regression slope to determine trend direction and strength.
 */
function analyzeTrend(prices: number[]): {
  direction: "up" | "down" | "sideways";
  strength: number; // 0-100
  slope: number;
} {
  if (prices.length < 2) {
    return { direction: "sideways", strength: 0, slope: 0 };
  }

  // Simple linear regression
  const n = prices.length;
  const xMean = (n - 1) / 2;
  const yMean = prices.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (prices[i] - yMean);
    denominator += (i - xMean) * (i - xMean);
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;

  // Normalize slope to a percentage of the mean price
  const slopePercent = yMean === 0 ? 0 : (slope / yMean) * 100;

  // Determine direction
  let direction: "up" | "down" | "sideways";
  if (Math.abs(slopePercent) < 0.02) {
    direction = "sideways";
  } else {
    direction = slopePercent > 0 ? "up" : "down";
  }

  // Strength: how strong is the trend (0-100)
  // A 0.5% per data point change is considered very strong
  const strength = Math.min(100, Math.abs(slopePercent) * 200);

  return { direction, strength, slope };
}

/**
 * Calculate the position of current price within a range (0-100).
 * 0 = at the bottom of the range, 100 = at the top.
 */
function calculatePricePosition(
  current: number,
  low: number,
  high: number
): number {
  if (high === low) return 50;
  return Math.round(((current - low) / (high - low)) * 100);
}

/**
 * Generate a smart signal based on comprehensive market analysis.
 *
 * This function considers:
 * 1. Current price position relative to recent range
 * 2. Price trend direction and momentum
 * 3. USD/EGP correlation and trend
 * 4. Investment plan zones
 *
 * Signal categories:
 * - شراء قوي (Strong Buy): Price significantly below average, downtrend, good entry
 * - شراء تدريجي (Gradual Buy): Price below average, reasonable entry
 * - انتظار ومراقبة (Wait & Watch): Price near average, no clear trend
 * - بيع جزئي (Partial Sell): Price above average, uptrend
 * - بيع نشط (Active Sell): Price significantly above average, strong uptrend
 */
export function generateSmartSignal(params: {
  currentGoldPrice: number;
  goldPriceHistory: PriceTrendPoint[];
  currentUsdEgp: number;
  usdEgpHistory: PriceTrendPoint[];
  investmentPlans: InvestmentPlan[];
}): SmartSignalAnalysis {
  const {
    currentGoldPrice,
    goldPriceHistory,
    currentUsdEgp,
    usdEgpHistory,
    investmentPlans,
  } = params;

  // === Extract price arrays ===
  const goldPrices = goldPriceHistory.map((p) => p.price);
  const usdPrices = usdEgpHistory.map((p) => p.price);

  // === Calculate statistics ===
  const recentHigh = goldPrices.length > 0 ? Math.max(...goldPrices) : currentGoldPrice;
  const recentLow = goldPrices.length > 0 ? Math.min(...goldPrices) : currentGoldPrice;
  const averagePrice =
    goldPrices.length > 0
      ? goldPrices.reduce((a, b) => a + b, 0) / goldPrices.length
      : currentGoldPrice;

  // === Price Position (0-100) ===
  const pricePosition = calculatePricePosition(
    currentGoldPrice,
    recentLow,
    recentHigh
  );

  // === Gold Price Trend ===
  const goldTrend = analyzeTrend(goldPrices);

  // === USD/EGP Trend ===
  const usdEgpTrend = usdPrices.length >= 2
    ? analyzeTrend(usdPrices)
    : { direction: "stable" as const, strength: 0, slope: 0 };

  const usdEgpTrendLabel: "up" | "down" | "stable" =
    usdEgpTrend.direction === "sideways" ? "stable" : usdEgpTrend.direction;

  // === Find matching investment plan ===
  const activePlans = investmentPlans
    .filter((p) => p.active)
    .sort((a, b) => a.order - b.order);

  let matchingPlan: InvestmentPlan | null = null;
  for (const p of activePlans) {
    const minOk = currentGoldPrice >= p.priceRangeMin;
    const maxOk = p.priceRangeMax === null || currentGoldPrice <= p.priceRangeMax;
    if (minOk && maxOk) {
      matchingPlan = p;
      break;
    }
  }

  // === Smart Signal Determination ===
  // Weight factors:
  // - Price position: 40% (most important)
  // - Trend direction: 30%
  // - USD/EGP correlation: 20%
  // - Volatility/range: 10%

  let score = 0; // -100 = strong sell, 0 = neutral, +100 = strong buy

  // Factor 1: Price Position (40%)
  // Lower price position → more buy signal
  if (pricePosition <= 20) {
    score += 40; // Very low = strong buy
  } else if (pricePosition <= 35) {
    score += 28; // Low = buy
  } else if (pricePosition <= 50) {
    score += 10; // Below average = slight buy
  } else if (pricePosition <= 65) {
    score -= 10; // Above average = slight sell
  } else if (pricePosition <= 80) {
    score -= 28; // High = sell
  } else {
    score -= 40; // Very high = strong sell
  }

  // Factor 2: Trend Direction (30%)
  if (goldTrend.direction === "down") {
    // Price dropping = opportunity to buy
    const trendBonus = Math.round(goldTrend.strength * 0.3);
    score += trendBonus;
  } else if (goldTrend.direction === "up") {
    // Price rising = might be time to sell
    const trendPenalty = Math.round(goldTrend.strength * 0.3);
    score -= trendPenalty;
  }

  // Factor 3: USD/EGP Correlation (20%)
  // If USD is rising → gold in EGP tends to rise → buy now
  // If USD is falling → gold in EGP tends to fall → sell/hold
  if (usdEgpTrendLabel === "up") {
    score += 15; // USD rising supports gold
  } else if (usdEgpTrendLabel === "down") {
    score -= 15; // USD falling puts pressure on gold
  }

  // Factor 4: Volatility (10%)
  // Higher volatility → reduce confidence → move toward neutral
  const range = recentHigh - recentLow;
  const volatilityPercent = averagePrice > 0 ? (range / averagePrice) * 100 : 0;
  if (volatilityPercent > 5) {
    // High volatility → pull score toward 0 (neutral)
    score = Math.round(score * 0.8);
  }

  // === Determine Action ===
  let action: string;
  let budgetAllocation: number;
  let expectedReturn: number;
  let confidence: number;
  let reason: string;

  if (score >= 50) {
    action = "شراء قوي";
    budgetAllocation = 40;
    expectedReturn = 40;
    confidence = Math.min(95, 60 + Math.abs(score - 50));
    reason = buildReason("strong_buy", pricePosition, goldTrend, usdEgpTrendLabel, currentGoldPrice, recentLow, recentHigh);
  } else if (score >= 20) {
    action = "شراء تدريجي";
    budgetAllocation = 30;
    expectedReturn = 25;
    confidence = Math.min(90, 50 + Math.abs(score - 20));
    reason = buildReason("gradual_buy", pricePosition, goldTrend, usdEgpTrendLabel, currentGoldPrice, recentLow, recentHigh);
  } else if (score >= -20) {
    action = "انتظار ومراقبة";
    budgetAllocation = 0;
    expectedReturn = 0;
    confidence = Math.min(85, 40 + (20 - Math.abs(score)));
    reason = buildReason("watch", pricePosition, goldTrend, usdEgpTrendLabel, currentGoldPrice, recentLow, recentHigh);
  } else if (score >= -50) {
    action = "بيع جزئي";
    budgetAllocation = 30;
    expectedReturn = -20;
    confidence = Math.min(90, 50 + Math.abs(score + 20));
    reason = buildReason("partial_sell", pricePosition, goldTrend, usdEgpTrendLabel, currentGoldPrice, recentLow, recentHigh);
  } else {
    action = "بيع نشط";
    budgetAllocation = 50;
    expectedReturn = -35;
    confidence = Math.min(95, 60 + Math.abs(score + 50));
    reason = buildReason("active_sell", pricePosition, goldTrend, usdEgpTrendLabel, currentGoldPrice, recentLow, recentHigh);
  }

  // If matching plan exists, use its expectedReturn and budgetAllocation as secondary input
  if (matchingPlan) {
    // Blend: 60% smart analysis + 40% plan configuration
    expectedReturn = Math.round(expectedReturn * 0.6 + matchingPlan.expectedReturn * 0.4);
    budgetAllocation = Math.round(budgetAllocation * 0.6 + Math.abs(matchingPlan.expectedReturn) * 0.4);
  }

  // Generate label
  const label = buildLabel(action, currentGoldPrice, pricePosition, goldTrend.direction);

  return {
    action,
    confidence,
    reason,
    pricePosition,
    trend: goldTrend.direction,
    trendStrength: goldTrend.strength,
    usdEgpTrend: usdEgpTrendLabel,
    currentPrice: currentGoldPrice,
    averagePrice: Math.round(averagePrice),
    recentHigh: Math.round(recentHigh),
    recentLow: Math.round(recentLow),
    budgetAllocation,
    expectedReturn,
    matchingPlan,
    label,
  };
}

/**
 * Build a human-readable reason for the signal.
 */
function buildReason(
  signalType: "strong_buy" | "gradual_buy" | "watch" | "partial_sell" | "active_sell",
  pricePosition: number,
  goldTrend: { direction: string; strength: number },
  usdEgpTrend: "up" | "down" | "stable",
  currentPrice: number,
  recentLow: number,
  recentHigh: number
): string {
  const parts: string[] = [];

  // Price position analysis
  if (pricePosition <= 20) {
    parts.push(`السعر قريب من أقل مستوى (${recentLow.toLocaleString()} ج.م)`);
  } else if (pricePosition <= 40) {
    parts.push(`السعر في المنطقة السفلية من النطاق الأخير`);
  } else if (pricePosition <= 60) {
    parts.push(`السعر قريب من المتوسط (${Math.round((recentLow + recentHigh) / 2).toLocaleString()} ج.م)`);
  } else if (pricePosition <= 80) {
    parts.push(`السعر في المنطقة العليا من النطاق الأخير`);
  } else {
    parts.push(`السعر قريب من أعلى مستوى (${recentHigh.toLocaleString()} ج.م)`);
  }

  // Trend analysis
  if (goldTrend.direction === "down" && goldTrend.strength > 30) {
    parts.push("اتجاه هبوط قوي");
  } else if (goldTrend.direction === "down") {
    parts.push("اتجاه هبوط تدريجي");
  } else if (goldTrend.direction === "up" && goldTrend.strength > 30) {
    parts.push("اتجاه صعود قوي");
  } else if (goldTrend.direction === "up") {
    parts.push("اتجاه صعود تدريجي");
  } else {
    parts.push("استقرار نسبي");
  }

  // USD correlation
  if (usdEgpTrend === "up") {
    parts.push("الدولار مرتفع ← يدعم ارتفاع الذهب");
  } else if (usdEgpTrend === "down") {
    parts.push("الدولار منخفض ← ضغط على الذهب");
  }

  // Signal-specific recommendation
  switch (signalType) {
    case "strong_buy":
      parts.push("فرصة شراء ممتازة — السعر في قاع نسبي");
      break;
    case "gradual_buy":
      parts.push("يُنصح بالشراء التدريجي — تجنب الشراء دفعة واحدة");
      break;
    case "watch":
      parts.push("انتظر تطورات السوق قبل اتخاذ قرار");
      break;
    case "partial_sell":
      parts.push("يُنصح بجني جزء من الأرباح");
      break;
    case "active_sell":
      parts.push("السعر مرتفع بشكل ملحوظ — فرصة بيع جيدة");
      break;
  }

  return parts.join(" • ");
}

/**
 * Build a short label for the signal.
 */
function buildLabel(
  action: string,
  currentPrice: number,
  pricePosition: number,
  trendDirection: string
): string {
  const posDesc =
    pricePosition <= 25 ? "قاع نسبي"
    : pricePosition <= 50 ? "أقل من المتوسط"
    : pricePosition <= 75 ? "أعلى من المتوسط"
    : "قمة نسبية";

  const trendDesc =
    trendDirection === "up" ? "صاعد"
    : trendDirection === "down" ? "هابط"
    : "مستقر";

  return `${action} — السعر ${posDesc} (${currentPrice.toLocaleString()} ج.م) • اتجاه ${trendDesc}`;
}
