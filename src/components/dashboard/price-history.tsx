"use client";

import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Gem, DollarSign, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { PriceRecord, PriceHistoryResponse } from "@/lib/dashboard-types";

const chartConfig: ChartConfig = {
  price: {
    label: "Price",
    color: "#f59e0b",
  },
};

interface PriceHistoryTabProps {
  priceHistory: PriceHistoryResponse;
  loading: boolean;
  onFetchHistory: (symbol: string, days: number) => Promise<PriceHistoryResponse | null>;
}

export function PriceHistoryTab({
  priceHistory,
  loading,
  onFetchHistory,
}: PriceHistoryTabProps) {
  const [symbol, setSymbol] = useState("GOLD_EGP");
  const [days, setDays] = useState(30);

  const loadData = useCallback(async () => {
    await onFetchHistory(symbol, days);
  }, [symbol, days, onFetchHistory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const chartData = [...priceHistory.records]
    .reverse()
    .map((r: PriceRecord) => ({
      date: new Date(r.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      price: r.price,
    }));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-muted/30 rounded-2xl p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Symbol</span>
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger className="w-40 rounded-xl h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GOLD_EGP">
                <span className="flex items-center gap-2">
                  <Gem className="w-3.5 h-3.5 text-amber-500" />
                  Gold 21K
                </span>
              </SelectItem>
              <SelectItem value="USD_EGP">
                <span className="flex items-center gap-2">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                  USD/EGP
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Period</span>
          <div className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <Button
                key={d}
                variant={days === d ? "default" : "outline"}
                size="sm"
                onClick={() => setDays(d)}
                className={`rounded-xl h-8 text-xs font-bold ${
                  days === d
                    ? "bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20"
                    : "hover:bg-amber-50 dark:hover:bg-amber-950/30"
                }`}
              >
                {d}d
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <Card className="rounded-2xl border-0 shadow-md ring-1 ring-border/30 overflow-hidden">
        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 px-5 py-3 flex items-center gap-2 border-b border-border/30">
          <Gem className="w-4 h-4 text-amber-600" />
          <h3 className="font-bold text-sm">
            Price History — {symbol === "GOLD_EGP" ? "Gold 21K" : "USD/EGP"}
          </h3>
        </div>
        <CardContent className="p-4">
          {loading ? (
            <Skeleton className="h-64 w-full rounded-xl" />
          ) : chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center">
              <p className="text-muted-foreground text-sm">
                No historical data available. Fetch prices to see the chart.
              </p>
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-64 w-full">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  domain={["auto", "auto"]}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="var(--color-price)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: "#f59e0b" }}
                />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Recent Records */}
      <Card className="rounded-2xl border-0 shadow-md ring-1 ring-border/30 overflow-hidden">
        <div className="bg-gradient-to-r from-muted/50 to-muted/30 px-5 py-3 flex items-center justify-between border-b border-border/30">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-bold text-sm">Recent Records</h3>
          </div>
          <Badge variant="outline" className="rounded-lg text-[10px]">
            {priceHistory.count} total
          </Badge>
        </div>
        <CardContent className="p-0">
          <ScrollArea className="max-h-72">
            <div className="divide-y divide-border/30">
              {priceHistory.records.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No records found
                </div>
              ) : (
                priceHistory.records.map((record: PriceRecord) => {
                  const change = record.change ?? 0;
                  const isPositive = change >= 0;
                  return (
                    <div
                      key={record.id}
                      className="flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${isPositive ? "bg-emerald-500" : "bg-red-500"}`} />
                        <div>
                          <p className="text-sm font-semibold tabular-nums">
                            {record.price.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            <span className="text-xs text-muted-foreground">{record.currency}</span>
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(record.createdAt).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {record.source && ` • ${record.source}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {record.buyPrice && record.sellPrice && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {record.buyPrice.toLocaleString()}/{record.sellPrice.toLocaleString()}
                          </span>
                        )}
                        <span
                          className={`flex items-center gap-0.5 text-xs font-bold tabular-nums ${
                            isPositive ? "text-emerald-600" : "text-red-600"
                          }`}
                        >
                          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {isPositive ? "+" : ""}{change.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
