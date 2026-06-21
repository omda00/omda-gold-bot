"use client";

import { useState, useCallback } from "react";
import { LayoutDashboard, BarChart3, Settings, Bell, Play, Calculator, Bot } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

import { useDashboardData } from "@/hooks/use-dashboard";
import { DashboardHeader } from "@/components/dashboard/header";
import { PriceCards } from "@/components/dashboard/price-cards";
import { PriceHistoryTab } from "@/components/dashboard/price-history";
import { SettingsTab } from "@/components/dashboard/settings";
import { LogsTab } from "@/components/dashboard/logs";
import { GoldCalculator } from "@/components/dashboard/gold-calculator";
import { BotRegistration } from "@/components/dashboard/bot-registration";
import { DashboardFooter } from "@/components/dashboard/footer";

export default function Home() {
  const {
    prices,
    logs,
    config,
    priceHistory,
    calculatorData,
    telegramUsers,
    loading,
    lastAutomationRun,
    isAdmin,
    checkingAuth,
    fetchLogs,
    fetchPriceHistory,
    triggerFetchPrices,
    updateConfig,
    testTelegram,
    runAutomation,
    fetchCalculatorData,
    addTelegramUser,
    deleteTelegramUser,
    toggleTelegramUser,
    testTelegramUser,
    adminLogin,
    adminLogout,
  } = useDashboardData();

  const [activeTab, setActiveTab] = useState("dashboard");

  const handleFetchPrices = useCallback(async () => {
    try {
      const result = await triggerFetchPrices();
      if (result) {
        toast.success("تم تحديث الأسعار بنجاح", { duration: 3000 });
      } else {
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

      <main className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-6 py-3 sm:py-5">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-3"
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <TabsList className="bg-muted/40 backdrop-blur-sm rounded-xl p-0.5 h-auto flex-wrap">
              <TabsTrigger
                value="dashboard"
                className="gap-1.5 rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-400 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:shadow-amber-400/20 px-3 py-1.5 text-xs font-bold transition-all"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>لوحة التحكم</span>
              </TabsTrigger>
              <TabsTrigger
                value="calculator"
                className="gap-1.5 rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-400 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:shadow-amber-400/20 px-3 py-1.5 text-xs font-bold transition-all"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>حاسبة الذهب</span>
              </TabsTrigger>
              <TabsTrigger
                value="prices"
                className="gap-1.5 rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-400 data-[state=active]:to-green-500 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:shadow-emerald-400/20 px-3 py-1.5 text-xs font-bold transition-all"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>الأسعار</span>
              </TabsTrigger>
              <TabsTrigger
                value="register-bot"
                className="gap-1.5 rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#229ED9] data-[state=active]:to-[#1a8bc4] data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:shadow-[#229ED9]/20 px-3 py-1.5 text-xs font-bold transition-all"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>بوت التيليجرام</span>
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="gap-1.5 rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-400 data-[state=active]:to-blue-500 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:shadow-sky-400/20 px-3 py-1.5 text-xs font-bold transition-all"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>الإعدادات</span>
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger
                  value="logs"
                  className="gap-1.5 rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-400 data-[state=active]:to-violet-500 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:shadow-purple-400/20 px-3 py-1.5 text-xs font-bold transition-all"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>السجلات</span>
                </TabsTrigger>
              )}
            </TabsList>

            {activeTab === "dashboard" && isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunAutomation}
                disabled={loading.automation}
                title="زر إداري — يظهر للمسؤول فقط لتشغيل دورة الأتمتة يدوياً (تحديث الأسعار + إرسال تقرير فوري للعملاء). لا يؤثر على الزوار العاديين."
                className="gap-1.5 rounded-xl border-emerald-300 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-950/30 h-8 text-xs font-bold"
              >
                <Play
                  className={`w-3.5 h-3.5 ${
                    loading.automation ? "animate-pulse" : ""
                  }`}
                />
                تشغيل الأتمتة
              </Button>
            )}
          </div>

          {/* TAB 1: Dashboard */}
          <TabsContent value="dashboard" className="space-y-3">
            <PriceCards
              prices={prices}
              loading={loading.prices}
              fetching={loading.fetching}
              onFetchPrices={handleFetchPrices}
            />
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

          {/* TAB 4: Telegram Bot (Public) */}
          <TabsContent value="register-bot">
            <BotRegistration />
          </TabsContent>

          {/* TAB 5: Settings (Admin) */}
          <TabsContent value="settings">
            <SettingsTab
              config={config}
              onUpdateConfig={updateConfig}
              onTestTelegram={testTelegram}
              telegramUsers={telegramUsers}
              onAddTelegramUser={addTelegramUser}
              onDeleteTelegramUser={deleteTelegramUser}
              onToggleTelegramUser={toggleTelegramUser}
              onTestTelegramUser={testTelegramUser}
              isAdmin={isAdmin}
              checkingAuth={checkingAuth}
              onAdminLogin={adminLogin}
              onAdminLogout={adminLogout}
            />
          </TabsContent>

          {/* TAB 6: Logs (Admin Only) */}
          {isAdmin && (
            <TabsContent value="logs">
              <LogsTab logs={logs} onFetchLogs={fetchLogs} />
            </TabsContent>
          )}
        </Tabs>
      </main>

      <DashboardFooter
        automationEnabled={automationEnabled}
        lastAutomationRun={lastAutomationRun}
      />
    </div>
  );
}
