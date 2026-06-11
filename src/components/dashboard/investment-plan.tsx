"use client";

import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ShoppingCart,
  Clock,
  AlertTriangle,
  Gem,
  Target,
  ArrowRightLeft,
  ArrowDownUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { InvestmentPlan, SignalResult } from "@/lib/dashboard-types";

function getActionConfig(action: string) {
  if (action.includes("شراء قوي")) {
    return {
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      gradient: "from-emerald-400 to-emerald-500",
      badgeBg: "bg-gradient-to-r from-emerald-500 to-emerald-600",
      border: "ring-emerald-400/40",
      icon: <ShoppingCart className="w-4 h-4" />,
      label: "Strong Buy",
      textColor: "text-emerald-700 dark:text-emerald-400",
    };
  }
  if (action.includes("شراء")) {
    return {
      bg: "bg-green-50 dark:bg-green-950/30",
      gradient: "from-green-400 to-green-500",
      badgeBg: "bg-gradient-to-r from-green-500 to-green-600",
      border: "ring-green-400/40",
      icon: <TrendingUp className="w-4 h-4" />,
      label: "Buy",
      textColor: "text-green-700 dark:text-green-400",
    };
  }
  if (action.includes("انتظار")) {
    return {
      bg: "bg-amber-50 dark:bg-amber-950/30",
      gradient: "from-amber-400 to-amber-500",
      badgeBg: "bg-gradient-to-r from-amber-500 to-amber-600",
      border: "ring-amber-400/40",
      icon: <Clock className="w-4 h-4" />,
      label: "Wait",
      textColor: "text-amber-700 dark:text-amber-400",
    };
  }
  return {
    bg: "bg-red-50 dark:bg-red-950/30",
    gradient: "from-red-400 to-red-500",
    badgeBg: "bg-gradient-to-r from-red-500 to-red-600",
    border: "ring-red-400/40",
    icon: <AlertTriangle className="w-4 h-4" />,
    label: "Sell",
    textColor: "text-red-700 dark:text-red-400",
  };
}

interface InvestmentPlanTableProps {
  plans: InvestmentPlan[];
  signal: SignalResult | null;
  currentPrice: number | null;
}

export function InvestmentPlanTable({
  plans,
  signal,
  currentPrice,
}: InvestmentPlanTableProps) {
  const activePlans = plans.filter((p) => p.active).sort((a, b) => a.order - b.order);

  return (
    <Card className="rounded-2xl border-0 shadow-xl ring-1 ring-border/20 overflow-hidden">
      {/* Top accent */}
      <div className="h-1.5 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500" />
      <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 px-5 py-4 flex items-center gap-3 border-b border-border/30">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-md shadow-amber-400/20">
          <Gem className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-base font-bold">خطة الاستثمار</h3>
          <p className="text-sm text-muted-foreground">Investment Plan — الذهب</p>
        </div>
      </div>
      <CardContent className="p-4">
        <div className="space-y-3">
          {activePlans.map((plan, index) => {
            const config = getActionConfig(plan.action);
            const isActive =
              signal &&
              signal.action === plan.action &&
              signal.priceRangeMin === plan.priceRangeMin;

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`rounded-xl p-4 ring-1 ${config.border} ${config.bg} ${
                  isActive ? "ring-2 shadow-lg" : ""
                } transition-all hover:shadow-md`}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  {/* Left: Range + Action */}
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${config.badgeBg} flex items-center justify-center text-white shadow-md`}>
                      {config.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`${config.badgeBg} text-white text-sm font-bold px-3 py-1 rounded-lg shadow-sm`} dir="rtl">
                          {plan.action}
                        </span>
                        {isActive && (
                          <Badge variant="outline" className="border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 text-xs px-2 py-0.5 rounded-lg">
                            Active
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 font-mono tabular-nums">
                        {plan.priceRangeMin.toLocaleString()} - {plan.priceRangeMax ? plan.priceRangeMax.toLocaleString() : "∞"} EGP
                      </p>
                    </div>
                  </div>

                  {/* Right: Return */}
                  <div className="text-left">
                    <p className="text-sm text-muted-foreground font-semibold">العائد المتوقع</p>
                    <span
                      className={`inline-flex items-center gap-1 text-base font-bold tabular-nums ${
                        plan.expectedReturn > 0
                          ? "text-emerald-600"
                          : plan.expectedReturn < 0
                          ? "text-red-600"
                          : "text-muted-foreground"
                      }`}
                    >
                      {plan.expectedReturn > 0 ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : plan.expectedReturn < 0 ? (
                        <TrendingDown className="w-4 h-4" />
                      ) : (
                        <Minus className="w-4 h-4" />
                      )}
                      {plan.expectedReturn > 0 ? "+" : ""}
                      {plan.expectedReturn}%
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

interface CurrentSignalCardProps {
  signal: SignalResult | null;
  currentPrice: number | null;
}

export function CurrentSignalCard({ signal, currentPrice }: CurrentSignalCardProps) {
  if (!signal) {
    return (
      <Card className="rounded-2xl border-0 shadow-xl ring-1 ring-border/20 overflow-hidden h-full">
        <div className="h-1.5 bg-muted" />
        <div className="bg-gradient-to-r from-muted/50 to-muted/30 px-5 py-4 flex items-center gap-3 border-b border-border/30">
          <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
            <Minus className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-base font-bold">الإشارة الحالية</h3>
            <p className="text-sm text-muted-foreground">Current Signal</p>
          </div>
        </div>
        <CardContent className="p-5">
          <div className="text-center py-4">
            {currentPrice ? (
              <>
                <p className="text-muted-foreground text-sm">
                  السعر الحالي:{" "}
                  <span className="font-mono font-black text-foreground text-xl tabular-nums">
                    {currentPrice.toLocaleString()} EGP/g
                  </span>
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  لا توجد خطة مطابقة
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-base">
                لا توجد بيانات سعر متاحة
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const config = getActionConfig(signal.action);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 15 }}
      className="h-full"
    >
      <Card className={`rounded-2xl border-0 shadow-xl ring-2 ${config.border} overflow-hidden h-full`}>
        {/* Top gradient bar */}
        <div className={`h-1.5 bg-gradient-to-r ${config.gradient}`} />
        <div className="bg-gradient-to-r from-muted/30 to-transparent px-5 py-4 flex items-center gap-3 border-b border-border/30">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-md shadow-amber-400/20">
            <Target className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold">الإشارة الحالية</h3>
            <p className="text-sm text-muted-foreground">Current Signal</p>
          </div>
        </div>
        <CardContent className="p-5">
          <div className="flex flex-col gap-4">
            <div className={`${config.badgeBg} text-white text-base font-bold px-4 py-2.5 rounded-xl shadow-md flex items-center gap-2 justify-center`} dir="rtl">
              {config.icon}
              {signal.action}
            </div>
            <div className="text-center">
              <p className="text-3xl font-black font-mono text-foreground tabular-nums">
                {currentPrice?.toLocaleString()}
                <span className="text-base text-muted-foreground font-medium ml-1">EGP/g</span>
              </p>
              <p
                className={`text-base font-bold mt-2 ${
                  signal.expectedReturn > 0
                    ? "text-emerald-600"
                    : signal.expectedReturn < 0
                    ? "text-red-600"
                    : "text-muted-foreground"
                }`}
              >
                العائد: {signal.expectedReturn > 0 ? "+" : ""}
                {signal.expectedReturn}%
              </p>
            </div>
            <p className="text-sm text-muted-foreground text-center" dir="rtl">
              {signal.label}
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
