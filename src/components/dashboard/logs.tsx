"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import type { NotificationLog } from "@/lib/dashboard-types";

const LOG_TYPE_LABELS: Record<string, string> = {
  daily_report: "Daily Report",
  buy_signal: "Buy Signal",
  sell_signal: "Sell Signal",
  usd_drop_alert: "USD Drop",
  test: "Test",
  custom: "Custom",
};

const LOG_TYPE_COLORS: Record<string, string> = {
  daily_report: "bg-blue-600 text-white",
  buy_signal: "bg-emerald-600 text-white",
  sell_signal: "bg-red-600 text-white",
  usd_drop_alert: "bg-amber-600 text-white",
  test: "bg-purple-600 text-white",
  custom: "bg-gray-600 text-white",
};

interface LogsTabProps {
  logs: NotificationLog[];
  onFetchLogs: (type?: string, limit?: number) => Promise<unknown>;
}

export function LogsTab({ logs, onFetchLogs }: LogsTabProps) {
  const [filter, setFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  const refreshLogs = useCallback(async () => {
    setRefreshing(true);
    try {
      await onFetchLogs(filter === "all" ? undefined : filter, 50);
    } finally {
      setRefreshing(false);
    }
  }, [filter, onFetchLogs]);

  useEffect(() => {
    const interval = setInterval(() => {
      onFetchLogs(filter === "all" ? undefined : filter, 50);
    }, 30000);
    return () => clearInterval(interval);
  }, [filter, onFetchLogs]);

  useEffect(() => {
    onFetchLogs(filter === "all" ? undefined : filter, 50);
  }, [filter, onFetchLogs]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="daily_report">Daily Report</SelectItem>
              <SelectItem value="buy_signal">Buy Signal</SelectItem>
              <SelectItem value="sell_signal">Sell Signal</SelectItem>
              <SelectItem value="usd_drop_alert">USD Drop Alert</SelectItem>
              <SelectItem value="test">Test</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshLogs}
          disabled={refreshing}
          className="gap-1.5"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Logs Table */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bell className="w-4 h-4 text-emerald-600" />
            Notification Logs
            <Badge variant="outline" className="ml-1">
              {logs.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="hidden sm:table-cell">Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground py-8"
                    >
                      No notification logs found
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(log.sentAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-xs ${
                            LOG_TYPE_COLORS[log.type] || "bg-gray-600 text-white"
                          }`}
                        >
                          {LOG_TYPE_LABELS[log.type] || log.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {log.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                      </TableCell>
                      <TableCell className="text-sm max-w-32 truncate">
                        {log.title}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-48 truncate hidden sm:table-cell">
                        {log.error ? (
                          <span className="text-red-500">{log.error}</span>
                        ) : (
                          <span className="line-clamp-1">
                            {log.message.replace(/<[^>]*>/g, "")}
                          </span>
                        )}
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
