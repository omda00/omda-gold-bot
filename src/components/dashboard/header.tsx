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
        now.toLocaleDateString("ar-EG", {
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
    <header className="sticky top-0 z-50 border-b border-border/30 bg-background/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-500 shadow-lg shadow-amber-400/25">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-background animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-foreground tracking-tight">
                منصة متابعة الذهب والعملات
              </h1>
              <p className="text-sm text-muted-foreground font-medium">
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
                    ? "bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5 rounded-lg px-3 py-1 text-sm font-bold"
                    : "gap-1.5 rounded-lg px-3 py-1 text-sm font-bold"
                }
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    automationEnabled ? "bg-white animate-pulse" : "bg-white"
                  }`}
                />
                {automationEnabled ? "نشط" : "متوقف"}
              </Badge>
            </div>
            <div className="text-right hidden sm:block bg-muted/40 rounded-xl px-4 py-2">
              <p className="text-sm text-muted-foreground font-medium">{currentDate}</p>
              <p className="text-base font-mono font-bold text-foreground tabular-nums">
                {currentTime}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
