"use client";

import { useState, useEffect } from "react";
import {
  Send,
  TestTube,
  Settings,
  RefreshCw,
  Save,
  Eye,
  EyeOff,
  Bot,
  Clock,
  AlertTriangle,
  ShoppingCart,
  Zap,
  Key,
  MessageSquare,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import type { AppConfig, InvestmentPlan } from "@/lib/dashboard-types";
import { toast } from "sonner";

interface SettingsTabProps {
  config: AppConfig | null;
  plans: InvestmentPlan[];
  onUpdateConfig: (key: string, value: string) => Promise<boolean>;
  onTestTelegram: () => Promise<{ ok?: boolean; message?: string; error?: string }>;
  onSeedPlan: () => Promise<boolean>;
  onSavePlans: (plans: InvestmentPlan[]) => Promise<boolean>;
}

export function SettingsTab({
  config,
  plans,
  onUpdateConfig,
  onTestTelegram,
  onSeedPlan,
  onSavePlans,
}: SettingsTabProps) {
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [dailyReportTime, setDailyReportTime] = useState("09:00");
  const [usdDropThreshold, setUsdDropThreshold] = useState("2");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [seedingPlan, setSeedingPlan] = useState(false);
  const [savingPlans, setSavingPlans] = useState(false);
  const [editablePlans, setEditablePlans] = useState<InvestmentPlan[]>([]);

  useEffect(() => {
    if (config) {
      setBotToken(config.TELEGRAM_BOT_TOKEN || "");
      setChatId(config.TELEGRAM_CHAT_ID || "");
      setAutomationEnabled(config.AUTOMATION_ENABLED === "true");
      setDailyReportTime(config.DAILY_REPORT_TIME || "09:00");
      setUsdDropThreshold(config.USD_DROP_THRESHOLD || "2");
    }
  }, [config]);

  useEffect(() => {
    setEditablePlans(plans.map((p) => ({ ...p })));
  }, [plans]);

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const updates = [
        onUpdateConfig("TELEGRAM_BOT_TOKEN", botToken),
        onUpdateConfig("TELEGRAM_CHAT_ID", chatId),
        onUpdateConfig("AUTOMATION_ENABLED", automationEnabled ? "true" : "false"),
        onUpdateConfig("DAILY_REPORT_TIME", dailyReportTime),
        onUpdateConfig("USD_DROP_THRESHOLD", usdDropThreshold),
      ];
      await Promise.all(updates);
      toast.success("تم حفظ الإعدادات بنجاح");
    } catch {
      toast.error("فشل في حفظ الإعدادات");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTestTelegram = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await Promise.all([
        onUpdateConfig("TELEGRAM_BOT_TOKEN", botToken),
        onUpdateConfig("TELEGRAM_CHAT_ID", chatId),
      ]);
      const result = await onTestTelegram();
      if (result.ok) {
        setTestResult({ ok: true, message: result.message || "Test message sent!" });
        toast.success("تم إرسال رسالة الاختبار بنجاح");
      } else {
        setTestResult({
          ok: false,
          message: result.error || "فشل إرسال رسالة الاختبار",
        });
        toast.error("فشل اختبار التيليجرام");
      }
    } catch {
      setTestResult({ ok: false, message: "خطأ في الاتصال" });
      toast.error("فشل اختبار التيليجرام");
    } finally {
      setTesting(false);
    }
  };

  const handleSeedPlan = async () => {
    setSeedingPlan(true);
    try {
      const success = await onSeedPlan();
      if (success) {
        toast.success("تم إنشاء خطة الاستثمار الافتراضية");
      } else {
        toast.error("فشل في إنشاء الخطة");
      }
    } finally {
      setSeedingPlan(false);
    }
  };

  const handleSavePlans = async () => {
    setSavingPlans(true);
    try {
      const success = await onSavePlans(editablePlans);
      if (success) {
        toast.success("تم حفظ خطة الاستثمار بنجاح");
      } else {
        toast.error("فشل في حفظ الخطة");
      }
    } finally {
      setSavingPlans(false);
    }
  };

  const updatePlanField = (
    index: number,
    field: keyof InvestmentPlan,
    value: string | number | boolean | null
  ) => {
    setEditablePlans((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );
  };

  return (
    <div className="space-y-4">
      {/* Telegram Configuration */}
      <Card className="rounded-2xl border-0 shadow-xl ring-1 ring-border/20 overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-sky-400 via-blue-400 to-sky-500" />
        <div className="bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-950/20 dark:to-blue-950/20 px-5 py-4 flex items-center gap-3 border-b border-border/30">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center shadow-md shadow-sky-400/20">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold">إعدادات التيليجرام</h3>
            <p className="text-sm text-muted-foreground">Telegram Configuration</p>
          </div>
        </div>
        <CardContent className="p-5 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="botToken" className="text-sm font-bold text-muted-foreground flex items-center gap-2">
              <Key className="w-4 h-4" /> Bot Token
            </Label>
            <div className="relative">
              <Input
                id="botToken"
                type={showToken ? "text" : "password"}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="أدخل Bot Token"
                className="pr-10 rounded-xl h-11 text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="chatId" className="text-sm font-bold text-muted-foreground flex items-center gap-2">
              <Bot className="w-4 h-4" /> Chat ID
            </Label>
            <Input
              id="chatId"
              type="text"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="أدخل Chat ID"
              className="rounded-xl h-11 text-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="default"
              onClick={handleTestTelegram}
              disabled={testing}
              className="gap-2 rounded-xl h-10"
            >
              {testing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <TestTube className="w-4 h-4" />
              )}
              <span className="text-sm font-semibold">اختبار الاتصال</span>
            </Button>
            {testResult && (
              <Badge
                variant={testResult.ok ? "default" : "destructive"}
                className={
                  testResult.ok
                    ? "bg-emerald-500 text-white rounded-lg px-3 py-1 text-sm font-bold"
                    : "rounded-lg px-3 py-1 text-sm font-bold"
                }
              >
                {testResult.ok ? "✓ متصل" : "✗ فشل"}
              </Badge>
            )}
          </div>
          {testResult && !testResult.ok && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/20 rounded-xl px-4 py-3 font-medium">{testResult.message}</p>
          )}
        </CardContent>
      </Card>

      {/* Automation Settings */}
      <Card className="rounded-2xl border-0 shadow-xl ring-1 ring-border/20 overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-emerald-400 via-green-400 to-emerald-500" />
        <div className="bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/20 dark:to-green-950/20 px-5 py-4 flex items-center gap-3 border-b border-border/30">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-md shadow-emerald-400/20">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold">إعدادات الأتمتة</h3>
            <p className="text-sm text-muted-foreground">Automation Settings</p>
          </div>
        </div>
        <CardContent className="p-5 space-y-5">
          <div className="flex items-center justify-between bg-muted/30 rounded-xl p-4 ring-1 ring-border/20">
            <div>
              <Label className="font-bold text-base">تفعيل الأتمتة</Label>
              <p className="text-sm text-muted-foreground">
                تشغيل جلب الأسعار والإشعارات تلقائياً
              </p>
            </div>
            <Switch
              checked={automationEnabled}
              onCheckedChange={setAutomationEnabled}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reportTime" className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                <Clock className="w-4 h-4" /> وقت التقرير اليومي
              </Label>
              <Input
                id="reportTime"
                type="time"
                value={dailyReportTime}
                onChange={(e) => setDailyReportTime(e.target.value)}
                className="rounded-xl h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="threshold" className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> حد انخفاض الدولار (%)
              </Label>
              <Input
                id="threshold"
                type="number"
                step="0.1"
                min="0"
                value={usdDropThreshold}
                onChange={(e) => setUsdDropThreshold(e.target.value)}
                className="rounded-xl h-11"
              />
            </div>
          </div>
          <Button
            onClick={handleSaveConfig}
            disabled={savingConfig}
            className="bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 gap-2 rounded-xl shadow-md shadow-emerald-500/20 h-11 px-5"
          >
            {savingConfig ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span className="text-sm font-bold">حفظ الإعدادات</span>
          </Button>
        </CardContent>
      </Card>

      {/* Investment Plan Management */}
      <Card className="rounded-2xl border-0 shadow-xl ring-1 ring-border/20 overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500" />
        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 px-5 py-4 flex items-center justify-between border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-md shadow-amber-400/20">
              <ShoppingCart className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold">إدارة خطة الاستثمار</h3>
              <p className="text-sm text-muted-foreground">Investment Plan Management</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="default"
              onClick={handleSeedPlan}
              disabled={seedingPlan}
              className="gap-2 rounded-xl h-9 text-sm"
            >
              <RefreshCw
                className={`w-4 h-4 ${seedingPlan ? "animate-spin" : ""}`}
              />
              إنشاء افتراضي
            </Button>
            <Button
              size="default"
              onClick={handleSavePlans}
              disabled={savingPlans}
              className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 gap-2 rounded-xl shadow-md shadow-amber-500/20 h-9 text-sm"
            >
              <Save className="w-4 h-4" />
              حفظ التغييرات
            </Button>
          </div>
        </div>
        <CardContent className="p-4">
          <div className="space-y-3">
            {editablePlans.map((plan, index) => (
              <div
                key={plan.id || index}
                className="bg-muted/20 rounded-xl p-4 ring-1 ring-border/20 hover:bg-muted/30 transition-colors"
              >
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-center">
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-muted-foreground">الحد الأدنى</label>
                    <Input
                      type="number"
                      value={plan.priceRangeMin}
                      onChange={(e) =>
                        updatePlanField(index, "priceRangeMin", parseFloat(e.target.value) || 0)
                      }
                      className="h-9 text-sm rounded-lg"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-muted-foreground">الحد الأقصى</label>
                    <Input
                      type="number"
                      value={plan.priceRangeMax ?? ""}
                      onChange={(e) =>
                        updatePlanField(index, "priceRangeMax", e.target.value ? parseFloat(e.target.value) : null)
                      }
                      placeholder="∞"
                      className="h-9 text-sm rounded-lg"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-muted-foreground">الإجراء</label>
                    <Input
                      value={plan.action}
                      onChange={(e) => updatePlanField(index, "action", e.target.value)}
                      dir="rtl"
                      className="h-9 text-sm rounded-lg font-semibold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-muted-foreground">العائد %</label>
                    <Input
                      type="number"
                      value={plan.expectedReturn}
                      onChange={(e) =>
                        updatePlanField(index, "expectedReturn", parseFloat(e.target.value) || 0)
                      }
                      className="h-9 text-sm rounded-lg"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-muted-foreground">نشط</label>
                    <div className="flex items-center h-9">
                      <Switch
                        checked={plan.active}
                        onCheckedChange={(checked) => updatePlanField(index, "active", checked)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
