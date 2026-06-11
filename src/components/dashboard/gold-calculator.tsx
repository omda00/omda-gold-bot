"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calculator,
  RefreshCw,
  Coins,
  CircleDollarSign,
  Timer,
  Radio,
  Scale,
  Gem,
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

const AUTO_REFRESH_INTERVAL = 30000;

// Shared card style matching the site's design language
const cardBase = "rounded-2xl border-0 shadow-lg overflow-hidden ring-1 ring-neutral-800 bg-neutral-950";
const accentLine = "h-1 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400";
const cardHeader = "px-4 sm:px-5 py-3 border-b border-neutral-800 flex items-center gap-2.5";
const iconBox = "w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-md shadow-amber-400/25";

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
    <div className="space-y-3">
      {/* ─── Header Bar ─── */}
      <div className="flex items-center justify-between flex-wrap gap-2.5 bg-gradient-to-r from-amber-50/80 to-yellow-50/80 dark:from-amber-950/20 dark:to-yellow-950/20 rounded-2xl px-3 sm:px-4 py-2.5 ring-1 ring-amber-200/40 dark:ring-amber-800/20">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 shadow-md shadow-amber-400/25">
            <Calculator className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-foreground">حاسبة الذهب</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              {calculatorData?.source && (
                <span className="text-[10px] sm:text-xs text-muted-foreground">الأسعار من {calculatorData.source}</span>
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
            variant="default"
            size="sm"
            onClick={handleFetch}
            disabled={fetching}
            className="gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white shadow-md shadow-amber-400/20 h-9 px-4 text-xs font-bold transition-all active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fetching ? "animate-spin" : ""}`} />
            تحديث الآن
          </Button>
        </div>
      </div>

      {/* ─── Loading ─── */}
      {(loading || fetching) && !calculatorData && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl bg-neutral-950 h-32 p-4 space-y-3">
              <div className="h-6 bg-neutral-800 rounded-lg w-40" />
              <div className="h-10 bg-neutral-800 rounded-lg w-full" />
            </div>
          ))}
        </div>
      )}

      {calculatorData && (
        <>
          {/* ─── Card 1: Settings (Karat + Type) ─── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            <Card className={cardBase}>
              <div className={accentLine} />
              <div className={cardHeader}>
                <div className={iconBox}>
                  <Gem className="w-4 h-4 text-neutral-950" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">إعدادات الحساب</h3>
                  <p className="text-[10px] text-neutral-500">اختر العيار ونوع السعر</p>
                </div>
              </div>
              <CardContent className="p-4 sm:p-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400">العيار</label>
                    <Select value={calcKarat} onValueChange={setCalcKarat}>
                      <SelectTrigger className="h-11 rounded-xl text-sm font-bold bg-neutral-900 border-neutral-700 text-white focus:ring-amber-400/50">
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
                    <label className="text-xs font-bold text-neutral-400">النوع</label>
                    <Select value={calcType} onValueChange={setCalcType}>
                      <SelectTrigger className="h-11 rounded-xl text-sm font-bold bg-neutral-900 border-neutral-700 text-white focus:ring-amber-400/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sell">بيع</SelectItem>
                        <SelectItem value="buy">شراء</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ─── Card 2: Gold Weight Calculator ─── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.07, type: "spring", stiffness: 200, damping: 20 }}
          >
            <Card className={cardBase}>
              <div className={accentLine} />
              <div className={cardHeader}>
                <div className={iconBox}>
                  <Scale className="w-4 h-4 text-neutral-950" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">حساب قيمة الذهب بالوزن</h3>
                  <p className="text-[10px] text-neutral-500">أدخل الوزن بالجرام لحساب القيمة</p>
                </div>
              </div>
              <CardContent className="p-4 sm:p-5 space-y-3">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-400">الوزن بالجرام</label>
                  <Input
                    type="number"
                    placeholder="أدخل الوزن بالجرام"
                    value={calcGrams}
                    onChange={(e) => setCalcGrams(e.target.value)}
                    className="h-11 rounded-xl text-sm font-bold bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-600 focus:ring-amber-400/50"
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
                      <div className="bg-neutral-900 rounded-xl p-4 ring-1 ring-amber-400/20">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-bold text-neutral-400">الإجمالي</span>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-2xl sm:text-3xl font-black text-white tabular-nums tracking-tight">
                              {formatPrice(calcResult.total)}
                            </span>
                            <span className="text-sm font-bold text-neutral-500">ج.م</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>

          {/* ─── Card 3: Gold Pound Calculator ─── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14, type: "spring", stiffness: 200, damping: 20 }}
          >
            <Card className={cardBase}>
              <div className={accentLine} />
              <div className={cardHeader}>
                <div className={iconBox}>
                  <Coins className="w-4 h-4 text-neutral-950" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">حساب الجنيه الذهب</h3>
                  <p className="text-[10px] text-neutral-500">8 جرام — عيار 21</p>
                </div>
              </div>
              <CardContent className="p-4 sm:p-5 space-y-3">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-400">عدد الجنيهات</label>
                  <Input
                    type="number"
                    placeholder="أدخل عدد الجنيهات"
                    value={poundCount}
                    onChange={(e) => setPoundCount(e.target.value)}
                    className="h-11 rounded-xl text-sm font-bold bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-600 focus:ring-amber-400/50"
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
                      <div className="bg-neutral-900 rounded-xl p-4 ring-1 ring-amber-400/20">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-bold text-neutral-400">الإجمالي</span>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-2xl sm:text-3xl font-black text-white tabular-nums tracking-tight">
                              {formatPrice(poundResult.total)}
                            </span>
                            <span className="text-sm font-bold text-neutral-500">ج.م</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>

          {/* ─── Footer: Live indicator ─── */}
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
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
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
