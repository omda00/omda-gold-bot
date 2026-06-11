"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calculator,
  RefreshCw,
  Coins,
  CircleDollarSign,
  ArrowDownUp,
  ArrowRightLeft,
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

// Modern color themes for each karat - rich, distinct, modern
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

export function GoldCalculator({ calculatorData, loading, onFetch }: GoldCalculatorProps) {
  const [fetching, setFetching] = useState(false);

  // Calculator state
  const [calcKarat, setCalcKarat] = useState<string>("21");
  const [calcGrams, setCalcGrams] = useState<string>("");
  const [calcType, setCalcType] = useState<string>("sell");

  const handleFetch = useCallback(async () => {
    setFetching(true);
    try {
      await onFetch();
    } finally {
      setFetching(false);
    }
  }, [onFetch]);

  // Calculate result
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

  // Gold pound calculator
  const [poundCount, setPoundCount] = useState<string>("");
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-500 shadow-lg shadow-amber-400/30">
            <Calculator className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black bg-gradient-to-r from-amber-600 to-yellow-600 bg-clip-text text-transparent">
              حاسبة الذهب
            </h2>
            {calculatorData?.source && (
              <p className="text-sm text-muted-foreground">الأسعار من {calculatorData.source}</p>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="default"
          onClick={handleFetch}
          disabled={fetching || loading}
          className="gap-2 rounded-xl border-amber-200 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-950/30 h-10 px-4"
        >
          <RefreshCw className={`w-4 h-4 ${fetching ? "animate-spin" : ""}`} />
          <span className="text-sm font-semibold">تحديث الأسعار</span>
        </Button>
      </div>

      {/* Loading skeleton */}
      {(loading || fetching) && !calculatorData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl bg-muted/50 h-52 p-5 space-y-4">
              <div className="h-7 bg-muted rounded-lg w-24" />
              <div className="h-12 bg-muted rounded-lg w-32" />
              <div className="h-12 bg-muted rounded-lg w-28" />
            </div>
          ))}
        </div>
      )}

      {calculatorData && (
        <>
          {/* Gold Karat Price Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {calculatorData.karats.map((karatPrice, idx) => {
              const theme = karatThemes[karatPrice.karat];
              return (
                <motion.div
                  key={karatPrice.karat}
                  initial={{ opacity: 0, y: 30, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: idx * 0.08, type: "spring", stiffness: 200, damping: 20 }}
                >
                  <Card className={`relative overflow-hidden rounded-2xl border-0 shadow-xl ${theme.cardGlow} ring-1 ring-border/20 group hover:shadow-2xl transition-all duration-300 hover:-translate-y-1`}>
                    {/* Top accent gradient line */}
                    <div className={`h-1.5 bg-gradient-to-r ${theme.accentLine}`} />

                    <CardContent className="relative p-5 space-y-4">
                      {/* Karat badge - prominent colored box */}
                      <div className="flex items-center justify-center">
                        <div className={`${theme.badgeBg} px-5 py-2 rounded-xl shadow-md border ${theme.badgeBorder}`}>
                          <span className={`text-base font-black ${theme.badgeText} tracking-wide`}>
                            {theme.label}
                          </span>
                        </div>
                      </div>

                      {/* Sell price section */}
                      <div className={`${theme.sellBg} rounded-xl p-3.5 ring-1 ring-emerald-200/50 dark:ring-emerald-800/30`}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <ArrowRightLeft className={`w-4 h-4 ${theme.sellIcon}`} />
                          <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">بيع</span>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl sm:text-3xl font-black tracking-tight text-foreground tabular-nums">
                            {formatPrice(karatPrice.sellPrice)}
                          </span>
                          <span className="text-sm font-bold text-muted-foreground">ج.م/جرام</span>
                        </div>
                      </div>

                      {/* Buy price section */}
                      <div className={`${theme.buyBg} rounded-xl p-3.5 ring-1 ring-sky-200/50 dark:ring-sky-800/30`}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <ArrowDownUp className={`w-4 h-4 ${theme.buyIcon}`} />
                          <span className="text-base font-bold text-sky-700 dark:text-sky-400">شراء</span>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xl sm:text-2xl font-bold tracking-tight text-muted-foreground tabular-nums">
                            {formatPrice(karatPrice.buyPrice)}
                          </span>
                          <span className="text-sm font-semibold text-muted-foreground">ج.م/جرام</span>
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <Card className="relative overflow-hidden rounded-2xl border-0 shadow-xl shadow-amber-200/30 dark:shadow-amber-900/20 ring-1 ring-amber-300/30">
              {/* Top accent */}
              <div className="h-1.5 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500" />

              <CardContent className="relative p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-400 flex items-center justify-center shadow-lg shadow-amber-400/30">
                    <Coins className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="bg-gradient-to-r from-amber-400 to-yellow-300 px-5 py-2 rounded-xl shadow-md border border-amber-300 inline-block">
                      <span className="text-base font-black text-amber-900">الجنيه الذهب</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1.5">= 8 جرام عيار 21</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-4 ring-1 ring-emerald-200/50 dark:ring-emerald-800/30">
                    <div className="flex items-center gap-2 mb-2">
                      <ArrowRightLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">بيع</span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl sm:text-3xl font-black tracking-tight text-foreground tabular-nums">
                        {formatPrice(calculatorData.goldPound.sellPrice)}
                      </span>
                      <span className="text-sm font-bold text-muted-foreground">ج.م</span>
                    </div>
                  </div>
                  <div className="bg-sky-50 dark:bg-sky-950/30 rounded-xl p-4 ring-1 ring-sky-200/50 dark:ring-sky-800/30">
                    <div className="flex items-center gap-2 mb-2">
                      <ArrowDownUp className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                      <span className="text-base font-bold text-sky-700 dark:text-sky-400">شراء</span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xl sm:text-2xl font-bold tracking-tight text-muted-foreground tabular-nums">
                        {formatPrice(calculatorData.goldPound.buyPrice)}
                      </span>
                      <span className="text-sm font-semibold text-muted-foreground">ج.م</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Interactive Calculator Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Gold by Weight Calculator */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card className="rounded-2xl border-0 shadow-lg ring-1 ring-border/20 overflow-hidden">
                <div className="h-1.5 bg-gradient-to-r from-amber-400 to-yellow-400" />
                <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 px-5 py-4 flex items-center gap-3 border-b border-border/30">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-md">
                    <CircleDollarSign className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-base font-bold">حساب قيمة الذهب</h3>
                </div>
                <CardContent className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-muted-foreground">العيار</label>
                      <Select value={calcKarat} onValueChange={setCalcKarat}>
                        <SelectTrigger className="h-11 rounded-xl text-base font-semibold">
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
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-muted-foreground">النوع</label>
                      <Select value={calcType} onValueChange={setCalcType}>
                        <SelectTrigger className="h-11 rounded-xl text-base font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sell">بيع</SelectItem>
                          <SelectItem value="buy">شراء</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-muted-foreground">الوزن بالجرام</label>
                    <Input
                      type="number"
                      placeholder="أدخل الوزن بالجرام"
                      value={calcGrams}
                      onChange={(e) => setCalcGrams(e.target.value)}
                      className="h-11 rounded-xl text-base font-semibold"
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
                        <div className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 rounded-2xl p-5 border border-amber-200/60 dark:border-amber-800/40">
                          <div className="flex justify-between items-center">
                            <span className="text-base font-bold text-muted-foreground">الإجمالي</span>
                            <span className="text-3xl font-black bg-gradient-to-r from-amber-600 to-yellow-600 bg-clip-text text-transparent tabular-nums">
                              {formatPrice(calcResult.total)} ج.م
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </motion.div>

            {/* Gold Pound Calculator */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
            >
              <Card className="rounded-2xl border-0 shadow-lg ring-1 ring-border/20 overflow-hidden">
                <div className="h-1.5 bg-gradient-to-r from-yellow-400 to-amber-400" />
                <div className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20 px-5 py-4 flex items-center gap-3 border-b border-border/30">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center shadow-md">
                    <Coins className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-base font-bold">حساب الجنيه الذهب</h3>
                </div>
                <CardContent className="p-5 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-muted-foreground">عدد الجنيهات</label>
                    <Input
                      type="number"
                      placeholder="أدخل عدد الجنيهات"
                      value={poundCount}
                      onChange={(e) => setPoundCount(e.target.value)}
                      className="h-11 rounded-xl text-base font-semibold"
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
                        <div className="bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/30 rounded-2xl p-5 border border-yellow-200/60 dark:border-yellow-800/40">
                          <div className="flex justify-between items-center">
                            <span className="text-base font-bold text-muted-foreground">الإجمالي</span>
                            <span className="text-3xl font-black bg-gradient-to-r from-yellow-600 to-amber-600 bg-clip-text text-transparent tabular-nums">
                              {formatPrice(poundResult.total)} ج.م
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="text-sm text-muted-foreground bg-muted/30 rounded-xl p-4 space-y-1">
                    <p className="font-bold text-foreground">معلومة</p>
                    <p>الجنيه الذهب = 8 جرام من عيار 21</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Last updated */}
          {calculatorData.fetchedAt && (
            <div className="text-center text-sm text-muted-foreground pt-2">
              آخر تحديث:{" "}
              {new Date(calculatorData.fetchedAt).toLocaleString("ar-EG", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
