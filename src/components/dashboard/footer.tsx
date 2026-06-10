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
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center">
              <Zap className="w-3 h-3 text-white" />
            </div>
            <span className="font-bold text-foreground text-[11px]">Powered by Z.ai</span>
          </div>
          <div className="flex items-center gap-4 text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  automationEnabled
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-red-500"
                }`}
              />
              <span className="font-medium">
                Automation {automationEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            {lastAutomationRun && (
              <span className="bg-muted/40 px-2 py-0.5 rounded-lg">
                Last:{" "}
                {new Date(lastAutomationRun).toLocaleString("en-US", {
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
