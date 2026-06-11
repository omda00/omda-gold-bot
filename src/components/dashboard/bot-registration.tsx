"use client";

import { useState } from "react";
import {
  Bot,
  Key,
  Send,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle2,
  MessageCircle,
  Shield,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface BotRegistrationProps {
  onRegister: (name: string, botToken: string, chatId: string) => Promise<{ ok: boolean; error?: string; message?: string }>;
}

export function BotRegistration({ onRegister }: BotRegistrationProps) {
  const [name, setName] = useState("");
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleRegister = async () => {
    if (!name.trim() || !botToken.trim() || !chatId.trim()) {
      toast.error("يرجى ملء جميع الحقول");
      return;
    }

    setLoading(true);
    try {
      const result = await onRegister(name.trim(), botToken.trim(), chatId.trim());
      if (result.ok) {
        setSuccess(true);
        toast.success("تم تسجيل البوت بنجاح — سيصلك التحديث كل ساعة 🎉");
        setName("");
        setBotToken("");
        setChatId("");
      } else {
        toast.error(result.error || "فشل في تسجيل البوت");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* How it works card */}
      <Card className="rounded-2xl border-0 shadow-lg ring-1 ring-border/20 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-teal-400 via-cyan-400 to-sky-500" />
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-sky-500 flex items-center justify-center flex-shrink-0 shadow-sm shadow-teal-400/20">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold mb-1">كيف يعمل؟</h3>
              <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                <p>
                  🔔 ستصلك أسعار الذهب والذهب عيار 21 والدولار كل ساعة بتوقيت مصر على بوت التيليجرام الخاص بك
                </p>
                <p>
                  📉 تنبيه فوري عند انخفاض الدولار بنسبة معينة
                </p>
                <p>
                  🔒 بياناتك خاصة — لا يمكن لأي شخص آخر الوصول إليها
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Registration form */}
      <Card className="rounded-2xl border-0 shadow-lg ring-1 ring-border/20 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-teal-400 via-emerald-400 to-green-500" />
        <div className="bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-950/20 dark:to-emerald-950/20 px-4 py-3 flex items-center gap-2.5 border-b border-border/30">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-green-500 flex items-center justify-center shadow-sm shadow-teal-400/20">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold">تسجيل بوت جديد</h3>
            <p className="text-xs text-muted-foreground">سجّل بوتك لتصلك التحديثات كل ساعة</p>
          </div>
        </div>
        <CardContent className="p-4 space-y-4">
          {success ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <div>
                <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">تم التسجيل بنجاح! 🎉</p>
                <p className="text-xs text-muted-foreground mt-1">
                  سيصلك أول تحديث في الساعة القادمة بتوقيت مصر
                </p>
              </div>
              <Button
                onClick={() => setSuccess(false)}
                variant="outline"
                className="rounded-xl text-xs gap-1.5"
              >
                تسجيل بوت آخر
              </Button>
            </div>
          ) : (
            <>
              <div className="bg-teal-50 dark:bg-teal-950/30 rounded-xl p-3 ring-1 ring-teal-200 dark:ring-teal-800">
                <p className="text-xs font-medium text-teal-700 dark:text-teal-300 leading-relaxed">
                  📌 الخطوات:
                  <br />1. أنشئ بوت من @BotFather على تيليجرام وانسخ التوكن
                  <br />2. ابحث عن Chat ID الخاص بك من @userinfobot
                  <br />3. أدخل البيانات بالأسفل واضغط تسجيل
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground">الاسم</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="اسمك أو اسم البوت"
                    className="rounded-xl h-11 text-sm"
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5" /> Bot Token
                  </Label>
                  <div className="relative">
                    <Input
                      type={showToken ? "text" : "password"}
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                      placeholder="مثال: 123456789:ABCdefGHI..."
                      className="pr-4 pl-10 rounded-xl h-11 text-sm"
                      disabled={loading}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute left-0 top-0 h-full px-3"
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
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    placeholder="مثال: 123456789"
                    className="rounded-xl h-11 text-sm"
                    disabled={loading}
                  />
                </div>
              </div>

              <Button
                onClick={handleRegister}
                disabled={loading || !name.trim() || !botToken.trim() || !chatId.trim()}
                className="w-full bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 gap-2 rounded-xl h-11 text-sm font-bold shadow-sm shadow-teal-500/20"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                تسجيل البوت
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Security note */}
      <Card className="rounded-2xl border-0 shadow-lg ring-1 ring-border/20 overflow-hidden">
        <CardContent className="p-3 flex items-center gap-2.5">
          <Shield className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
          <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
            بيانات البوت مشفرة ومحمية — لا يمكن لأي شخص آخر الوصول إليها أو التحكم فيها
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
