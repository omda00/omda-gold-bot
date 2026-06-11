"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Bell,
  TrendingDown,
  Clock,
  Shield,
  ExternalLink,
  Sparkles,
  Zap,
  Heart,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const BOT_LINK = "https://t.me/gold_investmentbot";

export function BotRegistration() {
  const [subscriberStats, setSubscriberStats] = useState<{ total: number; active: number } | null>(null);

  useEffect(() => {
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
    // Refresh every 30 seconds
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4">
      {/* Hero Card - Telegram Bot Join */}
      <Card className="rounded-2xl border-0 shadow-xl ring-1 ring-border/20 overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-[#229ED9] via-[#2AABEE] to-[#27B0E6]" />
        <CardContent className="p-0">
          {/* Hero Section with gradient background */}
          <div className="relative bg-gradient-to-br from-[#229ED9]/10 via-[#2AABEE]/5 to-amber-50/10 dark:from-[#229ED9]/20 dark:via-[#2AABEE]/10 dark:to-amber-950/10 px-6 pt-8 pb-6 text-center">
            {/* Decorative circles */}
            <div className="absolute top-4 left-4 w-20 h-20 rounded-full bg-[#229ED9]/5 blur-xl" />
            <div className="absolute bottom-2 right-6 w-24 h-24 rounded-full bg-amber-400/5 blur-xl" />

            {/* Omda Logo */}
            <div className="relative mx-auto mb-5">
              <div className="w-24 h-24 mx-auto rounded-full flex items-center justify-center shadow-lg shadow-amber-500/20 ring-4 ring-amber-400/20 dark:ring-amber-400/10 overflow-hidden bg-black">
                <Image
                  src="/images/omda-logo.jpg"
                  alt="Gold Investment Bot Logo"
                  width={96}
                  height={96}
                  className="w-full h-full object-contain"
                  priority
                />
              </div>
              {/* Glow ring */}
              <div className="absolute inset-0 w-24 h-24 mx-auto rounded-full bg-amber-400/15 animate-pulse" style={{ animationDuration: '3s' }} />
            </div>

            {/* Title */}
            <h2 className="text-xl font-black mb-1.5 bg-gradient-to-r from-amber-500 to-yellow-600 bg-clip-text text-transparent">
              بوت الذهب والعملات
            </h2>
            <p className="text-sm text-muted-foreground font-medium mb-1">
              @gold_investmentbot
            </p>
            <p className="text-xs text-muted-foreground/70 mb-5">
              احصل على أسعار الذهب والدولار فوراً على تيليجرام
            </p>

            {/* Subscriber Count */}
            {subscriberStats !== null && (
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {subscriberStats.active.toLocaleString("ar-EG")} مشترك نشط
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                {subscriberStats.total > subscriberStats.active && (
                  <span className="text-xs text-muted-foreground/60">
                    من أصل {subscriberStats.total.toLocaleString("ar-EG")}
                  </span>
                )}
              </div>
            )}

            {/* Join Button */}
            <a href={BOT_LINK} target="_blank" rel="noopener noreferrer">
              <Button
                className="bg-gradient-to-r from-[#229ED9] to-[#1a8bc4] hover:from-[#1a8bc4] hover:to-[#1580b0] gap-2.5 rounded-2xl h-12 px-8 text-sm font-bold shadow-lg shadow-[#229ED9]/25 transition-all hover:shadow-xl hover:shadow-[#229ED9]/30 hover:scale-[1.02] active:scale-[0.98]"
                size="lg"
              >
                <svg viewBox="0 0 240 240" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M98.175 180.345C94.305 180.345 94.95 188.88 91.695 188.88C88.44 188.88 82.74 181.5 79.86 178.62L56.22 152.94C54.09 150.6 54.39 146.94 57.015 145.11L161.52 71.46C164.55 69.36 167.82 73.38 165.57 76.26L105.375 157.23C103.8 159.27 104.25 162.15 106.35 163.65L120.45 174.45C123.45 176.7 121.8 181.38 118.05 181.38H100.5C99.225 181.38 98.55 180.87 98.175 180.345Z"
                    fill="white"
                  />
                </svg>
                انضمام للبوت
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Features Grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="rounded-2xl border-0 shadow-lg ring-1 ring-border/20 overflow-hidden">
          <CardContent className="p-4 text-center">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-2.5">
              <Bell className="w-5 h-5 text-amber-500" />
            </div>
            <p className="text-xs font-bold mb-0.5">تحديث كل ساعة</p>
            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
              أسعار الذهب والدولار كل ساعة بتوقيت مصر
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-0 shadow-lg ring-1 ring-border/20 overflow-hidden">
          <CardContent className="p-4 text-center">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-2.5">
              <TrendingDown className="w-5 h-5 text-red-500" />
            </div>
            <p className="text-xs font-bold mb-0.5">تنبيه انخفاض</p>
            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
              إشعار فوري عند انخفاض الدولار
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-0 shadow-lg ring-1 ring-border/20 overflow-hidden">
          <CardContent className="p-4 text-center">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-2.5">
              <Clock className="w-5 h-5 text-emerald-500" />
            </div>
            <p className="text-xs font-bold mb-0.5">يعمل 24/7</p>
            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
              تحديثات تلقائية على مدار الساعة
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-0 shadow-lg ring-1 ring-border/20 overflow-hidden">
          <CardContent className="p-4 text-center">
            <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center mx-auto mb-2.5">
              <Shield className="w-5 h-5 text-sky-500" />
            </div>
            <p className="text-xs font-bold mb-0.5">آمن ومجاني</p>
            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
              بياناتك محمية بالكامل ومشفره
            </p>
          </CardContent>
        </Card>
      </div>

      {/* How to join - Steps */}
      <Card className="rounded-2xl border-0 shadow-lg ring-1 ring-border/20 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500" />
        <div className="bg-gradient-to-r from-amber-50/80 to-yellow-50/80 dark:from-amber-950/20 dark:to-yellow-950/20 px-4 py-3 flex items-center gap-2.5 border-b border-border/30">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-sm shadow-amber-400/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold">كيف تنضم؟</h3>
            <p className="text-xs text-muted-foreground">3 خطوات بسيطة فقط</p>
          </div>
        </div>
        <CardContent className="p-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-[#229ED9]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-black text-[#229ED9]">1</span>
              </div>
              <div>
                <p className="text-sm font-bold">اضغط على زر &quot;انضمام للبوت&quot;</p>
                <p className="text-xs text-muted-foreground">سيتم فتح تيليجرام تلقائياً</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-[#229ED9]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-black text-[#229ED9]">2</span>
              </div>
              <div>
                <p className="text-sm font-bold">اضغط &quot;Start&quot; في البوت</p>
                <p className="text-xs text-muted-foreground">لبدء الاستقبال والتفعيل</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-black text-emerald-500">3</span>
              </div>
              <div>
                <p className="text-sm font-bold">استلم التحديثات! 🎉</p>
                <p className="text-xs text-muted-foreground">ستصلك الأسعار كل ساعة تلقائياً</p>
              </div>
            </div>
          </div>

          {/* CTA Button again at bottom */}
          <div className="mt-5 pt-4 border-t border-border/20">
            <a href={BOT_LINK} target="_blank" rel="noopener noreferrer" className="block">
              <Button
                className="w-full bg-gradient-to-r from-[#229ED9] to-[#1a8bc4] hover:from-[#1a8bc4] hover:to-[#1580b0] gap-2 rounded-xl h-11 text-sm font-bold shadow-md shadow-[#229ED9]/20 transition-all hover:shadow-lg hover:shadow-[#229ED9]/25"
              >
                <Zap className="w-4 h-4" />
                انضم الآن — مجاناً
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Made With ❤️ By Omda */}
      <Card className="rounded-2xl border-0 shadow-lg ring-1 ring-border/20 overflow-hidden">
        <CardContent className="p-4 text-center">
          <div dir="ltr" className="flex items-center justify-center gap-1.5">
            <span className="text-xs text-muted-foreground/60 font-medium">Made With</span>
            <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500 animate-pulse" />
            <span className="text-xs text-muted-foreground/60 font-medium">By</span>
            <span className="text-xs font-bold bg-gradient-to-r from-amber-500 to-yellow-600 bg-clip-text text-transparent">
              Omda
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
