"use client";

import { Heart } from "lucide-react";

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
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* Automation Status */}
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

          {/* Made With ❤️ By Omda */}
          <div dir="ltr" className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-medium">Made With</span>
            <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500 animate-pulse" />
            <span className="text-xs text-muted-foreground font-medium">By</span>
            <span className="text-xs font-extrabold bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 bg-clip-text text-transparent">
              Omda
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
