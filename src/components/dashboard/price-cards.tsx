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
import type { PriceRecord } from "@/lib/dashboard-types";

interface PriceCardProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  price: PriceRecord | null;
  loading: boolean;
  fetching: boolean;
}

function PriceCard({
  title,
  subtitle,
  icon,
  price,
  loading,
  fetching,
}: PriceCardProps) {
  const change = price?.change ?? 0;
  const isPositive = change >= 0;
  const hasBuySell = price?.buyPrice && price?.sellPrice;

  if (loading) {
    return (
      <Card className="rounded-2xl border-0 shadow-md ring-1 ring-border/30 overflow-hidden">
        <CardContent className="p-5 space-y-4">
          <Skeleton className="h-5 w-28 rounded-lg" />
          <Skeleton className="h-12 w-36 rounded-lg" />
          <Skeleton className="h-5 w-24 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <Card className="rounded-2xl border-0 shadow-xl ring-1 ring-border/20 overflow-hidden group hover:shadow-2xl transition-all duration-300">
        {/* Top accent bar */}
        <div
          className={`h-1.5 ${
            price
              ? isPositive
                ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
                : "bg-gradient-to-r from-red-400 to-red-500"
              : "bg-muted"
          }`}
        />
        <CardContent className="p-5">
          {/* Header row */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-100 to-yellow-100 dark:from-amber-900/30 dark:to-yellow-900/30 flex items-center justify-center shadow-sm">
                {icon}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground">{title}</h3>
                  <div className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-lg">
                    <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">مباشر</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              </div>
            </div>
          </div>

          {price ? (
            <>
              {hasBuySell ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-emerald-50/80 dark:bg-emerald-950/30 rounded-xl p-4 ring-1 ring-emerald-200/50 dark:ring-emerald-800/30">
                      <div className="flex items-center gap-2 mb-2">
                        <ArrowRightLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">بيع</span>
                      </div>
                      <p className="text-2xl sm:text-3xl font-black tracking-tight text-foreground tabular-nums">
                        {price.sellPrice?.toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
                      </p>
                      <span className="text-sm font-semibold text-muted-foreground">ج.م/جرام</span>
                    </div>
                    <div className="bg-sky-50/80 dark:bg-sky-950/30 rounded-xl p-4 ring-1 ring-sky-200/50 dark:ring-sky-800/30">
                      <div className="flex items-center gap-2 mb-2">
                        <ArrowDownUp className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                        <span className="text-base font-bold text-sky-700 dark:text-sky-400">شراء</span>
                      </div>
                      <p className="text-2xl sm:text-3xl font-black tracking-tight text-foreground tabular-nums">
                        {price.buyPrice?.toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
                      </p>
                      <span className="text-sm font-semibold text-muted-foreground">ج.م/جرام</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-sm text-muted-foreground font-medium">EGP/جرام</span>
                    <div
                      className={`flex items-center gap-1.5 text-sm font-bold ${
                        isPositive ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {isPositive ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <TrendingDown className="w-4 h-4" />
                      )}
                      <span className="tabular-nums">
                        {isPositive ? "+" : ""}
                        {change.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black tracking-tight text-foreground tabular-nums">
                      {price.price.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="text-base font-bold text-muted-foreground">
                      {price.currency}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <div
                      className={`flex items-center gap-1.5 text-sm font-bold ${
                        isPositive ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {isPositive ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <TrendingDown className="w-4 h-4" />
                      )}
                      <span className="tabular-nums">
                        {isPositive ? "+" : ""}
                        {change.toFixed(2)}%
                      </span>
                    </div>
                    {price.source && (
                      <span className="text-xs text-muted-foreground bg-muted/40 px-2 py-1 rounded-lg">
                        {price.source}
                      </span>
                    )}
                  </div>
                </>
              )}
              <div className="flex items-center gap-2 mt-4 pt-2 border-t border-border/30">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  آخر تحديث:{" "}
                  {new Date(price.createdAt).toLocaleString("ar-EG", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                  {price.source && hasBuySell && (
                    <span className="mr-1">• {price.source}</span>
                  )}
                </p>
                {fetching && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-bold animate-pulse mr-auto">
                    جارِ التحديث...
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="py-8 text-center">
              <p className="text-muted-foreground text-base">لا توجد بيانات متاحة</p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface PriceCardsProps {
  prices: { gold: PriceRecord | null; usdEgp: PriceRecord | null };
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
  return (
    <div className="space-y-3">
      {/* Shared Refresh Bar */}
      <div className="flex items-center justify-between bg-gradient-to-r from-amber-50/80 to-yellow-50/80 dark:from-amber-950/20 dark:to-yellow-950/20 rounded-2xl px-4 py-3 ring-1 ring-amber-200/40 dark:ring-amber-800/20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-bold text-foreground">المصادر:</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 bg-white/80 dark:bg-background/60 px-2.5 py-1 rounded-lg text-xs font-bold text-amber-700 dark:text-amber-400 ring-1 ring-amber-200/50 dark:ring-amber-800/30">
              <Gem className="w-3 h-3" />
              iSagha.com
            </span>
            <span className="inline-flex items-center gap-1 bg-white/80 dark:bg-background/60 px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200/50 dark:ring-emerald-800/30">
              <DollarSign className="w-3 h-3" />
              Google Finance
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-lg">
            <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">تحديث تلقائي كل ثانية</span>
          </div>
        </div>
        <Button
          variant="default"
          size="default"
          onClick={onFetchPrices}
          disabled={fetching}
          className="gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white shadow-lg shadow-amber-400/25 h-10 px-5 text-sm font-bold transition-all active:scale-95"
        >
          <RefreshCw
            className={`w-4 h-4 ${fetching ? "animate-spin" : ""}`}
          />
          تحديث الأسعار
        </Button>
      </div>

      {/* Price Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PriceCard
          title="Gold 21K"
          subtitle="ذهب عيار ٢١ في مصر"
          icon={<Gem className="w-5 h-5 text-amber-600" />}
          price={prices.gold}
          loading={loading}
          fetching={fetching}
        />
        <PriceCard
          title="USD/EGP"
          subtitle="سعر الدولار مقابل الجنيه"
          icon={<DollarSign className="w-5 h-5 text-emerald-600" />}
          price={prices.usdEgp}
          loading={loading}
          fetching={fetching}
        />
      </div>
    </div>
  );
}
