"use client";

import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  DollarSign,
  Gem,
  ArrowRightLeft,
  ArrowDownUp,
  Radio,
  Clock,
  Globe,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PriceRecord, KaratPriceRecord } from "@/lib/dashboard-types";

// Karat display config
const karatConfig: Record<number, {
  label: string;
  badgeBg: string;
  badgeText: string;
  accentLine: string;
  cardShadow: string;
  sellBg: string;
  buyBg: string;
  sellIcon: string;
  buyIcon: string;
  number: string;
}> = {
  24: {
    label: "عيار ٢٤",
    badgeBg: "bg-gradient-to-r from-amber-400 to-yellow-300",
    badgeText: "text-amber-900",
    accentLine: "from-amber-400 via-yellow-300 to-amber-400",
    cardShadow: "shadow-amber-200/30 dark:shadow-amber-900/10",
    sellBg: "bg-emerald-50 dark:bg-emerald-950/30",
    buyBg: "bg-sky-50 dark:bg-sky-950/30",
    sellIcon: "text-emerald-600 dark:text-emerald-400",
    buyIcon: "text-sky-600 dark:text-sky-400",
    number: "text-amber-700 dark:text-amber-300",
  },
  22: {
    label: "عيار ٢٢",
    badgeBg: "bg-gradient-to-r from-orange-400 to-amber-300",
    badgeText: "text-orange-900",
    accentLine: "from-orange-400 via-amber-300 to-orange-400",
    cardShadow: "shadow-orange-200/30 dark:shadow-orange-900/10",
    sellBg: "bg-emerald-50 dark:bg-emerald-950/30",
    buyBg: "bg-sky-50 dark:bg-sky-950/30",
    sellIcon: "text-emerald-600 dark:text-emerald-400",
    buyIcon: "text-sky-600 dark:text-sky-400",
    number: "text-orange-700 dark:text-orange-300",
  },
  21: {
    label: "عيار ٢١",
    badgeBg: "bg-gradient-to-r from-yellow-500 to-amber-400",
    badgeText: "text-yellow-950",
    accentLine: "from-yellow-500 via-amber-400 to-yellow-500",
    cardShadow: "shadow-yellow-200/30 dark:shadow-yellow-900/10",
    sellBg: "bg-emerald-50 dark:bg-emerald-950/30",
    buyBg: "bg-sky-50 dark:bg-sky-950/30",
    sellIcon: "text-emerald-600 dark:text-emerald-400",
    buyIcon: "text-sky-600 dark:text-sky-400",
    number: "text-yellow-700 dark:text-yellow-300",
  },
  18: {
    label: "عيار ١٨",
    badgeBg: "bg-gradient-to-r from-rose-400 to-pink-300",
    badgeText: "text-rose-900",
    accentLine: "from-rose-400 via-pink-300 to-rose-400",
    cardShadow: "shadow-rose-200/30 dark:shadow-rose-900/10",
    sellBg: "bg-emerald-50 dark:bg-emerald-950/30",
    buyBg: "bg-sky-50 dark:bg-sky-950/30",
    sellIcon: "text-emerald-600 dark:text-emerald-400",
    buyIcon: "text-sky-600 dark:text-sky-400",
    number: "text-rose-700 dark:text-rose-300",
  },
};

function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return "—";
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

interface KaratCardProps {
  karatPrice: KaratPriceRecord;
  goldPrice: PriceRecord | null;
  loading: boolean;
  fetching: boolean;
  idx: number;
}

