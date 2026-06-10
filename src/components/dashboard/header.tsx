"use client";

import { useEffect, useState } from "react";
import { Bot, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface DashboardHeaderProps {
  automationEnabled: boolean;
}

export function DashboardHeader({ automationEnabled }: DashboardHeaderProps) {
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
      setCurrentDate(
        now.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-600/10 border border-emerald-600/20">
              <Bot className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
                منصة متابعة الذهب والعملات
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground" dir="rtl">
                AI Workflow Automation — Gold & Currency Monitor
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <Badge
                variant={automationEnabled ? "default" : "destructive"}
                className={
                  automationEnabled
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                    : "gap-1"
                }
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    automationEnabled ? "bg-white animate-pulse" : "bg-white"
                  }`}
                />
                {automationEnabled ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-xs text-muted-foreground">{currentDate}</p>
              <p className="text-sm font-mono font-medium text-foreground">
                {currentTime}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
