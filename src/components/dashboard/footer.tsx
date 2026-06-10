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
    <footer className="border-t border-border/50 bg-card/80 backdrop-blur-sm mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-emerald-600" />
            <span className="font-medium text-foreground">Powered by Z.ai</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  automationEnabled
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-red-500"
                }`}
              />
              <span>
                Automation: {automationEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            {lastAutomationRun && (
              <span>
                Last run:{" "}
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
