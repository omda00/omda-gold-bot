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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

  // Sync config state
  useEffect(() => {
    if (config) {
      setBotToken(config.TELEGRAM_BOT_TOKEN || "");
      setChatId(config.TELEGRAM_CHAT_ID || "");
      setAutomationEnabled(config.AUTOMATION_ENABLED === "true");
      setDailyReportTime(config.DAILY_REPORT_TIME || "09:00");
      setUsdDropThreshold(config.USD_DROP_THRESHOLD || "2");
    }
  }, [config]);

  // Sync plans state
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
      toast.success("Configuration saved successfully");
    } catch {
      toast.error("Failed to save configuration");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTestTelegram = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Save config first
      await Promise.all([
        onUpdateConfig("TELEGRAM_BOT_TOKEN", botToken),
        onUpdateConfig("TELEGRAM_CHAT_ID", chatId),
      ]);
      const result = await onTestTelegram();
      if (result.ok) {
        setTestResult({ ok: true, message: result.message || "Test message sent!" });
        toast.success("Telegram test message sent successfully");
      } else {
        setTestResult({
          ok: false,
          message: result.error || "Failed to send test message",
        });
        toast.error("Telegram test failed");
      }
    } catch {
      setTestResult({ ok: false, message: "Network error" });
      toast.error("Telegram test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleSeedPlan = async () => {
    setSeedingPlan(true);
    try {
      const success = await onSeedPlan();
      if (success) {
        toast.success("Default investment plan seeded");
      } else {
        toast.error("Failed to seed plan");
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
        toast.success("Investment plan saved successfully");
      } else {
        toast.error("Failed to save plan");
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
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bot className="w-4 h-4 text-emerald-600" />
            Telegram Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="botToken">Bot Token</Label>
            <div className="relative">
              <Input
                id="botToken"
                type={showToken ? "text" : "password"}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="Enter your Telegram Bot Token"
                className="pr-10"
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
            <Label htmlFor="chatId">Chat ID</Label>
            <Input
              id="chatId"
              type="text"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="Enter your Telegram Chat ID"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestTelegram}
              disabled={testing}
              className="gap-1.5"
            >
              {testing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <TestTube className="w-3.5 h-3.5" />
              )}
              Test Connection
            </Button>
            {testResult && (
              <Badge
                variant={testResult.ok ? "default" : "destructive"}
                className={
                  testResult.ok
                    ? "bg-emerald-600 text-white"
                    : ""
                }
              >
                {testResult.ok ? "✓ Connected" : "✗ Failed"}
              </Badge>
            )}
          </div>
          {testResult && !testResult.ok && (
            <p className="text-xs text-red-600">{testResult.message}</p>
          )}
        </CardContent>
      </Card>

      {/* Automation Settings */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Settings className="w-4 h-4 text-emerald-600" />
            Automation Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Automation</Label>
              <p className="text-xs text-muted-foreground">
                Run automated price fetching &amp; notifications
              </p>
            </div>
            <Switch
              checked={automationEnabled}
              onCheckedChange={setAutomationEnabled}
            />
          </div>
          <Separator />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reportTime" className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Daily Report Time
              </Label>
              <Input
                id="reportTime"
                type="time"
                value={dailyReportTime}
                onChange={(e) => setDailyReportTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="threshold" className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                USD Drop Threshold (%)
              </Label>
              <Input
                id="threshold"
                type="number"
                step="0.1"
                min="0"
                value={usdDropThreshold}
                onChange={(e) => setUsdDropThreshold(e.target.value)}
              />
            </div>
          </div>
          <Button
            onClick={handleSaveConfig}
            disabled={savingConfig}
            className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
          >
            {savingConfig ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save Configuration
          </Button>
        </CardContent>
      </Card>

      {/* Investment Plan Management */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-emerald-600" />
              Investment Plan Management
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSeedPlan}
                disabled={seedingPlan}
                className="gap-1.5"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${seedingPlan ? "animate-spin" : ""}`}
                />
                Seed Default
              </Button>
              <Button
                size="sm"
                onClick={handleSavePlans}
                disabled={savingPlans}
                className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                Save Changes
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Min Price</TableHead>
                  <TableHead>Max Price</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Return %</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {editablePlans.map((plan, index) => (
                  <TableRow key={plan.id || index}>
                    <TableCell className="text-center font-mono text-xs">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={plan.priceRangeMin}
                        onChange={(e) =>
                          updatePlanField(
                            index,
                            "priceRangeMin",
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-24 h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={plan.priceRangeMax ?? ""}
                        onChange={(e) =>
                          updatePlanField(
                            index,
                            "priceRangeMax",
                            e.target.value ? parseFloat(e.target.value) : null
                          )
                        }
                        placeholder="∞"
                        className="w-24 h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={plan.action}
                        onChange={(e) =>
                          updatePlanField(index, "action", e.target.value)
                        }
                        dir="rtl"
                        className="w-28 h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={plan.expectedReturn}
                        onChange={(e) =>
                          updatePlanField(
                            index,
                            "expectedReturn",
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-20 h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={plan.active}
                        onCheckedChange={(checked) =>
                          updatePlanField(index, "active", checked)
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
