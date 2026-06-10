"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calculator,
  RefreshCw,
  Coins,
  Gem,
  CircleDollarSign,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { CalculatorPriceResult, KaratPrice } from "@/lib/dashboard-types";

interface GoldCalculatorProps {
  calculatorData: CalculatorPriceResult | null;
  loading: boolean;
  onFetch: () => Promise<CalculatorPriceResult | null>;
}

// Format number with commas
function formatPrice(price: number | null): string {
  if (price === null) return "—";
  return price.toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Get karat color
function getKaratColor(karat: number): string {
  switch (karat) {
    case 24: return "from-amber-400 to-yellow-300";
    case 22: return "from-amber-500 to-yellow-400";
    case 21: return "from-amber-600 to-yellow-500";
    case 18: return "from-amber-700 to-yellow-600";
    default: return "from-amber-500 to-yellow-400";
  }
}

function getKaratBg(karat: number): string {
  switch (karat) {
    case 24: return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
    case 22: return "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800";
    case 21: return "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800";
    case 18: return "bg-lime-50 dark:bg-lime-950/30 border-lime-200 dark:border-lime-800";
    default: return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
  }
}

export function GoldCalculator({ calculatorData, loading, onFetch }: GoldCalculatorProps) {
  const [fetching, setFetching] = useState(false);
  const [showSilver, setShowSilver] = useState(false);

  // Calculator state
  const [calcKarat, setCalcKarat] = useState<string>("21");
  const [calcGrams, setCalcGrams] = useState<string>("");
  const [calcType, setCalcType] = useState<string>("sell");

  // Handle fetch
  const handleFetch = useCallback(async () => {
    setFetching(true);
    try {
      await onFetch();
    } finally {
      setFetching(false);
    }
  }, [onFetch]);

  // Calculate result
  const getCalcResult = useCallback((): { total: number; workmanship: number; grandTotal: number } | null => {
    if (!calculatorData || !calcGrams) return null;
    const grams = parseFloat(calcGrams);
    if (isNaN(grams) || grams <= 0) return null;

    const karat = parseInt(calcKarat);
    const karatPrice = calculatorData.karats.find((k) => k.karat === karat);
    if (!karatPrice) return null;

    const pricePerGram = calcType === "sell" ? karatPrice.sellPrice : karatPrice.buyPrice;
    const workmanshipPerGram = calcType === "sell" ? karatPrice.sellWorkmanship : karatPrice.buyWorkmanship;

    if (!pricePerGram) return null;

    const total = pricePerGram * grams;
    const workmanship = (workmanshipPerGram || 0) * grams;
    const grandTotal = total + workmanship;

    return { total, workmanship, grandTotal };
  }, [calculatorData, calcKarat, calcGrams, calcType]);

  const calcResult = getCalcResult();

  // Gold pound calculator
  const [poundCount, setPoundCount] = useState<string>("");
  const getPoundResult = useCallback((): { total: number; workmanship: number; grandTotal: number } | null => {
    if (!calculatorData || !poundCount) return null;
    const count = parseFloat(poundCount);
    if (isNaN(count) || count <= 0) return null;

    const gp = calculatorData.goldPound;
    const price = calcType === "sell" ? gp.sellPrice : gp.buyPrice;
    const workmanship = calcType === "sell" ? gp.sellWorkmanship : gp.buyWorkmanship;

    if (!price) return null;

    const total = price * count;
    const work = (workmanship || 0) * count;
    return { total, workmanship: work, grandTotal: total + work };
  }, [calculatorData, poundCount, calcType]);

  const poundResult = getPoundResult();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-amber-600" />
          <h2 className="text-lg font-bold">حاسبة الذهب والفضة</h2>
          {calculatorData?.source && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              من {calculatorData.source}
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleFetch}
          disabled={fetching || loading}
          className="gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${fetching ? "animate-spin" : ""}`} />
          تحديث الأسعار
        </Button>
      </div>

      {/* Loading skeleton */}
      {(loading || fetching) && !calculatorData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[24, 22, 21, 18].map((k) => (
            <Card key={k} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-4 bg-muted rounded w-16 mb-3" />
                <div className="h-8 bg-muted rounded w-24 mb-2" />
                <div className="h-3 bg-muted rounded w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {calculatorData && (
        <>
          {/* Gold Karat Price Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {calculatorData.karats.map((karatPrice) => (
              <motion.div
                key={karatPrice.karat}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: karatPrice.karat === 21 ? 0 : 0.1 }}
              >
                <Card className={`border ${getKaratBg(karatPrice.karat)} overflow-hidden`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-3 h-3 rounded-full bg-gradient-to-br ${getKaratColor(karatPrice.karat)}`} />
                        <span className="text-sm font-bold">عيار {karatPrice.karat}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">للجرام</span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">بيع</span>
                        <span className="text-base font-bold text-foreground">
                          {formatPrice(karatPrice.sellPrice)}
                          <span className="text-xs text-muted-foreground mr-1">ج.م</span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">شراء</span>
                        <span className="text-sm font-medium text-muted-foreground">
                          {formatPrice(karatPrice.buyPrice)}
                          <span className="text-xs mr-1">ج.م</span>
                        </span>
                      </div>
                      {(karatPrice.sellWorkmanship || karatPrice.buyWorkmanship) && (
                        <div className="pt-1 mt-1 border-t border-border/30">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">مصنعية بيع</span>
                            <span className="text-[10px] font-medium">
                              {formatPrice(karatPrice.sellWorkmanship)} ج.م
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">مصنعية شراء</span>
                            <span className="text-[10px] font-medium">
                              {formatPrice(karatPrice.buyWorkmanship)} ج.م
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Gold Pound Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="border border-amber-300 dark:border-amber-700 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/40 dark:to-yellow-950/40">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Coins className="w-4.5 h-4.5 text-amber-600" />
                  سعر الجنيه الذهب
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <span className="text-xs text-muted-foreground">سعر البيع</span>
                    <p className="text-lg font-bold">
                      {formatPrice(calculatorData.goldPound.sellPrice)}
                      <span className="text-xs text-muted-foreground mr-1">ج.م</span>
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">سعر الشراء</span>
                    <p className="text-lg font-bold text-muted-foreground">
                      {formatPrice(calculatorData.goldPound.buyPrice)}
                      <span className="text-xs mr-1">ج.م</span>
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">مصنعية البيع</span>
                    <p className="text-sm font-medium">
                      {formatPrice(calculatorData.goldPound.sellWorkmanship)}
                      <span className="text-xs text-muted-foreground mr-1">ج.م</span>
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">مصنعية الشراء</span>
                    <p className="text-sm font-medium text-muted-foreground">
                      {formatPrice(calculatorData.goldPound.buyWorkmanship)}
                      <span className="text-xs mr-1">ج.م</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Interactive Calculator Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Gold Calculator */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="border border-amber-200 dark:border-amber-800">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CircleDollarSign className="w-4 h-4 text-amber-600" />
                    حساب قيمة الذهب
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">العيار</label>
                      <Select value={calcKarat} onValueChange={setCalcKarat}>
                        <SelectTrigger className="h-9">
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
                      <label className="text-xs font-medium text-muted-foreground">النوع</label>
                      <Select value={calcType} onValueChange={setCalcType}>
                        <SelectTrigger className="h-9">
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
                    <label className="text-xs font-medium text-muted-foreground">الوزن بالجرام</label>
                    <Input
                      type="number"
                      placeholder="أدخل الوزن بالجرام"
                      value={calcGrams}
                      onChange={(e) => setCalcGrams(e.target.value)}
                      className="h-9"
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
                        <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 space-y-2 border border-amber-200 dark:border-amber-800">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">السعر الأساسي</span>
                            <span className="font-medium">{formatPrice(calcResult.total)} ج.م</span>
                          </div>
                          {calcResult.workmanship > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">المصنعية</span>
                              <span className="font-medium">{formatPrice(calcResult.workmanship)} ج.م</span>
                            </div>
                          )}
                          <Separator className="bg-amber-200 dark:bg-amber-700" />
                          <div className="flex justify-between">
                            <span className="font-bold text-amber-700 dark:text-amber-400">الإجمالي</span>
                            <span className="font-bold text-lg text-amber-700 dark:text-amber-400">
                              {formatPrice(calcResult.grandTotal)} ج.م
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
              transition={{ delay: 0.4 }}
            >
              <Card className="border border-yellow-200 dark:border-yellow-800">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Coins className="w-4 h-4 text-yellow-600" />
                    حساب الجنيه الذهب
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">عدد الجنيهات</label>
                    <Input
                      type="number"
                      placeholder="أدخل عدد الجنيهات"
                      value={poundCount}
                      onChange={(e) => setPoundCount(e.target.value)}
                      className="h-9"
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
                        <div className="bg-yellow-50 dark:bg-yellow-950/30 rounded-lg p-3 space-y-2 border border-yellow-200 dark:border-yellow-800">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">السعر الأساسي</span>
                            <span className="font-medium">{formatPrice(poundResult.total)} ج.م</span>
                          </div>
                          {poundResult.workmanship > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">المصنعية</span>
                              <span className="font-medium">{formatPrice(poundResult.workmanship)} ج.م</span>
                            </div>
                          )}
                          <Separator className="bg-yellow-200 dark:bg-yellow-700" />
                          <div className="flex justify-between">
                            <span className="font-bold text-yellow-700 dark:text-yellow-400">الإجمالي</span>
                            <span className="font-bold text-lg text-yellow-700 dark:text-yellow-400">
                              {formatPrice(poundResult.grandTotal)} ج.م
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Quick info about gold pound */}
                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground mt-2">
                    <Info className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>الجنيه الذهب = 8 جرام من عيار 21</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Silver Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Card className="border border-gray-200 dark:border-gray-700">
              <CardHeader
                className="pb-0 pt-4 px-4 cursor-pointer"
                onClick={() => setShowSilver(!showSilver)}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Gem className="w-4 h-4 text-gray-500" />
                    سعر الفضة
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {calculatorData.silver.sellPrice && (
                      <span className="text-sm font-bold">
                        {formatPrice(calculatorData.silver.sellPrice)} ج.م/جرام
                      </span>
                    )}
                    {showSilver ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </CardHeader>
              <AnimatePresence>
                {showSilver && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <CardContent className="px-4 pb-4 pt-3">
                      {calculatorData.silver.sellPrice ? (
                        <div className="bg-gray-50 dark:bg-gray-950/30 rounded-lg p-3 space-y-2 border border-gray-200 dark:border-gray-700">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <span className="text-xs text-muted-foreground">سعر البيع للجرام</span>
                              <p className="text-lg font-bold">
                                {formatPrice(calculatorData.silver.sellPrice)}
                                <span className="text-xs text-muted-foreground mr-1">ج.م</span>
                              </p>
                            </div>
                            <div>
                              <span className="text-xs text-muted-foreground">سعر الشراء للجرام</span>
                              <p className="text-lg font-bold text-muted-foreground">
                                {formatPrice(calculatorData.silver.buyPrice)}
                                <span className="text-xs mr-1">ج.م</span>
                              </p>
                            </div>
                          </div>

                          {/* Silver Calculator */}
                          <SilverCalculator silverPrice={calculatorData.silver} />
                        </div>
                      ) : (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                          <Gem className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          سعر الفضة غير متاح حالياً
                        </div>
                      )}
                    </CardContent>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </motion.div>

          {/* Last updated */}
          {calculatorData.fetchedAt && (
            <div className="text-center text-xs text-muted-foreground">
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

// Mini silver calculator
function SilverCalculator({ silverPrice }: { silverPrice: { sellPrice: number | null; buyPrice: number | null } }) {
  const [grams, setGrams] = useState<string>("");
  const [calcType, setCalcType] = useState<string>("sell");

  const result = (() => {
    if (!grams) return null;
    const g = parseFloat(grams);
    if (isNaN(g) || g <= 0) return null;

    const pricePerGram = calcType === "sell" ? silverPrice.sellPrice : silverPrice.buyPrice;
    if (!pricePerGram) return null;

    return pricePerGram * g;
  })();

  return (
    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Calculator className="w-3.5 h-3.5" />
        <span>حاسبة الفضة</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">النوع</label>
          <Select value={calcType} onValueChange={setCalcType}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sell">بيع</SelectItem>
              <SelectItem value="buy">شراء</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">الوزن بالجرام</label>
          <Input
            type="number"
            placeholder="جرام"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            className="h-8 text-xs"
            min="0"
            step="0.01"
          />
        </div>
      </div>
      {result !== null && (
        <div className="bg-white dark:bg-gray-800 rounded p-2 border border-gray-200 dark:border-gray-600 flex justify-between items-center">
          <span className="text-xs text-muted-foreground">الإجمالي</span>
          <span className="font-bold text-sm">{formatPrice(result)} ج.م</span>
        </div>
      )}
    </div>
  );
}
