"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Filter,
  Clock,
  MessageSquare,
  TrendingUp,
  AlertTriangle,
  TestTube,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { NotificationLog } from "@/lib/dashboard-types";

const LOG_TYPE_CONFIG: Record<string, { label: string; labelAr: string; gradient: string; icon: React.ReactNode }> = {
  daily_report: {
    label: "Daily Report",
    labelAr: "تقرير يومي",
    gradient: "from-sky-400 to-blue-500",
    icon: <MessageSquare className="w-3.5 h-3.5" />,
  },
  buy_signal: {
    label: "Buy Signal",
    labelAr: "إشارة شراء",
    gradient: "from-emerald-400 to-green-500",
    icon: <TrendingUp className="w-3.5 h-3.5" />,
  },
  sell_signal: {
    label: "Sell Signal",
    labelAr: "إشارة بيع",
    gradient: "from-red-400 to-rose-500",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  usd_drop_alert: {
    label: "USD Drop",
    labelAr: "انخفاض الدولار",
    gradient: "from-amber-400 to-yellow-500",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  test: {
    label: "Test",
    labelAr: "اختبار",
    gradient: "from-purple-400 to-violet-500",
    icon: <TestTube className="w-3.5 h-3.5" />,
  },
  custom: {
    label: "Custom",
    labelAr: "مخصص",
    gradient: "from-gray-400 to-slate-500",
    icon: <Bell className="w-3.5 h-3.5" />,
  },
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
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex items-center justify-between flex-wrap gap-2 bg-muted/30 rounded-xl p-3 ring-1 ring-border/20">
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-bold text-muted-foreground">تصفية</span>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40 rounded-lg h-8 text-xs font-semibold">
              <SelectValue placeholder="تصفية حسب النوع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="daily_report">تقرير يومي</SelectItem>
              <SelectItem value="buy_signal">إشارة شراء</SelectItem>
              <SelectItem value="sell_signal">إشارة بيع</SelectItem>
              <SelectItem value="usd_drop_alert">انخفاض الدولار</SelectItem>
              <SelectItem value="test">اختبار</SelectItem>
              <SelectItem value="custom">مخصص</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshLogs}
          disabled={refreshing}
          className="gap-1.5 rounded-lg h-8"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
          <span className="text-xs font-semibold">تحديث</span>
        </Button>
      </div>

      {/* Logs Timeline */}
      <Card className="rounded-2xl border-0 shadow-lg ring-1 ring-border/20 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-purple-400 via-violet-400 to-purple-500" />
        <div className="bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-950/20 dark:to-violet-950/20 px-4 py-3 flex items-center justify-between border-b border-border/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-400 to-violet-500 flex items-center justify-center shadow-sm shadow-purple-400/20">
              <Bell className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold">سجل الإشعارات</h3>
              <p className="text-xs text-muted-foreground">Notification Logs</p>
            </div>
          </div>
          <Badge variant="outline" className="rounded-lg text-xs px-2 py-0.5 font-bold">
            {logs.length} إشعار
          </Badge>
        </div>
        <CardContent className="p-0">
          <ScrollArea className="max-h-96">
            {logs.length === 0 ? (
              <div className="text-center py-8">
                <Bell className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">لا توجد سجلات إشعارات</p>
              </div>
            ) : (
              <div className="divide-y divide-border/20">
                {logs.map((log) => {
                  const typeConfig = LOG_TYPE_CONFIG[log.type] || LOG_TYPE_CONFIG.custom;
                  return (
                    <div
                      key={log.id}
                      className="px-4 py-3 hover:bg-muted/30 transition-colors group"
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Type icon */}
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${typeConfig.gradient} flex items-center justify-center text-white shadow-sm shrink-0 mt-0.5`}>
                          {typeConfig.icon}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`bg-gradient-to-r ${typeConfig.gradient} text-white text-xs font-bold px-2 py-0.5 rounded border-0`}>
                              {typeConfig.labelAr}
                            </span>
                            {log.success ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-red-500" />
                            )}
                            <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                              <Clock className="w-3 h-3" />
                              {new Date(log.sentAt).toLocaleString("ar-EG", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-foreground mt-1 truncate">
                            {log.title}
                          </p>
                          {log.error ? (
                            <p className="text-xs text-red-500 mt-0.5 font-medium">{log.error}</p>
                          ) : (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {log.message.replace(/<[^>]*>/g, "")}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
