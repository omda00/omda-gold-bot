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
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-sm">
              <Zap className="w-3 h-3 text-white" />
            </div>
            <span className="font-bold text-foreground text-xs">Powered by Z.ai</span>
          </div>
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  automationEnabled
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-red-500"
                }`}
              />
              <span className="font-semibold text-xs">
                الأتمتة {automationEnabled ? "مفعلة" : "متوقفة"}
              </span>
            </div>
            {lastAutomationRun && (
              <span className="bg-muted/40 px-2 py-0.5 rounded text-[10px] font-medium">
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
