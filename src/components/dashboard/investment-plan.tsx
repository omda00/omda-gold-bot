"use client";

import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ShoppingCart,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { InvestmentPlan, SignalResult } from "@/lib/dashboard-types";

function getActionConfig(action: string) {
  if (action.includes("شراء قوي")) {
    return {
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      badge: "bg-emerald-600 hover:bg-emerald-700 text-white",
      border: "border-emerald-200 dark:border-emerald-800",
      icon: <ShoppingCart className="w-3.5 h-3.5" />,
      label: "Strong Buy",
    };
  }
  if (action.includes("شراء")) {
    return {
      bg: "bg-green-50 dark:bg-green-950/30",
      badge: "bg-green-600 hover:bg-green-700 text-white",
      border: "border-green-200 dark:border-green-800",
      icon: <TrendingUp className="w-3.5 h-3.5" />,
      label: "Buy",
    };
  }
  if (action.includes("انتظار")) {
    return {
      bg: "bg-amber-50 dark:bg-amber-950/30",
      badge: "bg-amber-600 hover:bg-amber-700 text-white",
      border: "border-amber-200 dark:border-amber-800",
      icon: <Clock className="w-3.5 h-3.5" />,
      label: "Wait",
    };
  }
  return {
    bg: "bg-red-50 dark:bg-red-950/30",
    badge: "bg-red-600 hover:bg-red-700 text-white",
    border: "border-red-200 dark:border-red-800",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    label: "Sell",
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
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          Investment Plan
          <span className="text-muted-foreground font-normal text-xs" dir="rtl">
            خطة الاستثمار
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Price Range (SAR)</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="text-center">Return</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activePlans.map((plan, index) => {
                const config = getActionConfig(plan.action);
                const isActive =
                  signal &&
                  signal.action === plan.action &&
                  signal.priceRangeMin === plan.priceRangeMin;

                return (
                  <TableRow
                    key={plan.id}
                    className={`${config.bg} ${config.border} ${
                      isActive ? "ring-2 ring-emerald-500 ring-offset-1" : ""
                    } transition-all`}
                  >
                    <TableCell className="text-center font-mono text-xs text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {plan.priceRangeMin.toLocaleString()} -{" "}
                      {plan.priceRangeMax
                        ? plan.priceRangeMax.toLocaleString()
                        : "∞"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`${config.badge} gap-1 text-xs`}
                      >
                        {config.icon}
                        <span dir="rtl">{plan.action}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`inline-flex items-center gap-0.5 text-sm font-semibold ${
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
                    </TableCell>
                    <TableCell className="text-center">
                      {isActive ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 text-xs"
                        >
                          Active
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Minus className="w-4 h-4 text-muted-foreground" />
            Current Signal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            {currentPrice ? (
              <>
                <p className="text-muted-foreground text-sm">
                  Current price: <span className="font-mono font-semibold text-foreground">{currentPrice.toLocaleString()} SAR</span>
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
      <Card className={`border-2 ${config.border} shadow-md overflow-hidden`}>
        <div className={`h-1.5 ${config.badge}`} />
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            Current Signal
            <span className="text-muted-foreground font-normal text-xs" dir="rtl">
              الإشارة الحالية
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <Badge className={`${config.badge} gap-1.5 text-sm px-3 py-1`}>
                {config.icon}
                <span dir="rtl">{signal.action}</span>
              </Badge>
              <p className="text-xs text-muted-foreground mt-2" dir="rtl">
                {signal.label}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold font-mono text-foreground">
                {currentPrice?.toLocaleString()} <span className="text-sm text-muted-foreground">SAR</span>
              </p>
              <p
                className={`text-sm font-semibold ${
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