function KaratCard({ karatPrice, goldPrice, loading, fetching, idx }: KaratCardProps) {
  const config = karatConfig[karatPrice.karat];
  if (!config) return null;

  const change = goldPrice?.change ?? 0;
  const isPositive = change >= 0;

  if (loading) {
    return (
      <Card className="rounded-2xl border-0 shadow-md ring-1 ring-border/30 overflow-hidden">
        <CardContent className="p-3 space-y-2">
          <Skeleton className="h-5 w-16 rounded-lg mx-auto" />
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: idx * 0.06, type: "spring", stiffness: 200, damping: 20 }}
    >
      <Card className={`rounded-2xl border-0 shadow-lg ${config.cardShadow} ring-1 ring-border/20 overflow-hidden group hover:shadow-xl transition-shadow duration-300`}>
        <div className={`h-1 bg-gradient-to-r ${config.accentLine}`} />
        <CardContent className="p-3 space-y-2">
          {/* Karat badge */}
          <div className="flex items-center justify-center">
            <div className={`${config.badgeBg} px-3 py-0.5 rounded-lg shadow-sm`}>
              <span className={`text-xs font-black ${config.badgeText} tracking-wide`}>
                {config.label}
              </span>
            </div>
          </div>

          {/* Sell / Buy prices */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className={`${config.sellBg} rounded-lg p-2 ring-1 ring-emerald-200/50 dark:ring-emerald-800/30`}>
              <div className="flex items-center gap-1 mb-0.5">
                <ArrowRightLeft className={`w-3 h-3 ${config.sellIcon}`} />
                <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">بيع</span>
              </div>
              <p className="text-sm sm:text-base font-black tracking-tight text-foreground tabular-nums">
                {formatPrice(karatPrice.sellPrice)}
              </p>
            </div>
            <div className={`${config.buyBg} rounded-lg p-2 ring-1 ring-sky-200/50 dark:ring-sky-800/30`}>
              <div className="flex items-center gap-1 mb-0.5">
                <ArrowDownUp className={`w-3 h-3 ${config.buyIcon}`} />
                <span className="text-[11px] font-bold text-sky-700 dark:text-sky-400">شراء</span>
              </div>
              <p className="text-sm sm:text-base font-black tracking-tight text-foreground tabular-nums">
                {formatPrice(karatPrice.buyPrice)}
              </p>
            </div>
          </div>

          {/* Change indicator + update status */}
          <div className="flex items-center justify-between pt-0.5">
            <div
              className={`flex items-center gap-0.5 text-[11px] font-bold ${
                isPositive ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {isPositive ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              <span className="tabular-nums">
                {isPositive ? "+" : ""}{change.toFixed(2)}%
              </span>
            </div>
            {fetching && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold animate-pulse">
                تحديث...
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

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

  // Ensure all 4 karats exist in the data, fill missing with nulls
  const allKarats: KaratPriceRecord[] = [24, 22, 21, 18].map((k) => {
    const found = prices.allKarats?.find((kp) => kp.karat === k);
    return found || { karat: k, sellPrice: null, buyPrice: null };
  });

  return (
    <div className="space-y-3">
      {/* Shared Refresh Bar */}
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
          <RefreshCw
            className={`w-3.5 h-3.5 ${fetching ? "animate-spin" : ""}`}
          />
          تحديث الأسعار
        </Button>
      </div>

      {/* Gold Karats Grid - All 4 karats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {allKarats.map((kp, idx) => (
          <KaratCard
            key={kp.karat}
            karatPrice={kp}
            goldPrice={prices.gold}
            loading={loading}
            fetching={fetching}
            idx={idx}
          />
        ))}
      </div>

      {/* USD/EGP Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card className="rounded-2xl border-0 shadow-lg ring-1 ring-border/20 overflow-hidden group hover:shadow-xl transition-shadow duration-300">
          <div
            className={`h-1 ${
              prices.usdEgp
                ? isUsdPositive
                  ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
                  : "bg-gradient-to-r from-red-400 to-red-500"
                : "bg-muted"
            }`}
          />
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-100 to-green-100 dark:from-emerald-900/30 dark:to-green-900/30 flex items-center justify-center shadow-sm">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-bold text-foreground">USD/EGP</h3>
                    <div className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded">
                      <Radio className="w-2.5 h-2.5 text-emerald-500 animate-pulse" />
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">مباشر</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">سعر الدولار مقابل الجنيه</p>
                </div>
              </div>
            </div>

            {prices.usdEgp ? (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black tracking-tight text-foreground tabular-nums">
                    {prices.usdEgp.price.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span className="text-sm font-bold text-muted-foreground">
                    {prices.usdEgp.currency}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <div
                    className={`flex items-center gap-1 text-xs font-bold ${
                      isUsdPositive ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {isUsdPositive ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    <span className="tabular-nums">
                      {isUsdPositive ? "+" : ""}
                      {usdChange.toFixed(2)}%
                    </span>
                  </div>
                  {prices.usdEgp.source && (
                    <span className="text-xs text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                      {prices.usdEgp.source}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-border/30">
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
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-bold animate-pulse mr-auto">
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

      {/* Last update info for gold prices */}
      {prices.gold && (
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>
            آخر تحديث للذهب:{" "}
            {new Date(prices.gold.createdAt).toLocaleString("ar-EG", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
          {prices.gold.source && (
            <>
              <span>•</span>
              <span>المصدر: {prices.gold.source}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
