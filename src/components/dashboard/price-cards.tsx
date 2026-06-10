"use client";

import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  DollarSign,
  Gem,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  onFetch: () => void;
  showFetchButton?: boolean;
}

function PriceCard({
  title,
  subtitle,
  icon,
  price,
  loading,
  fetching,
  onFetch,
  showFetchButton = false,
}: PriceCardProps) {
  const change = price?.change ?? 0;
  const isPositive = change >= 0;

  if (loading) {
    return (
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-32 mb-2" />
          <Skeleton className="h-4 w-20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div
          className={`h-1 ${
            price
              ? isPositive
                ? "bg-emerald-500"
                : "bg-red-500"
              : "bg-muted"
          }`}
        />
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              {icon}
              <div>
                <div>{title}</div>
                <div className="text-xs text-muted-foreground/70" dir="rtl">
                  {subtitle}
                </div>
              </div>
            </CardTitle>
            {showFetchButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onFetch}
                disabled={fetching}
                className="h-7 gap-1 text-xs"
              >
                <RefreshCw
                  className={`w-3 h-3 ${fetching ? "animate-spin" : ""}`}
                />
                Fetch
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {price ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-foreground tracking-tight">
                  {price.price.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="text-sm font-medium text-muted-foreground">
                  {price.currency}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div
                  className={`flex items-center gap-0.5 text-sm font-medium ${
                    isPositive ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {isPositive ? (
                    <TrendingUp className="w-3.5 h-3.5" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isPositive ? "+" : ""}
                    {change.toFixed(2)}%
                  </span>
                </div>
                {price.source && (
                  <span className="text-xs text-muted-foreground">
                    via {price.source}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Updated:{" "}
                {new Date(price.createdAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </>
          ) : (
            <div className="py-4">
              <p className="text-muted-foreground text-sm">No data available</p>
              {showFetchButton && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onFetch}
                  disabled={fetching}
                  className="mt-2 gap-1"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${fetching ? "animate-spin" : ""}`}
                  />
                  Fetch Price
                </Button>
              )}
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
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <PriceCard
        title="Gold 21K"
        subtitle="ذهب عيار ٢١ في مصر"
        icon={<Gem className="w-4 h-4 text-amber-500" />}
        price={prices.gold}
        loading={loading}
        fetching={fetching}
        onFetch={onFetchPrices}
        showFetchButton
      />
      <PriceCard
        title="USD/EGP Rate"
        subtitle="سعر الدولار مقابل الجنيه"
        icon={<DollarSign className="w-4 h-4" />}
        price={prices.usdEgp}
        loading={loading}
        fetching={fetching}
        onFetch={onFetchPrices}
      />
    </div>
  );
}
