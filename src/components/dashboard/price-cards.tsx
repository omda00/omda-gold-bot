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
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PriceRecord, KaratPriceRecord } from "@/lib/dashboard-types";

function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return "—";
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

// Karat row styling config
const karatStyles: Record<number, {
  label: string;
  dotColor: string;
  accentBg: string;
  accentText: string;
  badgeBg: string;
  highlight: string;
}> = {
  24: {
    label: "عيار ٢٤",
    dotColor: "bg-amber-400",
    accentBg: "bg-amber-50 dark:bg-amber-950/20",
    accentText: "text-amber-700 dark:text-amber-300",
    badgeBg: "bg-amber-100 dark:bg-amber-900/40",
    highlight: "ring-amber-300/50 dark:ring-amber-700/40",
  },
  22: {
    label: "عيار ٢٢",
    dotColor: "bg-orange-400",
    accentBg: "bg-orange-50 dark:bg-orange-950/20",
    accentText: "text-orange-700 dark:text-orange-300",
    badgeBg: "bg-orange-100 dark:bg-orange-900/40",
    highlight: "ring-orange-300/50 dark:ring-orange-700/40",
  },
  21: {
    label: "عيار ٢١",
    dotColor: "bg-yellow-500",
    accentBg: "bg-yellow-50 dark:bg-yellow-950/20",
    accentText: "text-yellow-700 dark:text-yellow-300",
    badgeBg: "bg-yellow-100 dark:bg-yellow-900/40",
    highlight: "ring-yellow-300/50 dark:ring-yellow-700/40",
  },
  18: {
    label: "عيار ١٨",
    dotColor: "bg-rose-400",
    accentBg: "bg-rose-50 dark:bg-rose-950/20",
    accentText: "text-rose-700 dark:text-rose-300",
    badgeBg: "bg-rose-100 dark:bg-rose-900/40",
    highlight: "ring-rose-300/50 dark:ring-rose-700/40",
  },
};

interface PriceCardsProps {
  prices: { gold: PriceRecord | null; usdEgp: PriceRecord | null; allKarats: KaratPriceRecord[] };
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
    return found || { karat: k, sellPrice: null, buyPrice: null };
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

      {/* ─── UNIFIED GOLD PRICES PANEL ─── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
      >
        <Card className="rounded-2xl border-0 shadow-xl ring-1 ring-amber-200/40 dark:ring-amber-800/20 overflow-hidden">
          {/* Top gradient accent */}
          <div className="h-1.5 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500" />

          {/* Header */}
          <div className="bg-gradient-to-r from-amber-50/90 to-yellow-50/90 dark:from-amber-950/25 dark:to-yellow-950/25 px-4 sm:px-5 py-3 border-b border-amber-200/30 dark:border-amber-800/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-lg shadow-amber-400/25">
                  <Gem className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-black text-foreground">أسعار الذهب في مصر</h2>
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
          </div>

          <CardContent className="p-0">
            {/* ─── Karat Price Rows ─── */}
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-6 w-16 rounded-lg" />
                    <Skeleton className="h-8 flex-1 rounded-lg" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-border/20">
                {allKarats.map((kp, idx) => {
                  const style = karatStyles[kp.karat];
                  if (!style) return null;
                  return (
                    <motion.div
                      key={kp.karat}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.07, type: "spring", stiffness: 180, damping: 18 }}
                      className={`group hover:${style.accentBg} transition-colors duration-200`}
                    >
                      <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-5 py-3">
                        {/* Karat badge */}
                        <div className="flex items-center gap-2 min-w-[70px] sm:min-w-[80px]">
                          <span className={`w-2.5 h-2.5 rounded-full ${style.dotColor} shadow-sm ring-2 ring-white dark:ring-background`} />
                          <span className={`text-xs sm:text-sm font-black ${style.accentText}`}>
                            {style.label}
                          </span>
                        </div>

                        {/* Sell price */}
                        <div className="flex-1 flex items-center justify-end gap-1.5">
                          <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <ArrowRightLeft className="w-3 h-3 hidden sm:block" />
                            <span className="text-[10px] sm:text-xs font-bold">بيع</span>
                          </div>
                          <div className={`${style.badgeBg} rounded-lg px-2.5 sm:px-3 py-1.5 ring-1 ${style.highlight}`}>
                            <span className="text-sm sm:text-base font-black text-foreground tabular-nums">
                              {formatPrice(kp.sellPrice)}
                            </span>
                          </div>
                        </div>

                        {/* Separator dot */}
                        <div className="w-1 h-1 rounded-full bg-border/40 flex-shrink-0" />

                        {/* Buy price */}
                        <div className="flex-1 flex items-center gap-1.5">
                          <div className={`${style.badgeBg} rounded-lg px-2.5 sm:px-3 py-1.5 ring-1 ring-sky-200/40 dark:ring-sky-800/30`}>
                            <span className="text-sm sm:text-base font-black text-foreground tabular-nums">
                              {formatPrice(kp.buyPrice)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
                            <span className="text-[10px] sm:text-xs font-bold">شراء</span>
                            <ArrowDownUp className="w-3 h-3 hidden sm:block" />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* ─── Column headers (subtle) ─── */}
            {!loading && (
              <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-5 py-1.5 bg-muted/20 border-t border-border/10">
                <div className="min-w-[70px] sm:min-w-[80px]" />
                <div className="flex-1 text-center">
                  <span className="text-[10px] font-bold text-emerald-600/60 dark:text-emerald-400/60 tracking-wider uppercase">Sell · بيع</span>
                </div>
                <div className="w-1" />
                <div className="flex-1 text-center">
                  <span className="text-[10px] font-bold text-sky-600/60 dark:text-sky-400/60 tracking-wider uppercase">Buy · شراء</span>
                </div>
              </div>
            )}

            {/* ─── Footer: timestamp + update status ─── */}
            <div className="flex items-center justify-between flex-wrap gap-2 px-4 sm:px-5 py-2.5 bg-muted/10 border-t border-border/10">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
                <span className="text-xs text-amber-600 dark:text-amber-400 font-bold animate-pulse flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  جارِ التحديث...
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

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
