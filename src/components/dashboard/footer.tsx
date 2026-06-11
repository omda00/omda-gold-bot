"use client";

import { Zap } from "lucide-react";

interface DashboardFooterProps {
  automationEnabled: boolean;
  lastAutomationRun: string | null;
}

export function DashboardFooter({
  automationEnabled,
  lastAutomationRun,
}: DashboardFooterProps) {
  return (
    <footer className="border-t border-border/30 bg-background/80 backdrop-blur-xl mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-sm">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-foreground text-sm">Powered by Z.ai</span>
          </div>
          <div className="flex items-center gap-4 text-muted-foreground">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  automationEnabled
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-red-500"
                }`}
              />
              <span className="font-semibold text-sm">
                الأتمتة {automationEnabled ? "مفعلة" : "متوقفة"}
              </span>
            </div>
            {lastAutomationRun && (
              <span className="bg-muted/40 px-3 py-1 rounded-lg text-sm font-medium">
                آخر تشغيل:{" "}
                {new Date(lastAutomationRun).toLocaleString("ar-EG", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
