"use client";

import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Gem, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PriceRecord, PriceHistoryResponse } from "@/lib/dashboard-types";

const chartConfig: ChartConfig = {
  price: {
    label: "Price",
    color: "#10b981",
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
  const [symbol, setSymbol] = useState("ARAMCO");
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
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Symbol:</span>
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GOLD_EGP">
                <span className="flex items-center gap-2">
                  <Gem className="w-3.5 h-3.5" />
                  Gold 21K
                </span>
              </SelectItem>
              <SelectItem value="USD_EGP">
                <span className="flex items-center gap-2">
                  <DollarSign className="w-3.5 h-3.5" />
                  USD/EGP
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Period:</span>
          <div className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <Button
                key={d}
                variant={days === d ? "default" : "outline"}
                size="sm"
                onClick={() => setDays(d)}
                className={days === d ? "bg-emerald-600 hover:bg-emerald-700" : ""}
              >
                {d}d
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            Price History — {symbol}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center">
              <p className="text-muted-foreground text-sm">
                No historical data available. Fetch prices to see the chart.
              </p>
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-64 w-full">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
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
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Recent Records Table */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Recent Records
            <span className="text-muted-foreground font-normal text-xs ml-2">
              ({priceHistory.count} total)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-72">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {priceHistory.records.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-muted-foreground py-6"
                    >
                      No records found
                    </TableCell>
                  </TableRow>
                ) : (
                  priceHistory.records.map((record: PriceRecord) => (
                    <TableRow key={record.id}>
                      <TableCell className="text-xs">
                        {new Date(record.createdAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {record.price.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        {record.currency}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`text-xs font-medium ${
                            (record.change ?? 0) >= 0
                              ? "text-emerald-600"
                              : "text-red-600"
                          }`}
                        >
                          {(record.change ?? 0) >= 0 ? "+" : ""}
                          {(record.change ?? 0).toFixed(2)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {record.source || "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
