"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calculator,
  RefreshCw,
  Coins,
  CircleDollarSign,
  ArrowDownUp,
  ArrowRightLeft,
  Timer,
  Radio,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { CalculatorPriceResult } from "@/lib/dashboard-types";

interface GoldCalculatorProps {
  calculatorData: CalculatorPriceResult | null;
  loading: boolean;
  onFetch: () => Promise<CalculatorPriceResult | null>;
}

function formatPrice(price: number | null): string {
  if (price === null) return "—";
  return price.toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Modern color themes for each karat
const karatThemes: Record<number, {
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  cardGlow: string;
  sellBg: string;
  buyBg: string;
  sellIcon: string;
  buyIcon: string;
  accentLine: string;
  label: string;
  number: string;
}> = {
  24: {
    badgeBg: "bg-gradient-to-r from-amber-400 to-yellow-300",
    badgeText: "text-amber-900",
    badgeBorder: "border-amber-300",
    cardGlow: "shadow-amber-200/40 dark:shadow-amber-900/20",
    sellBg: "bg-emerald-50 dark:bg-emerald-950/30",
    buyBg: "bg-sky-50 dark:bg-sky-950/30",
    sellIcon: "text-emerald-600 dark:text-emerald-400",
    buyIcon: "text-sky-600 dark:text-sky-400",
    accentLine: "from-amber-400 via-yellow-300 to-amber-400",
    label: "عيار ٢٤",
    number: "text-amber-700 dark:text-amber-300",
  },
  22: {
    badgeBg: "bg-gradient-to-r from-orange-400 to-amber-300",
    badgeText: "text-orange-900",
    badgeBorder: "border-orange-300",
    cardGlow: "shadow-orange-200/40 dark:shadow-orange-900/20",
    sellBg: "bg-emerald-50 dark:bg-emerald-950/30",
    buyBg: "bg-sky-50 dark:bg-sky-950/30",
    sellIcon: "text-emerald-600 dark:text-emerald-400",
    buyIcon: "text-sky-600 dark:text-sky-400",
    accentLine: "from-orange-400 via-amber-300 to-orange-400",
    label: "عيار ٢٢",
    number: "text-orange-700 dark:text-orange-300",
  },
  21: {
    badgeBg: "bg-gradient-to-r from-yellow-500 to-amber-400",
    badgeText: "text-yellow-950",
    badgeBorder: "border-yellow-400",
    cardGlow: "shadow-yellow-200/40 dark:shadow-yellow-900/20",
    sellBg: "bg-emerald-50 dark:bg-emerald-950/30",
    buyBg: "bg-sky-50 dark:bg-sky-950/30",
    sellIcon: "text-emerald-600 dark:text-emerald-400",
    buyIcon: "text-sky-600 dark:text-sky-400",
    accentLine: "from-yellow-500 via-amber-400 to-yellow-500",
    label: "عيار ٢١",
    number: "text-yellow-700 dark:text-yellow-300",
  },
  18: {
    badgeBg: "bg-gradient-to-r from-rose-400 to-pink-300",
    badgeText: "text-rose-900",
    badgeBorder: "border-rose-300",
    cardGlow: "shadow-rose-200/40 dark:shadow-rose-900/20",
    sellBg: "bg-emerald-50 dark:bg-emerald-950/30",
    buyBg: "bg-sky-50 dark:bg-sky-950/30",
    sellIcon: "text-emerald-600 dark:text-emerald-400",
    buyIcon: "text-sky-600 dark:text-sky-400",
    accentLine: "from-rose-400 via-pink-300 to-rose-400",
    label: "عيار ١٨",
    number: "text-rose-700 dark:text-rose-300",
  },
};

const AUTO_REFRESH_INTERVAL = 30000;

export function GoldCalculator({ calculatorData, loading, onFetch }: GoldCalculatorProps) {
  const [fetching, setFetching] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_REFRESH_INTERVAL / 1000);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [calcKarat, setCalcKarat] = useState<string>("21");
  const [calcGrams, setCalcGrams] = useState<string>("");
  const [calcType, setCalcType] = useState<string>("sell");
  const [poundCount, setPoundCount] = useState<string>("");

  const handleFetch = useCallback(async () => {
    setFetching(true);
    try {
      await onFetch();
      setCountdown(AUTO_REFRESH_INTERVAL / 1000);
    } finally {
      setFetching(false);
    }
  }, [onFetch]);

  useEffect(() => {
    handleFetch();
    autoRefreshRef.current = setInterval(() => { handleFetch(); }, AUTO_REFRESH_INTERVAL);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => { if (prev <= 1) return AUTO_REFRESH_INTERVAL / 1000; return prev - 1; });
    }, 1000);
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [handleFetch]);

  const getCalcResult = useCallback((): { total: number } | null => {
    if (!calculatorData || !calcGrams) return null;
    const grams = parseFloat(calcGrams);
    if (isNaN(grams) || grams <= 0) return null;
    const karat = parseInt(calcKarat);
    const karatPrice = calculatorData.karats.find((k) => k.karat === karat);
    if (!karatPrice) return null;
    const pricePerGram = calcType === "sell" ? karatPrice.sellPrice : karatPrice.buyPrice;
    if (!pricePerGram) return null;
    return { total: pricePerGram * grams };
  }, [calculatorData, calcKarat, calcGrams, calcType]);

  const calcResult = getCalcResult();

  const getPoundResult = useCallback((): { total: number } | null => {
    if (!calculatorData || !poundCount) return null;
    const count = parseFloat(poundCount);
    if (isNaN(count) || count <= 0) return null;
    const gp = calculatorData.goldPound;
    const price = calcType === "sell" ? gp.sellPrice : gp.buyPrice;
    if (!price) return null;
    return { total: price * count };
  }, [calculatorData, poundCount, calcType]);

  const poundResult = getPoundResult();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 shadow-md shadow-amber-400/25">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black bg-gradient-to-r from-amber-600 to-yellow-600 bg-clip-text text-transparent">
              حاسبة الذهب
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              {calculatorData?.source && (
                <span className="text-xs text-muted-foreground">الأسعار من {calculatorData.source}</span>
              )}
              <div className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded">
                <Radio className="w-2.5 h-2.5 text-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">مباشر</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-muted/40 px-2.5 py-1 rounded-lg">
            <Timer className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs font-mono font-bold text-muted-foreground tabular-nums">
              {countdown}s
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleFetch}
            disabled={fetching}
            className="gap-1.5 rounded-xl border-amber-200 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-950/30 h-9 px-3"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fetching ? "animate-spin" : ""}`} />
            <span className="text-xs font-semibold">تحديث الآن</span>
          </Button>
        </div>
      </div>

      {/* Loading skeleton */}
      {(loading || fetching) && !calculatorData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl bg-muted/50 h-44 p-4 space-y-3">
              <div className="h-6 bg-muted rounded-lg w-20" />
              <div className="h-10 bg-muted rounded-lg w-28" />
              <div className="h-10 bg-muted rounded-lg w-24" />
            </div>
          ))}
        </div>
      )}

      {calculatorData && (
        <>
          {/* Gold Karat Price Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {calculatorData.karats.map((karatPrice, idx) => {
              const theme = karatThemes[karatPrice.karat];
              return (
                <motion.div
                  key={karatPrice.karat}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: idx * 0.08, type: "spring", stiffness: 200, damping: 20 }}
                >
                  <Card className={`relative overflow-hidden rounded-2xl border-0 shadow-lg ${theme.cardGlow} ring-1 ring-border/20 group hover:shadow-xl transition-shadow duration-300`}>
                    <div className={`h-1 bg-gradient-to-r ${theme.accentLine}`} />
                    <CardContent className="relative p-3.5 space-y-3">
                      {/* Karat badge */}
                      <div className="flex items-center justify-center">
                        <div className={`${theme.badgeBg} px-3 py-1 rounded-lg shadow-sm border ${theme.badgeBorder}`}>
                          <span className={`text-xs font-black ${theme.badgeText} tracking-wide`}>
                            {theme.label}
                          </span>
                        </div>
                      </div>

                      {/* Sell price */}
                      <div className={`${theme.sellBg} rounded-lg p-2.5 ring-1 ring-emerald-200/50 dark:ring-emerald-800/30`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <ArrowRightLeft className={`w-3 h-3 ${theme.sellIcon}`} />
                          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">بيع</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg sm:text-xl font-black tracking-tight text-foreground tabular-nums">
                            {formatPrice(karatPrice.sellPrice)}
                          </span>
                          <span className="text-[10px] font-bold text-muted-foreground">ج.م/جرام</span>
                        </div>
                      </div>

                      {/* Buy price */}
                      <div className={`${theme.buyBg} rounded-lg p-2.5 ring-1 ring-sky-200/50 dark:ring-sky-800/30`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <ArrowDownUp className={`w-3 h-3 ${theme.buyIcon}`} />
                          <span className="text-xs font-bold text-sky-700 dark:text-sky-400">شراء</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-sm sm:text-base font-bold tracking-tight text-muted-foreground tabular-nums">
                            {formatPrice(karatPrice.buyPrice)}
                          </span>
                          <span className="text-[10px] font-semibold text-muted-foreground">ج.م/جرام</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {/* Gold Pound Card */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <Card className="relative overflow-hidden rounded-2xl border-0 shadow-lg shadow-amber-200/20 dark:shadow-amber-900/10 ring-1 ring-amber-300/30">
              <div className="h-1 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500" />
              <CardContent className="relative p-4 space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-400 flex items-center justify-center shadow-md shadow-amber-400/25">
                    <Coins className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="bg-gradient-to-r from-amber-400 to-yellow-300 px-3 py-1 rounded-lg shadow-sm border border-amber-300 inline-block">
                      <span className="text-xs font-black text-amber-900">الجنيه الذهب</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">8 جرام — عيار 21</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3 ring-1 ring-emerald-200/50 dark:ring-emerald-800/30">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">بيع</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg sm:text-xl font-black tracking-tight text-foreground tabular-nums">
                        {formatPrice(calculatorData.goldPound.sellPrice)}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground">ج.م</span>
                    </div>
                  </div>
                  <div className="bg-sky-50 dark:bg-sky-950/30 rounded-lg p-3 ring-1 ring-sky-200/50 dark:ring-sky-800/30">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <ArrowDownUp className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                      <span className="text-xs font-bold text-sky-700 dark:text-sky-400">شراء</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm sm:text-base font-bold tracking-tight text-muted-foreground tabular-nums">
                        {formatPrice(calculatorData.goldPound.buyPrice)}
                      </span>
                      <span className="text-[10px] font-semibold text-muted-foreground">ج.م</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Unified Calculator Section */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="rounded-2xl border-0 shadow-md ring-1 ring-border/20 overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500" />
              <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 px-4 py-3 flex items-center gap-2.5 border-b border-border/30">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-sm">
                  <CircleDollarSign className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-sm font-bold">حساب قيمة الذهب والجنيه الذهب</h3>
              </div>
              <CardContent className="p-4 space-y-4">
                {/* Shared: Karat + Type selectors */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground">العيار</label>
                    <Select value={calcKarat} onValueChange={setCalcKarat}>
                      <SelectTrigger className="h-10 rounded-xl text-sm font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24">عيار 24</SelectItem>
                        <SelectItem value="22">عيار 22</SelectItem>
                        <SelectItem value="21">عيار 21</SelectItem>
                        <SelectItem value="18">عيار 18</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground">النوع</label>
                    <Select value={calcType} onValueChange={setCalcType}>
                      <SelectTrigger className="h-10 rounded-xl text-sm font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sell">بيع</SelectItem>
                        <SelectItem value="buy">شراء</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Section 1: Gold by Weight */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-sm">
                      <CircleDollarSign className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-xs font-bold text-foreground">حساب قيمة الذهب بالوزن</span>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground">الوزن بالجرام</label>
                    <Input
                      type="number"
                      placeholder="أدخل الوزن بالجرام"
                      value={calcGrams}
                      onChange={(e) => setCalcGrams(e.target.value)}
                      className="h-10 rounded-xl text-sm font-semibold"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <AnimatePresence>
                    {calcResult && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 rounded-xl p-3 border border-amber-200/60 dark:border-amber-800/40">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-bold text-muted-foreground">الإجمالي</span>
                            <span className="text-lg font-black bg-gradient-to-r from-amber-600 to-yellow-600 bg-clip-text text-transparent tabular-nums">
                              {formatPrice(calcResult.total)} ج.م
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <Separator className="bg-border/30" />

                {/* Section 2: Gold Pound Calculator */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center shadow-sm">
                      <Coins className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-xs font-bold text-foreground">حساب الجنيه الذهب</span>
                    <span className="text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">8 جرام — عيار 21</span>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground">عدد الجنيهات</label>
                    <Input
                      type="number"
                      placeholder="أدخل عدد الجنيهات"
                      value={poundCount}
                      onChange={(e) => setPoundCount(e.target.value)}
                      className="h-10 rounded-xl text-sm font-semibold"
                      min="0"
                      step="0.5"
                    />
                  </div>
                  <AnimatePresence>
                    {poundResult && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/30 rounded-xl p-3 border border-yellow-200/60 dark:border-yellow-800/40">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-bold text-muted-foreground">الإجمالي</span>
                            <span className="text-lg font-black bg-gradient-to-r from-yellow-600 to-amber-600 bg-clip-text text-transparent tabular-nums">
                              {formatPrice(poundResult.total)} ج.م
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Last updated + Live indicator */}
          {calculatorData.fetchedAt && (
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-1">
              <div className="flex items-center gap-1">
                <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">تحديث مباشر</span>
              </div>
              <span>•</span>
              <span>
                آخر تحديث:{" "}
                {new Date(calculatorData.fetchedAt).toLocaleString("ar-EG", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <span>•</span>
              <span>التحديث التالي بعد {countdown} ثانية</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
