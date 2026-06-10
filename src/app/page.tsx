"use client";

import { useState, useCallback } from "react";
import { LayoutDashboard, BarChart3, Settings, Bell, Play, Calculator } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

import { useDashboardData } from "@/hooks/use-dashboard";
import { DashboardHeader } from "@/components/dashboard/header";
import { PriceCards } from "@/components/dashboard/price-cards";
import {
  InvestmentPlanTable,
  CurrentSignalCard,
} from "@/components/dashboard/investment-plan";
import { PriceHistoryTab } from "@/components/dashboard/price-history";
import { SettingsTab } from "@/components/dashboard/settings";
import { LogsTab } from "@/components/dashboard/logs";
import { GoldCalculator } from "@/components/dashboard/gold-calculator";
import { DashboardFooter } from "@/components/dashboard/footer";

export default function Home() {
  const {
    prices,
    plans,
    logs,
    config,
    priceHistory,
    signal,
    calculatorData,
    loading,
    lastAutomationRun,
    fetchLogs,
    fetchPriceHistory,
    triggerFetchPrices,
    updateConfig,
    testTelegram,
    seedPlan,
    savePlans,
    runAutomation,
    fetchCalculatorData,
  } = useDashboardData();

  const [activeTab, setActiveTab] = useState("dashboard");

  const handleFetchPrices = useCallback(async () => {
    try {
      const result = await triggerFetchPrices();
      if (result) {
        toast.success("تم جلب الأسعار بنجاح");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "فشل في جلب الأسعار"
      );
    }
  }, [triggerFetchPrices]);

  const handleRunAutomation = useCallback(async () => {
    try {
      const result = await runAutomation();
      if (result) {
        toast.success("تم تشغيل الأتمتة بنجاح");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "فشل تشغيل الأتمتة"
      );
    }
  }, [runAutomation]);

  const automationEnabled = config?.AUTOMATION_ENABLED === "true";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <DashboardHeader automationEnabled={automationEnabled} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-4"
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <TabsList className="w-full sm:w-auto flex-wrap">
              <TabsTrigger value="dashboard" className="gap-1.5">
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </TabsTrigger>
              <TabsTrigger value="calculator" className="gap-1.5">
                <Calculator className="w-3.5 h-3.5" />
                <span>حاسبة الذهب</span>
              </TabsTrigger>
              <TabsTrigger value="prices" className="gap-1.5">
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Prices</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5">
                <Settings className="w-3.5 h-3.5" />
                <span>Settings</span>
              </TabsTrigger>
              <TabsTrigger value="logs" className="gap-1.5">
                <Bell className="w-3.5 h-3.5" />
                <span>Logs</span>
              </TabsTrigger>
            </TabsList>

            {activeTab === "dashboard" && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunAutomation}
                disabled={loading.automation}
                className="gap-1.5 border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
              >
                <Play
                  className={`w-3.5 h-3.5 ${
                    loading.automation ? "animate-pulse" : ""
                  }`}
                />
                Run Automation
              </Button>
            )}
          </div>

          {/* TAB 1: Dashboard */}
          <TabsContent value="dashboard" className="space-y-4">
            <PriceCards
              prices={prices}
              loading={loading.prices}
              fetching={loading.fetching}
              onFetchPrices={handleFetchPrices}
            />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <InvestmentPlanTable
                  plans={plans}
                  signal={signal}
                  currentPrice={prices.gold?.price ?? null}
                />
              </div>
              <div>
                <CurrentSignalCard
                  signal={signal}
                  currentPrice={prices.gold?.price ?? null}
                />
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: Gold & Silver Calculator */}
          <TabsContent value="calculator">
            <GoldCalculator
              calculatorData={calculatorData}
              loading={loading.calculator}
              onFetch={fetchCalculatorData}
            />
          </TabsContent>

          {/* TAB 3: Prices */}
          <TabsContent value="prices">
            <PriceHistoryTab
              priceHistory={priceHistory}
              loading={loading.history}
              onFetchHistory={fetchPriceHistory}
            />
          </TabsContent>

          {/* TAB 4: Settings */}
          <TabsContent value="settings">
            <SettingsTab
              config={config}
              plans={plans}
              onUpdateConfig={updateConfig}
              onTestTelegram={testTelegram}
              onSeedPlan={seedPlan}
              onSavePlans={savePlans}
            />
          </TabsContent>

          {/* TAB 5: Logs */}
          <TabsContent value="logs">
            <LogsTab logs={logs} onFetchLogs={fetchLogs} />
          </TabsContent>
        </Tabs>
      </main>

      <DashboardFooter
        automationEnabled={automationEnabled}
        lastAutomationRun={lastAutomationRun}
      />
    </div>
  );
}
