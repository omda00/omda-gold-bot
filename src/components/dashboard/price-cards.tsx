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

const karatLabels: Record<number, string> = {
  24: "عيار ٢٤",
  22: "عيار ٢٢",
  21: "عيار ٢١",
  18: "عيار ١٨",
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
        <Card className="rounded-2xl border-0 shadow-xl overflow-hidden bg-neutral-950 dark:bg-neutral-950 ring-1 ring-neutral-800">
          {/* Top gold accent line */}
          <div className="h-1 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400" />

          {/* Header */}
          <div className="px-4 sm:px-6 py-4 border-b border-neutral-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-lg shadow-amber-400/30">
                  <Gem className="w-6 h-6 text-neutral-950" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-black text-white">أسعار الذهب في مصر</h2>
                    <div className="flex items-center gap-1 bg-amber-400/10 px-1.5 py-0.5 rounded">
                      <Radio className="w-2.5 h-2.5 text-amber-400 animate-pulse" />
                      <span className="text-[10px] font-bold text-amber-400">مباشر</span>
                    </div>
                  </div>
                  <p className="text-xs text-neutral-500">Gold Prices per Gram — EGP</p>
                </div>
              </div>
              {prices.gold && (
                <div className="hidden sm:flex items-center gap-1.5">
                  <div className={`flex items-center gap-1 text-sm font-bold ${isGoldPositive ? "text-emerald-400" : "text-red-400"}`}>
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
              <div className="p-5 space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-8 w-24 rounded-lg bg-neutral-800" />
                    <Skeleton className="h-10 flex-1 rounded-lg bg-neutral-800" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-neutral-800/60">
                {allKarats.map((kp, idx) => {
                  const label = karatLabels[kp.karat];
                  if (!label) return null;
                  return (
                    <motion.div
                      key={kp.karat}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.07, type: "spring", stiffness: 180, damping: 18 }}
                      className="group hover:bg-neutral-900/60 transition-colors duration-200"
                    >
                      <div className="flex items-center gap-3 sm:gap-5 px-4 sm:px-6 py-4 sm:py-5">
                        {/* Karat label */}
                        <div className="min-w-[90px] sm:min-w-[110px]">
                          <span className="text-lg sm:text-xl font-black text-white tracking-tight">
                            {label}
                          </span>
                        </div>

                        {/* Sell price */}
                        <div className="flex-1 flex items-center justify-end gap-2 sm:gap-3">
                          <div className="flex items-center gap-1.5 text-emerald-400">
                            <ArrowRightLeft className="w-3.5 h-3.5 hidden sm:block" />
                            <span className="text-xs sm:text-sm font-bold">بيع</span>
                          </div>
                          <div className="bg-neutral-900 rounded-xl px-3 sm:px-4 py-2 ring-1 ring-neutral-700/60">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-lg sm:text-2xl font-black text-white tabular-nums tracking-tight">
                                {formatPrice(kp.sellPrice)}
                              </span>
                              <span className="text-xs sm:text-sm text-neutral-500 font-bold">ج.م</span>
                            </div>
                          </div>
                        </div>

                        {/* Separator */}
                        <div className="w-px h-8 bg-neutral-800 flex-shrink-0" />

                        {/* Buy price */}
                        <div className="flex-1 flex items-center gap-2 sm:gap-3">
                          <div className="bg-neutral-900 rounded-xl px-3 sm:px-4 py-2 ring-1 ring-neutral-700/60">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-lg sm:text-2xl font-black text-white tabular-nums tracking-tight">
                                {formatPrice(kp.buyPrice)}
                              </span>
                              <span className="text-xs sm:text-sm text-neutral-500 font-bold">ج.م</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 text-sky-400">
                            <span className="text-xs sm:text-sm font-bold">شراء</span>
                            <ArrowDownUp className="w-3.5 h-3.5 hidden sm:block" />
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
              <div className="flex items-center gap-3 sm:gap-5 px-4 sm:px-6 py-2 border-t border-neutral-800/60 bg-neutral-900/40">
                <div className="min-w-[90px] sm:min-w-[110px]" />
                <div className="flex-1 text-center">
                  <span className="text-[10px] font-bold text-emerald-400/50 tracking-widest uppercase">Sell · بيع</span>
                </div>
                <div className="w-px" />
                <div className="flex-1 text-center">
                  <span className="text-[10px] font-bold text-sky-400/50 tracking-widest uppercase">Buy · شراء</span>
                </div>
              </div>
            )}

            {/* ─── Footer: timestamp + update status ─── */}
            <div className="flex items-center justify-between flex-wrap gap-2 px-4 sm:px-6 py-3 border-t border-neutral-800/60 bg-neutral-900/30">
              <div className="flex items-center gap-1.5 text-xs text-neutral-500">
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
                    <span className="text-neutral-700">•</span>
                    <span>{prices.gold.source}</span>
                  </>
                )}
              </div>
              {fetching && (
                <span className="text-xs text-amber-400 font-bold animate-pulse flex items-center gap-1">
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
