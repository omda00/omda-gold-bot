"use client";

import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Gem, DollarSign, Calendar, TrendingUp, TrendingDown, Filter } from "lucide-react";
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
import type { PriceRecord, PriceHistoryResponse } from "@/lib/dashboard-types";

const chartConfig: ChartConfig = {
  price: {
    label: "السعر",
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
      date: new Date(r.createdAt).toLocaleDateString("ar-EG", {
        month: "short",
        day: "numeric",
      }),
      price: r.price,
    }));

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-muted/30 rounded-xl p-3 ring-1 ring-border/20">
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-bold text-muted-foreground">النوع</span>
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger className="w-36 rounded-lg h-8 text-xs font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GOLD_EGP">
                <span className="flex items-center gap-2">
                  <Gem className="w-4 h-4 text-amber-500" />
                  Gold 21K
                </span>
              </SelectItem>
              <SelectItem value="USD_EGP">
                <span className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                  USD/EGP
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-bold text-muted-foreground">الفترة</span>
          <div className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <Button
                key={d}
                variant={days === d ? "default" : "outline"}
                size="sm"
                onClick={() => setDays(d)}
                className={`rounded-lg h-7 text-xs font-bold px-3 ${
                  days === d
                    ? "bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white shadow-sm shadow-amber-500/20"
                    : "hover:bg-amber-50 dark:hover:bg-amber-950/30"
                }`}
              >
                {d} يوم
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <Card className="rounded-2xl border-0 shadow-lg ring-1 ring-border/20 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500" />
        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 px-4 py-3 flex items-center gap-2.5 border-b border-border/30">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-sm">
            <Gem className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold">
              تاريخ الأسعار — {symbol === "GOLD_EGP" ? "ذهب عيار ٢١" : "USD/EGP"}
            </h3>
            <p className="text-xs text-muted-foreground">Price History</p>
          </div>
        </div>
        <CardContent className="p-4">
          {loading ? (
            <Skeleton className="h-64 w-full rounded-xl" />
          ) : chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center">
              <p className="text-muted-foreground text-sm">
                لا توجد بيانات تاريخية متاحة. قم بجلب الأسعار لعرض الرسم البياني.
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
                  fontSize={12}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
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
      <Card className="rounded-2xl border-0 shadow-lg ring-1 ring-border/20 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-700" />
        <div className="bg-gradient-to-r from-muted/50 to-muted/30 px-4 py-3 flex items-center justify-between border-b border-border/30">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center shadow-sm">
              <Calendar className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold">السجلات الأخيرة</h3>
              <p className="text-xs text-muted-foreground">Recent Records</p>
            </div>
          </div>
          <Badge variant="outline" className="rounded-lg text-xs px-2 py-0.5 font-bold">
            {priceHistory.count} سجل
          </Badge>
        </div>
        <CardContent className="p-0">
          <ScrollArea className="max-h-72">
            <div className="divide-y divide-border/30">
              {priceHistory.records.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  لا توجد سجلات
                </div>
              ) : (
                priceHistory.records.map((record: PriceRecord) => {
                  const change = record.change ?? 0;
                  const isPositive = change >= 0;
                  return (
                    <div
                      key={record.id}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full ${isPositive ? "bg-emerald-500" : "bg-red-500"}`} />
                        <div>
                          <p className="text-sm font-bold tabular-nums">
                            {record.price.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            <span className="text-xs text-muted-foreground font-semibold">{record.currency}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(record.createdAt).toLocaleString("ar-EG", {
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
                          <span className="text-xs text-muted-foreground font-mono font-semibold">
                            {record.buyPrice.toLocaleString()}/{record.sellPrice.toLocaleString()}
                          </span>
                        )}
                        <span
                          className={`flex items-center gap-1 text-sm font-bold tabular-nums ${
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
