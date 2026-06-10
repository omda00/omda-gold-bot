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
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { InvestmentPlan, SignalResult } from "@/lib/dashboard-types";

function getActionConfig(action: string) {
  if (action.includes("شراء قوي")) {
    return {
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      gradient: "from-emerald-400 to-emerald-500",
      iconBg: "bg-emerald-500",
      border: "ring-emerald-400/40",
      icon: <ShoppingCart className="w-3.5 h-3.5" />,
      label: "Strong Buy",
      textColor: "text-emerald-700 dark:text-emerald-400",
    };
  }
  if (action.includes("شراء")) {
    return {
      bg: "bg-green-50 dark:bg-green-950/30",
      gradient: "from-green-400 to-green-500",
      iconBg: "bg-green-500",
      border: "ring-green-400/40",
      icon: <TrendingUp className="w-3.5 h-3.5" />,
      label: "Buy",
      textColor: "text-green-700 dark:text-green-400",
    };
  }
  if (action.includes("انتظار")) {
    return {
      bg: "bg-amber-50 dark:bg-amber-950/30",
      gradient: "from-amber-400 to-amber-500",
      iconBg: "bg-amber-500",
      border: "ring-amber-400/40",
      icon: <Clock className="w-3.5 h-3.5" />,
      label: "Wait",
      textColor: "text-amber-700 dark:text-amber-400",
    };
  }
  return {
    bg: "bg-red-50 dark:bg-red-950/30",
    gradient: "from-red-400 to-red-500",
    iconBg: "bg-red-500",
    border: "ring-red-400/40",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
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
    <Card className="rounded-2xl border-0 shadow-md ring-1 ring-border/30 overflow-hidden">
      <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 px-5 py-3 flex items-center gap-2 border-b border-border/30">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-md shadow-amber-400/20">
          <Gem className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="font-bold text-sm">Investment Plan</h3>
          <p className="text-[10px] text-muted-foreground" dir="rtl">خطة الاستثمار - الذهب</p>
        </div>
      </div>
      <CardContent className="p-4">
        <div className="space-y-2.5">
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
                className={`rounded-xl p-3 ring-1 ${config.border} ${config.bg} ${
                  isActive ? "ring-2 shadow-md" : ""
                } transition-all hover:shadow-sm`}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  {/* Left: Range + Action */}
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg ${config.iconBg} flex items-center justify-center text-white`}>
                      {config.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge className={`${config.iconBg} hover:${config.iconBg} text-white gap-1 text-[10px] px-2 py-0.5 rounded-lg`}>
                          <span dir="rtl">{plan.action}</span>
                        </Badge>
                        {isActive && (
                          <Badge variant="outline" className="border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 text-[10px] px-2 py-0.5 rounded-lg">
                            Active
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono tabular-nums">
                        {plan.priceRangeMin.toLocaleString()} - {plan.priceRangeMax ? plan.priceRangeMax.toLocaleString() : "∞"} EGP
                      </p>
                    </div>
                  </div>

                  {/* Right: Return */}
                  <div className="text-left">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Expected</p>
                    <span
                      className={`inline-flex items-center gap-0.5 text-sm font-bold tabular-nums ${
                        plan.expectedReturn > 0
                          ? "text-emerald-600"
                          : plan.expectedReturn < 0
                          ? "text-red-600"
                          : "text-muted-foreground"
                      }`}
                    >
                      {plan.expectedReturn > 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : plan.expectedReturn < 0 ? (
                        <TrendingDown className="w-3 h-3" />
                      ) : (
                        <Minus className="w-3 h-3" />
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
      <Card className="rounded-2xl border-0 shadow-md ring-1 ring-border/30 overflow-hidden">
        <div className="bg-gradient-to-r from-muted/50 to-muted/30 px-5 py-3 flex items-center gap-2 border-b border-border/30">
          <div className="w-8 h-8 rounded-xl bg-muted/50 flex items-center justify-center">
            <Minus className="w-4 h-4 text-muted-foreground" />
          </div>
          <h3 className="font-bold text-sm">Current Signal</h3>
        </div>
        <CardContent className="p-5">
          <div className="text-center py-4">
            {currentPrice ? (
              <>
                <p className="text-muted-foreground text-sm">
                  Current price:{" "}
                  <span className="font-mono font-bold text-foreground text-lg tabular-nums">
                    {currentPrice.toLocaleString()} EGP/g
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  No matching plan tier found
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                No price data available
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
    >
      <Card className={`rounded-2xl border-0 shadow-lg ring-2 ${config.border} overflow-hidden`}>
        {/* Top gradient bar */}
        <div className={`h-1.5 bg-gradient-to-r ${config.gradient}`} />
        <div className="bg-gradient-to-r from-muted/30 to-transparent px-5 py-3 flex items-center gap-2 border-b border-border/30">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-md shadow-amber-400/20">
            <Target className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-sm">Current Signal</h3>
            <p className="text-[10px] text-muted-foreground" dir="rtl">الإشارة الحالية</p>
          </div>
        </div>
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <Badge className={`${config.iconBg} hover:${config.iconBg} text-white gap-1.5 text-sm px-3 py-1 rounded-xl`}>
                {config.icon}
                <span dir="rtl">{signal.action}</span>
              </Badge>
              <p className="text-xs text-muted-foreground mt-2" dir="rtl">
                {signal.label}
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black font-mono text-foreground tabular-nums">
                {currentPrice?.toLocaleString()}
                <span className="text-sm text-muted-foreground font-medium ml-1">EGP/g</span>
              </p>
              <p
                className={`text-sm font-bold mt-1 ${
                  signal.expectedReturn > 0
                    ? "text-emerald-600"
                    : signal.expectedReturn < 0
                    ? "text-red-600"
                    : "text-muted-foreground"
                }`}
              >
                Expected: {signal.expectedReturn > 0 ? "+" : ""}
                {signal.expectedReturn}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
