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
        const fetched = result.fetched;
        if (fetched?.gold && fetched?.usdEgp) {
          toast.success("تم تحديث أسعار الذهب والدولار بنجاح", { duration: 3000 });
        } else if (fetched?.gold || fetched?.usdEgp) {
          toast.success("تم جلب بعض الأسعار — يتم عرض آخر الأسعار المتاحة", { duration: 4000 });
        } else {
          toast.info("لم يتم جلب أسعار جديدة — يتم عرض آخر الأسعار المخزنة", { duration: 4000 });
        }
      } else {
        // null result means a fetch is already in progress or DB was refreshed
        toast.info("جارِ التحديث بالفعل — يتم عرض آخر الأسعار المتاحة", { duration: 2000 });
      }
    } catch {
      toast.error("حدث خطأ في الاتصال — يتم عرض آخر الأسعار المتاحة", { duration: 5000 });
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
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-amber-50/10 dark:to-amber-950/5">
      <DashboardHeader automationEnabled={automationEnabled} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-4"
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <TabsList className="bg-muted/40 backdrop-blur-sm rounded-2xl p-1 h-auto flex-wrap">
              <TabsTrigger
                value="dashboard"
                className="gap-2 rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-400 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-amber-400/20 px-4 py-2 text-sm font-bold transition-all"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>لوحة التحكم</span>
              </TabsTrigger>
              <TabsTrigger
                value="calculator"
                className="gap-2 rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-400 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-amber-400/20 px-4 py-2 text-sm font-bold transition-all"
              >
                <Calculator className="w-4 h-4" />
                <span>حاسبة الذهب</span>
              </TabsTrigger>
              <TabsTrigger
                value="prices"
                className="gap-2 rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-400 data-[state=active]:to-green-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-emerald-400/20 px-4 py-2 text-sm font-bold transition-all"
              >
                <BarChart3 className="w-4 h-4" />
                <span>الأسعار</span>
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="gap-2 rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-400 data-[state=active]:to-blue-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-sky-400/20 px-4 py-2 text-sm font-bold transition-all"
              >
                <Settings className="w-4 h-4" />
                <span>الإعدادات</span>
              </TabsTrigger>
              <TabsTrigger
                value="logs"
                className="gap-2 rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-400 data-[state=active]:to-violet-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-purple-400/20 px-4 py-2 text-sm font-bold transition-all"
              >
                <Bell className="w-4 h-4" />
                <span>السجلات</span>
              </TabsTrigger>
            </TabsList>

            {activeTab === "dashboard" && (
              <Button
                variant="outline"
                size="default"
                onClick={handleRunAutomation}
                disabled={loading.automation}
                className="gap-2 rounded-xl border-emerald-300 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-950/30 h-10 text-sm font-bold"
              >
                <Play
                  className={`w-4 h-4 ${
                    loading.automation ? "animate-pulse" : ""
                  }`}
                />
                تشغيل الأتمتة
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

          {/* TAB 2: Gold Calculator */}
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
