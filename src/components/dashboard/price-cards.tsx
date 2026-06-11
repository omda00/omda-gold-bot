"use client";

import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  DollarSign,
  Gem,
  Radio,
  Clock,
  Globe,
  ArrowRightLeft,
  ArrowDownUp,
  Coins,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { PriceRecord, KaratPriceRecord, GoldPoundRecord } from "@/lib/dashboard-types";

function formatPrice(price: number | null | undefined, decimals = 0): string {
  if (price === null || price === undefined) return "—";
  return price.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const karatLabels: Record<number, string> = {
  24: "عيار ٢٤",
  22: "عيار ٢٢",
  21: "عيار ٢١",
  18: "عيار ١٨",
};

interface PriceCardsProps {
  prices: { gold: PriceRecord | null; usdEgp: PriceRecord | null; allKarats: KaratPriceRecord[]; goldPound: GoldPoundRecord | null };
  loading: boolean;
  fetching: boolean;
  onFetchPrices: () => void;
}

export function PriceCards({
  prices,
  loading,
  fetching,
  onFetchPrices,
}: PriceCardsProps) {
  const usdChange = prices.usdEgp?.change ?? 0;
  const isUsdPositive = usdChange >= 0;
  const goldChange = prices.gold?.change ?? 0;
  const isGoldPositive = goldChange >= 0;

  // Ensure all 4 karats exist
  const allKarats: KaratPriceRecord[] = [24, 22, 21, 18].map((k) => {
    const found = prices.allKarats?.find((kp) => kp.karat === k);
    return found || { karat: k, sellPrice: null, buyPrice: null, sellWorkmanship: null, buyWorkmanship: null, changeAmount: null, changePercent: null };
  });

  return (
    <div className="space-y-3">
      {/* ─── Shared Refresh Bar ─── */}
      <div className="flex items-center justify-between flex-wrap gap-2 bg-gradient-to-r from-amber-50/80 to-yellow-50/80 dark:from-amber-950/20 dark:to-yellow-950/20 rounded-2xl px-3 sm:px-4 py-2.5 ring-1 ring-amber-200/40 dark:ring-amber-800/20">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-bold text-foreground">المصادر:</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 bg-white/80 dark:bg-background/60 px-2 py-0.5 rounded text-xs font-bold text-amber-700 dark:text-amber-400 ring-1 ring-amber-200/50 dark:ring-amber-800/30">
              <Gem className="w-3 h-3" />
              iSagha.com
            </span>
            <span className="inline-flex items-center gap-1 bg-white/80 dark:bg-background/60 px-2 py-0.5 rounded text-xs font-bold text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200/50 dark:ring-emerald-800/30">
              <DollarSign className="w-3 h-3" />
              {prices.usdEgp?.source || "Google Finance"}
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded">
            <Radio className="w-2.5 h-2.5 text-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">تحديث تلقائي كل دقيقة</span>
          </div>
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={onFetchPrices}
          disabled={fetching}
          className="gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white shadow-md shadow-amber-400/20 h-9 px-4 text-xs font-bold transition-all active:scale-95"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${fetching ? "animate-spin" : ""}`} />
          تحديث الأسعار
        </Button>
      </div>

      {/* ─── Section Header ─── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-lg shadow-amber-400/25">
            <Gem className="w-5 h-5 text-neutral-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-foreground">أسعار الذهب في مصر</h2>
              <div className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded">
                <Radio className="w-2.5 h-2.5 text-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">مباشر</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Gold Prices per Gram — EGP</p>
          </div>
        </div>
        {prices.gold && (
          <div className="hidden sm:flex items-center gap-1.5">
            <div className={`flex items-center gap-1 text-sm font-bold ${isGoldPositive ? "text-emerald-600" : "text-red-600"}`}>
              {isGoldPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span className="tabular-nums">{isGoldPositive ? "+" : ""}{goldChange.toFixed(2)}%</span>
            </div>
          </div>
        )}
      </div>

      {/* ─── 4 Individual Karat Cards with Workmanship ─── */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl bg-neutral-950 h-56 p-4 space-y-3 ring-1 ring-neutral-800">
              <div className="h-6 bg-neutral-800 rounded-lg w-20" />
              <div className="h-8 bg-neutral-800 rounded-lg w-full" />
              <div className="h-6 bg-neutral-800 rounded-lg w-full" />
              <div className="h-8 bg-neutral-800 rounded-lg w-full" />
              <div className="h-6 bg-neutral-800 rounded-lg w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {allKarats.map((kp, idx) => {
            const label = karatLabels[kp.karat];
            if (!label) return null;
            const isPositive = (kp.changeAmount ?? 0) >= 0;
            const hasChange = kp.changeAmount !== null && kp.changeAmount !== 0;
            return (
              <motion.div
                key={kp.karat}
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: idx * 0.06, type: "spring", stiffness: 200, damping: 20 }}
              >
                <Card className="rounded-2xl border-0 shadow-lg overflow-hidden bg-neutral-950 ring-1 ring-neutral-800 hover:ring-amber-400/30 transition-all duration-200 group">
                  {/* Gold accent line */}
                  <div className="h-1 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400" />

                  <CardContent className="p-3 sm:p-3.5 space-y-2">
                    {/* Karat badge */}
                    <div className="flex items-center justify-center">
                      <div className="bg-gradient-to-r from-amber-400 to-yellow-400 px-4 py-1 rounded-lg shadow-sm">
                        <span className="text-sm font-black text-neutral-950 tracking-wide">
                          {label}
                        </span>
                      </div>
                    </div>

                    {/* Sell price + workmanship */}
                    <div className="bg-neutral-900 rounded-xl p-2 ring-1 ring-neutral-800 group-hover:ring-emerald-500/20 transition-colors">
                      <div className="flex items-center gap-1 mb-1">
                        <ArrowRightLeft className="w-2.5 h-2.5 text-emerald-400" />
                        <span className="text-[10px] font-bold text-emerald-400">بيع</span>
                      </div>
                      <div className="flex items-baseline gap-1 justify-center">
                        <span className="text-base sm:text-lg font-black text-white tabular-nums tracking-tight">
                          {formatPrice(kp.sellPrice)}
                        </span>
                        <span className="text-[10px] text-neutral-500 font-bold">ج.م</span>
                      </div>

                    </div>

                    {/* Buy price + workmanship */}
                    <div className="bg-neutral-900 rounded-xl p-2 ring-1 ring-neutral-800 group-hover:ring-sky-500/20 transition-colors">
                      <div className="flex items-center gap-1 mb-1">
                        <ArrowDownUp className="w-2.5 h-2.5 text-sky-400" />
                        <span className="text-[10px] font-bold text-sky-400">شراء</span>
                      </div>
                      <div className="flex items-baseline gap-1 justify-center">
                        <span className="text-base sm:text-lg font-black text-white tabular-nums tracking-tight">
                          {formatPrice(kp.buyPrice)}
                        </span>
                        <span className="text-[10px] text-neutral-500 font-bold">ج.م</span>
                      </div>

                    </div>

                    {/* Change indicator */}
                    {hasChange && (
                      <div className={`flex items-center justify-center gap-1 rounded-lg py-1 px-2 ${
                        isPositive 
                          ? "bg-emerald-950/30 text-emerald-400" 
                          : "bg-red-950/30 text-red-400"
                      }`}>
                        {isPositive ? (
                          <TrendingUp className="w-2.5 h-2.5" />
                        ) : (
                          <TrendingDown className="w-2.5 h-2.5" />
                        )}
                        <span className="text-[10px] font-black tabular-nums">
                          {isPositive ? "+" : ""}{formatPrice(kp.changeAmount, 2)}
                        </span>
                        <span className="text-[10px] font-bold tabular-nums">
                          ({isPositive ? "+" : ""}{kp.changePercent?.toFixed(2)}%)
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ─── Gold Pound Card ─── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 20 }}
      >
        <Card className="rounded-2xl border-0 shadow-lg overflow-hidden bg-neutral-950 ring-1 ring-neutral-800 hover:ring-amber-400/30 transition-all duration-200 group">
          <div className="h-1 bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300" />
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="bg-gradient-to-r from-amber-400 to-yellow-400 px-4 py-1.5 rounded-lg shadow-sm flex items-center gap-2">
                <Coins className="w-4 h-4 text-neutral-950" />
                <span className="text-sm font-black text-neutral-950 tracking-wide">جنيه الذهب</span>
              </div>
            </div>

            {prices.goldPound && (prices.goldPound.sellPrice || prices.goldPound.buyPrice) ? (
              <div className="grid grid-cols-2 gap-3">
                {/* Sell */}
                <div className="bg-neutral-900 rounded-xl p-2.5 ring-1 ring-neutral-800 group-hover:ring-emerald-500/20 transition-colors">
                  <div className="flex items-center gap-1 mb-1.5">
                    <ArrowRightLeft className="w-3 h-3 text-emerald-400" />
                    <span className="text-[11px] font-bold text-emerald-400">بيع</span>
                  </div>
                  <div className="flex items-baseline gap-1.5 justify-center">
                    <span className="text-lg sm:text-xl font-black text-white tabular-nums tracking-tight">
                      {formatPrice(prices.goldPound.sellPrice)}
                    </span>
                    <span className="text-[11px] text-neutral-500 font-bold">ج.م</span>
                  </div>

                </div>

                {/* Buy */}
                <div className="bg-neutral-900 rounded-xl p-2.5 ring-1 ring-neutral-800 group-hover:ring-sky-500/20 transition-colors">
                  <div className="flex items-center gap-1 mb-1.5">
                    <ArrowDownUp className="w-3 h-3 text-sky-400" />
                    <span className="text-[11px] font-bold text-sky-400">شراء</span>
                  </div>
                  <div className="flex items-baseline gap-1.5 justify-center">
                    <span className="text-lg sm:text-xl font-black text-white tabular-nums tracking-tight">
                      {formatPrice(prices.goldPound.buyPrice)}
                    </span>
                    <span className="text-[11px] text-neutral-500 font-bold">ج.م</span>
                  </div>

                </div>
              </div>
            ) : (
              <div className="py-4 text-center">
                <p className="text-neutral-500 text-xs">لا توجد بيانات جنيه الذهب</p>
              </div>
            )}

            {/* Change indicator for gold pound */}
            {prices.goldPound && prices.goldPound.changeAmount !== null && prices.goldPound.changeAmount !== 0 && (
              <div className={`flex items-center justify-center gap-1 mt-2 rounded-lg py-1 px-2 ${
                (prices.goldPound.changeAmount ?? 0) >= 0
                  ? "bg-emerald-950/30 text-emerald-400"
                  : "bg-red-950/30 text-red-400"
              }`}>
                {(prices.goldPound.changeAmount ?? 0) >= 0 ? (
                  <TrendingUp className="w-2.5 h-2.5" />
                ) : (
                  <TrendingDown className="w-2.5 h-2.5" />
                )}
                <span className="text-[10px] font-black tabular-nums">
                  {(prices.goldPound.changeAmount ?? 0) >= 0 ? "+" : ""}{formatPrice(prices.goldPound.changeAmount, 2)}
                </span>
                <span className="text-[10px] font-bold tabular-nums">
                  ({(prices.goldPound.changeAmount ?? 0) >= 0 ? "+" : ""}{prices.goldPound.changePercent?.toFixed(2)}%)
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ─── Footer: timestamp ─── */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          {prices.gold ? (
            <span>
              آخر تحديث:{" "}
              {new Date(prices.gold.createdAt).toLocaleString("ar-EG", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          ) : (
            <span>في انتظار البيانات...</span>
          )}
          {prices.gold?.source && (
            <>
              <span className="text-border/60">•</span>
              <span>{prices.gold.source}</span>
            </>
          )}
        </div>
        {fetching && (
          <span className="text-amber-600 dark:text-amber-400 font-bold animate-pulse flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin" />
            جارِ التحديث...
          </span>
        )}
      </div>

      {/* ─── USD/EGP Card ─── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, type: "spring", stiffness: 200, damping: 20 }}
      >
        <Card className="rounded-2xl border-0 shadow-lg ring-1 ring-border/20 overflow-hidden group hover:shadow-xl transition-shadow duration-300">
          <div
            className={`h-1.5 ${
              prices.usdEgp
                ? isUsdPositive
                  ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
                  : "bg-gradient-to-r from-red-400 to-red-500"
                : "bg-muted"
            }`}
          />
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-100 to-green-100 dark:from-emerald-900/30 dark:to-green-900/30 flex items-center justify-center shadow-sm">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-foreground">USD/EGP</h3>
                    <div className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded">
                      <Radio className="w-2.5 h-2.5 text-emerald-500 animate-pulse" />
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">مباشر</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">سعر الدولار مقابل الجنيه المصري</p>
                </div>
              </div>
            </div>

            {prices.usdEgp ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-black tracking-tight text-foreground tabular-nums">
                    {prices.usdEgp.price.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span className="text-sm font-bold text-muted-foreground">
                    {prices.usdEgp.currency}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div
                    className={`flex items-center gap-1 text-sm font-bold ${
                      isUsdPositive ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {isUsdPositive ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    <span className="tabular-nums">
                      {isUsdPositive ? "+" : ""}
                      {usdChange.toFixed(2)}%
                    </span>
                  </div>
                  {prices.usdEgp.source && (
                    <span className="text-xs text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-md">
                      {prices.usdEgp.source}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-border/30">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    آخر تحديث:{" "}
                    {new Date(prices.usdEgp.createdAt).toLocaleString("ar-EG", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </p>
                  {fetching && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-bold animate-pulse mr-auto flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      جارِ التحديث...
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="py-4 text-center">
                <p className="text-muted-foreground text-sm">لا توجد بيانات متاحة</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
