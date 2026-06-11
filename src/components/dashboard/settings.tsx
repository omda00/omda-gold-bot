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
  Zap,
  Key,
  UserPlus,
  Trash2,
  Power,
  PowerOff,
  Shield,
  Users,
  CheckCircle2,
  XCircle,
  Lock,
  LogOut,
  ShieldCheck,
  UserCheck,
  UserX,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import type { AppConfig, TelegramUser } from "@/lib/dashboard-types";
import { toast } from "sonner";

interface SettingsTabProps {
  config: AppConfig | null;
  onUpdateConfig: (key: string, value: string) => Promise<boolean>;
  onTestTelegram: () => Promise<{ ok?: boolean; message?: string; error?: string }>;
  telegramUsers: TelegramUser[];
  onAddTelegramUser: (name: string, botToken: string, chatId: string) => Promise<{ ok: boolean; error?: string; data?: TelegramUser }>;
  onDeleteTelegramUser: (id: string) => Promise<boolean>;
  onToggleTelegramUser: (id: string, active: boolean) => Promise<boolean>;
  onTestTelegramUser: (id: string) => Promise<{ ok?: boolean; message?: string; error?: string }>;
  isAdmin: boolean;
  checkingAuth: boolean;
  onAdminLogin: (password: string) => Promise<{ ok: boolean; error?: string }>;
  onAdminLogout: () => Promise<void>;
}

