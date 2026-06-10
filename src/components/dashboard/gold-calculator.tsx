"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calculator,
  RefreshCw,
  Coins,
  CircleDollarSign,
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

// Modern gradient themes for each karat
const karatThemes: Record<number, {
  gradient: string;
  glow: string;
  iconBg: string;
  label: string;
  accent: string;
  ring: string;
}> = {
  24: {
    gradient: "from-amber-300 via-yellow-200 to-amber-100",
    glow: "shadow-amber-300/30",
    iconBg: "bg-amber-400",
    label: "عيار ٢٤",
    accent: "text-amber-700",
    ring: "ring-amber-300/50",
  },
  22: {
    gradient: "from-orange-200 via-amber-200 to-yellow-100",
    glow: "shadow-orange-300/30",
    iconBg: "bg-orange-400",
    label: "عيار ٢٢",
    accent: "text-orange-700",
    ring: "ring-orange-300/50",
  },
  21: {
    gradient: "from-yellow-200 via-amber-200 to-orange-100",
    glow: "shadow-yellow-300/30",
    iconBg: "bg-yellow-500",
    label: "عيار ٢١",
    accent: "text-yellow-700",
    ring: "ring-yellow-300/50",
  },
  18: {
    gradient: "from-rose-200 via-amber-200 to-yellow-100",
    glow: "shadow-rose-300/30",
    iconBg: "bg-rose-400",
    label: "عيار ١٨",
    accent: "text-rose-700",
    ring: "ring-rose-300/50",
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
          <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-500 shadow-lg shadow-amber-400/30">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-amber-600 to-yellow-600 bg-clip-text text-transparent">
              حاسبة الذهب
            </h2>
            {calculatorData?.source && (
              <p className="text-xs text-muted-foreground">الأسعار من {calculatorData.source}</p>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleFetch}
          disabled={fetching || loading}
          className="gap-1.5 rounded-xl border-amber-200 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-950/30"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${fetching ? "animate-spin" : ""}`} />
          تحديث الأسعار
        </Button>
      </div>

      {/* Loading skeleton */}
      {(loading || fetching) && !calculatorData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl bg-muted/50 h-44 p-5 space-y-3">
              <div className="h-4 bg-muted rounded-lg w-16" />
              <div className="h-10 bg-muted rounded-lg w-28" />
              <div className="h-3 bg-muted rounded-lg w-20" />
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
                  <Card className={`relative overflow-hidden rounded-2xl border-0 shadow-lg ${theme.glow} ring-1 ${theme.ring} group hover:shadow-xl transition-all duration-300`}>
                    {/* Background gradient */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${theme.gradient} opacity-60 dark:opacity-20`} />
                    
                    <CardContent className="relative p-5 space-y-3">
                      {/* Karat badge */}
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-xl ${theme.iconBg} flex items-center justify-center shadow-md`}>
                          <span className="text-white text-xs font-bold">{karatPrice.karat}</span>
                        </div>
                        <span className={`text-sm font-bold ${theme.accent} dark:text-amber-300`}>
                          {theme.label}
                        </span>
                      </div>

                      {/* Sell price */}
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">بيع</p>
                        <p className="text-2xl font-black tracking-tight text-foreground tabular-nums">
                          {formatPrice(karatPrice.sellPrice)}
                          <span className="text-xs font-medium text-muted-foreground mr-1">ج.م</span>
                        </p>
                      </div>

                      {/* Divider */}
                      <div className="h-px bg-gradient-to-r from-transparent via-amber-300/40 to-transparent" />

                      {/* Buy price */}
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">شراء</p>
                        <p className="text-lg font-bold tracking-tight text-muted-foreground tabular-nums">
                          {formatPrice(karatPrice.buyPrice)}
                          <span className="text-xs font-normal mr-1">ج.م</span>
                        </p>
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
            <Card className="relative overflow-hidden rounded-2xl border-0 shadow-lg shadow-amber-400/20 ring-1 ring-amber-300/40">
              <div className="absolute inset-0 bg-gradient-to-r from-amber-200 via-yellow-200 to-amber-100 opacity-50 dark:opacity-15" />
              <CardContent className="relative p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-400 flex items-center justify-center shadow-lg shadow-amber-400/30">
                    <Coins className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">الجنيه الذهب</h3>
                    <p className="text-xs text-muted-foreground">= 8 جرام عيار 21</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/60 dark:bg-black/20 rounded-xl p-3 backdrop-blur-sm">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">بيع</p>
                    <p className="text-2xl font-black tracking-tight text-foreground tabular-nums">
                      {formatPrice(calculatorData.goldPound.sellPrice)}
                      <span className="text-xs font-medium text-muted-foreground mr-1">ج.م</span>
                    </p>
                  </div>
                  <div className="bg-white/60 dark:bg-black/20 rounded-xl p-3 backdrop-blur-sm">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">شراء</p>
                    <p className="text-2xl font-black tracking-tight text-muted-foreground tabular-nums">
                      {formatPrice(calculatorData.goldPound.buyPrice)}
                      <span className="text-xs font-normal mr-1">ج.م</span>
                    </p>
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
              <Card className="rounded-2xl border-0 shadow-md ring-1 ring-border/50 overflow-hidden">
                <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 px-5 py-3 flex items-center gap-2 border-b border-border/30">
                  <CircleDollarSign className="w-4 h-4 text-amber-600" />
                  <h3 className="font-bold text-sm">حساب قيمة الذهب</h3>
                </div>
                <CardContent className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">العيار</label>
                      <Select value={calcKarat} onValueChange={setCalcKarat}>
                        <SelectTrigger className="h-10 rounded-xl">
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
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">النوع</label>
                      <Select value={calcType} onValueChange={setCalcType}>
                        <SelectTrigger className="h-10 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sell">بيع</SelectItem>
                          <SelectItem value="buy">شراء</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">الوزن بالجرام</label>
                    <Input
                      type="number"
                      placeholder="أدخل الوزن بالجرام"
                      value={calcGrams}
                      onChange={(e) => setCalcGrams(e.target.value)}
                      className="h-10 rounded-xl text-lg font-semibold"
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
                        <div className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 rounded-2xl p-4 border border-amber-200/60 dark:border-amber-800/40">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-semibold text-muted-foreground">الإجمالي</span>
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
              <Card className="rounded-2xl border-0 shadow-md ring-1 ring-border/50 overflow-hidden">
                <div className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20 px-5 py-3 flex items-center gap-2 border-b border-border/30">
                  <Coins className="w-4 h-4 text-yellow-600" />
                  <h3 className="font-bold text-sm">حساب الجنيه الذهب</h3>
                </div>
                <CardContent className="p-5 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">عدد الجنيهات</label>
                    <Input
                      type="number"
                      placeholder="أدخل عدد الجنيهات"
                      value={poundCount}
                      onChange={(e) => setPoundCount(e.target.value)}
                      className="h-10 rounded-xl text-lg font-semibold"
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
                        <div className="bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/30 rounded-2xl p-4 border border-yellow-200/60 dark:border-yellow-800/40">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-semibold text-muted-foreground">الإجمالي</span>
                            <span className="text-3xl font-black bg-gradient-to-r from-yellow-600 to-amber-600 bg-clip-text text-transparent tabular-nums">
                              {formatPrice(poundResult.total)} ج.م
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="text-xs text-muted-foreground bg-muted/30 rounded-xl p-3 space-y-1">
                    <p className="font-semibold">معلومة</p>
                    <p>الجنيه الذهب = 8 جرام من عيار 21</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Last updated */}
          {calculatorData.fetchedAt && (
            <div className="text-center text-xs text-muted-foreground pt-2">
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
