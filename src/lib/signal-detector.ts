import type { InvestmentPlan } from "@prisma/client";

export interface SignalResult {
  action: string;
  plan: InvestmentPlan;
}

/**
 * Detect which investment plan action matches the current Aramco price.
 * Returns the matching plan or null if no active plan matches.
 */
export function detectSignal(
  aramcoPrice: number,
  plan: InvestmentPlan[]
): SignalResult | null {
  // Filter to active plans and sort by order
  const activePlans = plan
    .filter((p) => p.active)
    .sort((a, b) => a.order - b.order);

  for (const p of activePlans) {
    const minOk = aramcoPrice >= p.priceRangeMin;
    const maxOk = p.priceRangeMax === null || aramcoPrice <= p.priceRangeMax;

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