export function SettingsTab({
  config,
  onUpdateConfig,
  onTestTelegram,
  telegramUsers,
  onAddTelegramUser,
  onDeleteTelegramUser,
  onToggleTelegramUser,
  onTestTelegramUser,
  isAdmin,
  checkingAuth,
  onAdminLogin,
  onAdminLogout,
}: SettingsTabProps) {
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [dailyReportTime, setDailyReportTime] = useState("09:00");
  const [usdDropThreshold, setUsdDropThreshold] = useState("2");
  const [savingConfig, setSavingConfig] = useState(false);

  // New Telegram user form
  const [newName, setNewName] = useState("");
  const [newBotToken, setNewBotToken] = useState("");
  const [newChatId, setNewChatId] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Testing state per user
  const [testingUserId, setTestingUserId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});

  // Deleting state
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // Admin login form
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Subscriber count
  const [subscriberStats, setSubscriberStats] = useState<{ total: number; active: number } | null>(null);

  useEffect(() => {
    if (config) {
      setAutomationEnabled(config.AUTOMATION_ENABLED === "true");
      setDailyReportTime(config.DAILY_REPORT_TIME || "09:00");
      setUsdDropThreshold(config.USD_DROP_THRESHOLD || "2");
    }
  }, [config]);

  // Fetch subscriber count
  useEffect(() => {
    if (!isAdmin) return;
    async function fetchCount() {
      try {
        const res = await fetch("/api/telegram-users/count");
        if (res.ok) {
          const data = await res.json();
          setSubscriberStats({ total: data.total ?? 0, active: data.active ?? 0 });
        }
      } catch {
        // ignore
      }
    }
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const updates = [
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

  const handleAddUser = async () => {
    if (!newName.trim() || !newBotToken.trim() || !newChatId.trim()) {
      toast.error("يرجى ملء جميع الحقول");
      return;
    }
    setAddingUser(true);
    try {
      const result = await onAddTelegramUser(newName.trim(), newBotToken.trim(), newChatId.trim());
      if (result.ok) {
        toast.success(`تم تسجيل ${newName} بنجاح — سيصلك التحديث كل ساعة بتوقيت مصر`);
        setNewName("");
        setNewBotToken("");
        setNewChatId("");
        setAddDialogOpen(false);
      } else {
        toast.error(result.error || "فشل في تسجيل المستخدم");
      }
    } finally {
      setAddingUser(false);
    }
  };

  const handleTestUser = async (id: string, name: string) => {
    setTestingUserId(id);
    try {
      const result = await onTestTelegramUser(id);
      if (result.ok) {
        setTestResults((prev) => ({ ...prev, [id]: { ok: true, message: "متصل ✓" } }));
        toast.success(`تم إرسال رسالة اختبار إلى ${name}`);
      } else {
        setTestResults((prev) => ({ ...prev, [id]: { ok: false, message: result.error || "فشل الاتصال" } }));
        toast.error(`فشل اختبار اتصال ${name}`);
      }
    } finally {
      setTestingUserId(null);
    }
  };

  const handleDeleteUser = async (id: string, name: string) => {
    setDeletingUserId(id);
    try {
      const success = await onDeleteTelegramUser(id);
      if (success) {
        toast.success(`تم حذف ${name}`);
      } else {
        toast.error("فشل في حذف المستخدم");
      }
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleToggleUser = async (id: string, active: boolean, name: string) => {
    const success = await onToggleTelegramUser(id, active);
    if (success) {
      toast.success(active ? `تم تفعيل إشعارات ${name}` : `تم إيقاف إشعارات ${name}`);
    } else {
      toast.error("فشل في تحديث حالة المستخدم");
    }
  };

  const handleLogin = async () => {
    if (!loginPassword.trim()) {
      setLoginError("يرجى إدخال كلمة المرور");
      return;
    }
    setLoginLoading(true);
    setLoginError("");
    try {
      const result = await onAdminLogin(loginPassword.trim());
      if (result.ok) {
        toast.success("تم تسجيل الدخول بنجاح");
        setLoginPassword("");
      } else {
        setLoginError(result.error || "كلمة المرور غير صحيحة");
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await onAdminLogout();
    toast.success("تم تسجيل الخروج");
  };

  // =============================================
  // ADMIN LOCK SCREEN — shown when not admin
  // =============================================
  if (!isAdmin) {
    return (
      <div className="space-y-3">
        {/* Public info card */}
        <Card className="rounded-2xl border-0 shadow-lg ring-1 ring-border/20 overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500" />
          <CardContent className="p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
              <Settings className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="text-base font-bold mb-1">الإعدادات</h3>
            <p className="text-sm text-muted-foreground mb-6">
              لتعديل الإعدادات وإدارة البوتات، يرجى تسجيل الدخول كمسؤول
            </p>

            {/* Login form */}
            <div className="max-w-xs mx-auto space-y-3">
              <div className="relative">
                <Input
                  type={showLoginPassword ? "text" : "password"}
                  value={loginPassword}
                  onChange={(e) => { setLoginPassword(e.target.value); setLoginError(""); }}
                  placeholder="كلمة مرور المسؤول"
                  className="rounded-xl h-11 text-sm pr-4 pl-10"
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  disabled={loginLoading || checkingAuth}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute left-0 top-0 h-full px-3"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                >
                  {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              {loginError && (
                <p className="text-xs text-red-500 font-medium">{loginError}</p>
              )}
              <Button
                onClick={handleLogin}
                disabled={loginLoading || checkingAuth || !loginPassword.trim()}
                className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 gap-2 rounded-xl h-10 text-sm font-bold shadow-sm shadow-amber-500/20"
              >
                {loginLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                تسجيل الدخول
              </Button>
              <p className="text-[10px] text-muted-foreground/60">
                أدخل كلمة مرور المسؤول للوصول إلى لوحة القيادة
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // =============================================
  // ADMIN VIEW — full access
  // =============================================
  return (
    <div className="space-y-3">
      {/* Subscriber Stats Card */}
      <Card className="rounded-2xl border-0 shadow-lg ring-1 ring-border/20 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-amber-400 via-yellow-400 to-emerald-500" />
        <CardContent className="p-4">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-sm shadow-amber-400/20">
              <Users className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold">إحصائيات المشتركين</h3>
              <p className="text-xs text-muted-foreground">عدد المشتركين في بوت التيليجرام</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/20 dark:to-green-950/20 rounded-xl p-4 ring-1 ring-emerald-200/50 dark:ring-emerald-800/30">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                  <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">نشط</span>
              </div>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {subscriberStats ? subscriberStats.active.toLocaleString("ar-EG") : "..."}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">مشترك نشط يستقبل الإشعارات</p>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 rounded-xl p-4 ring-1 ring-amber-200/50 dark:ring-amber-800/30">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                  <Users className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300">إجمالي</span>
              </div>
              <p className="text-2xl font-black text-amber-600 dark:text-amber-400">
                {subscriberStats ? subscriberStats.total.toLocaleString("ar-EG") : "..."}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">إجمالي المشتركين (نشط + متوقف)</p>
            </div>
          </div>
          {subscriberStats && subscriberStats.total > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-2 bg-muted/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${(subscriberStats.active / subscriberStats.total) * 100}%` }}
                />
              </div>
              <span className="text-xs font-bold text-muted-foreground">
                {Math.round((subscriberStats.active / subscriberStats.total) * 100)}%
              </span>
            </div>
          )}
          {subscriberStats && subscriberStats.total > 0 && (
            <div className="mt-2 flex items-center gap-1.5">
              <UserX className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs text-muted-foreground">
                {subscriberStats.total - subscriberStats.active} مشترك متوقف عن الاستقبال
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin badge / logout */}
      <Card className="rounded-2xl border-0 shadow-lg ring-1 ring-border/20 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-emerald-400 via-green-400 to-teal-500" />
        <CardContent className="p-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-sm shadow-emerald-400/20">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold">وضع المسؤول</p>
                <Badge className="rounded-md text-[10px] px-1.5 py-0 font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  نشط
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">لديك صلاحية كاملة لإدارة البوتات والإعدادات</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="gap-1.5 rounded-lg h-8 text-xs border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30 text-red-600"
          >
            <LogOut className="w-3.5 h-3.5" />
            خروج
          </Button>
        </CardContent>
      </Card>

      {/* ============================================ */}
      {/* Telegram Users Management (Per-User Bots) */}
      {/* ============================================ */}
      <Card className="rounded-2xl border-0 shadow-lg ring-1 ring-border/20 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-sky-400 via-blue-400 to-indigo-500" />
        <div className="bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-950/20 dark:to-blue-950/20 px-4 py-3 flex items-center justify-between border-b border-border/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center shadow-sm shadow-sky-400/20">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold">لوحة قيادة البوتات</h3>
              <p className="text-xs text-muted-foreground">إدارة بوتات التيليجرام — المسؤول فقط</p>
            </div>
          </div>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button
                size="default"
                className="bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-600 hover:to-indigo-600 gap-1.5 rounded-lg shadow-sm shadow-sky-500/20 h-8 text-xs"
              >
                <UserPlus className="w-3.5 h-3.5" />
                تسجيل بوت جديد
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md rounded-2xl" dir="rtl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Bot className="w-5 h-5 text-sky-500" />
                  تسجيل بوت تيليجرام جديد
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-3">
                <div className="bg-sky-50 dark:bg-sky-950/30 rounded-xl p-3 ring-1 ring-sky-200 dark:ring-sky-800">
                  <p className="text-xs font-medium text-sky-700 dark:text-sky-300 leading-relaxed">
                    📌 كل عميل يسجل بوته الخاص — البيانات خاصة ولا يمكن لأي شخص آخر الوصول إليها.
                    <br />✅ سيتم إرسال أسعار الذهب والدولار كل ساعة بتوقيت مصر.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground">الاسم</Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="أدخل اسم العميل"
                    className="rounded-lg h-10 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5" /> Bot Token
                  </Label>
                  <div className="relative">
                    <Input
                      type={showToken ? "text" : "password"}
                      value={newBotToken}
                      onChange={(e) => setNewBotToken(e.target.value)}
                      placeholder="مثال: 123456789:ABCdefGHI..."
                      className="pr-10 rounded-lg h-10 text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowToken(!showToken)}
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5" /> Chat ID
                  </Label>
                  <Input
                    value={newChatId}
                    onChange={(e) => setNewChatId(e.target.value)}
                    placeholder="مثال: 123456789"
                    className="rounded-lg h-10 text-sm"
                  />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <DialogClose asChild>
                  <Button variant="outline" className="rounded-lg text-xs">إلغاء</Button>
                </DialogClose>
                <Button
                  onClick={handleAddUser}
                  disabled={addingUser || !newName.trim() || !newBotToken.trim() || !newChatId.trim()}
                  className="bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-600 hover:to-indigo-600 gap-1.5 rounded-lg text-xs"
                >
                  {addingUser ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="w-3.5 h-3.5" />
                  )}
                  تسجيل
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <CardContent className="p-4">
          {telegramUsers.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-3">
                <Users className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">لا يوجد بوتات مسجلة حتى الآن</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                اضغط &quot;تسجيل بوت جديد&quot; لإضافة بوت تيليجرام
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {telegramUsers.map((user) => (
                <div
                  key={user.id}
                  className={`bg-muted/20 rounded-xl p-3.5 ring-1 ring-border/20 transition-all ${
                    user.active ? "hover:bg-muted/30" : "opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          user.active
                            ? "bg-gradient-to-br from-sky-400 to-indigo-500 shadow-sm shadow-sky-400/20"
                            : "bg-muted/40"
                        }`}
                      >
                        <Bot className={`w-4 h-4 ${user.active ? "text-white" : "text-muted-foreground"}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold truncate">{user.name}</p>
                          <Badge
                            variant={user.active ? "default" : "secondary"}
                            className={`rounded-md text-[10px] px-1.5 py-0 font-bold ${
                              user.active
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {user.active ? "نشط" : "متوقف"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          Token: {user.botToken} • Chat: {user.chatId}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {testResults[user.id] && (
                        <Badge
                          variant={testResults[user.id].ok ? "default" : "destructive"}
                          className={`rounded-md text-[10px] px-1.5 py-0 font-bold ${
                            testResults[user.id].ok
                              ? "bg-emerald-500 text-white"
                              : ""
                          }`}
                        >
                          {testResults[user.id].ok ? (
                            <CheckCircle2 className="w-3 h-3 mr-0.5" />
                          ) : (
                            <XCircle className="w-3 h-3 mr-0.5" />
                          )}
                          {testResults[user.id].message}
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 rounded-lg"
                        onClick={() => handleTestUser(user.id, user.name)}
                        disabled={testingUserId === user.id}
                      >
                        {testingUserId === user.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-500" />
                        ) : (
                          <TestTube className="w-3.5 h-3.5 text-muted-foreground hover:text-sky-500" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 rounded-lg"
                        onClick={() => handleToggleUser(user.id, !user.active, user.name)}
                      >
                        {user.active ? (
                          <PowerOff className="w-3.5 h-3.5 text-amber-500" />
                        ) : (
                          <Power className="w-3.5 h-3.5 text-emerald-500" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20"
                        onClick={() => handleDeleteUser(user.id, user.name)}
                        disabled={deletingUserId === user.id}
                      >
                        {deletingUserId === user.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-red-500" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Automation Settings */}
      <Card className="rounded-2xl border-0 shadow-lg ring-1 ring-border/20 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-emerald-400 via-green-400 to-emerald-500" />
        <div className="bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/20 dark:to-green-950/20 px-4 py-3 flex items-center gap-2.5 border-b border-border/30">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-sm shadow-emerald-400/20">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold">إعدادات الأتمتة</h3>
            <p className="text-xs text-muted-foreground">Automation Settings</p>
          </div>
        </div>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3 ring-1 ring-border/20">
            <div>
              <Label className="font-bold text-sm">تفعيل الأتمتة</Label>
              <p className="text-xs text-muted-foreground">
                تشغيل جلب الأسعار والإشعارات تلقائياً
              </p>
            </div>
            <Switch
              checked={automationEnabled}
              onCheckedChange={setAutomationEnabled}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="reportTime" className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> وقت التقرير اليومي
              </Label>
              <Input
                id="reportTime"
                type="time"
                value={dailyReportTime}
                onChange={(e) => setDailyReportTime(e.target.value)}
                className="rounded-lg h-9 text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="threshold" className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> حد انخفاض الدولار (%)
              </Label>
              <Input
                id="threshold"
                type="number"
                step="0.1"
                min="0"
                value={usdDropThreshold}
                onChange={(e) => setUsdDropThreshold(e.target.value)}
                className="rounded-lg h-9 text-xs"
              />
            </div>
          </div>
          <Button
            onClick={handleSaveConfig}
            disabled={savingConfig}
            className="bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 gap-2 rounded-lg shadow-sm shadow-emerald-500/20 h-9 px-4 text-xs"
          >
            {savingConfig ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span className="text-xs font-bold">حفظ الإعدادات</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
