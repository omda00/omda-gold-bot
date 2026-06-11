"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ShoppingCart,
  Clock,
  AlertTriangle,
  Gem,
  Target,
  Shield,
  Zap,
  BookOpen,
  Users,
  ChevronDown,
  ChevronUp,
  Info,
  DollarSign,
  Landmark,
  BarChart3,
  PiggyBank,
  Eye,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { InvestmentPlan, SignalResult } from "@/lib/dashboard-types";

// ─── Helper: Action config ───
function getActionConfig(action: string) {
  if (action.includes("شراء قوي")) {
    return {
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      gradient: "from-emerald-400 to-emerald-500",
      badgeBg: "bg-gradient-to-r from-emerald-500 to-emerald-600",
      border: "ring-emerald-400/40",
      icon: <ShoppingCart className="w-4 h-4" />,
      label: "Strong Buy",
      textColor: "text-emerald-700 dark:text-emerald-400",
    };
  }
  if (action.includes("شراء تدريجي") || action.includes("شراء")) {
    return {
      bg: "bg-green-50 dark:bg-green-950/30",
      gradient: "from-green-400 to-green-500",
      badgeBg: "bg-gradient-to-r from-green-500 to-green-600",
      border: "ring-green-400/40",
      icon: <TrendingUp className="w-4 h-4" />,
      label: "Buy",
      textColor: "text-green-700 dark:text-green-400",
    };
  }
  if (action.includes("انتظار") || action.includes("مراقبة")) {
    return {
      bg: "bg-amber-50 dark:bg-amber-950/30",
      gradient: "from-amber-400 to-amber-500",
      badgeBg: "bg-gradient-to-r from-amber-500 to-amber-600",
      border: "ring-amber-400/40",
      icon: <Eye className="w-4 h-4" />,
      label: "Watch",
      textColor: "text-amber-700 dark:text-amber-400",
    };
  }
  return {
    bg: "bg-red-50 dark:bg-red-950/30",
    gradient: "from-red-400 to-red-500",
    badgeBg: "bg-gradient-to-r from-red-500 to-red-600",
    border: "ring-red-400/40",
    icon: <AlertTriangle className="w-4 h-4" />,
    label: "Sell",
    textColor: "text-red-700 dark:text-red-400",
  };
}

// ─── DCA Phase Data ───
const dcaPhases = [
  {
    phase: 1,
    title: "الشراء الفوري",
    subtitle: "Immediate Buy",
    allocation: 40,
    priceRange: "6,100 – 6,200",
    description: "شراء 40% من الميزانية عند المستويات الحالية فوراً",
    color: "from-emerald-400 to-emerald-600",
    bgLight: "bg-emerald-50 dark:bg-emerald-950/20",
    borderColor: "border-emerald-300 dark:border-emerald-800",
    icon: <Zap className="w-5 h-5" />,
  },
  {
    phase: 2,
    title: "الشراء عند تراجع إضافي 5%",
    subtitle: "Buy on 5% Dip",
    allocation: 30,
    priceRange: "5,800 – 5,900",
    description: "شراء 30% عند تراجع إضافي — ضع تنبيهات سعرية",
    color: "from-green-400 to-green-600",
    bgLight: "bg-green-50 dark:bg-green-950/20",
    borderColor: "border-green-300 dark:border-green-800",
    icon: <Target className="w-5 h-5" />,
  },
  {
    phase: 3,
    title: "الشراء بعد استقرار أسبوعين",
    subtitle: "Buy After 2-Week Stability",
    allocation: 30,
    priceRange: "حسب سعر السوق",
    description: "شراء 30% بعد استقرار السعر لمدة أسبوعين متتاليين",
    color: "from-teal-400 to-teal-600",
    bgLight: "bg-teal-50 dark:bg-teal-950/20",
    borderColor: "border-teal-300 dark:border-teal-800",
    icon: <Clock className="w-5 h-5" />,
  },
];

// ─── Price Evolution Timeline ───
const priceTimeline = [
  { period: "يناير 2025", price: 3730, change: null, type: "start" as const },
  { period: "مارس 2025", price: 3950, change: "+220", type: "up" as const },
  { period: "يونيو 2025", price: 4200, change: "+250", type: "up" as const },
  { period: "أغسطس 2025", price: 4590, change: "+390", type: "up" as const },
  { period: "أكتوبر 2025", price: 4850, change: "+260", type: "up" as const },
  { period: "ديسمبر 2025", price: 5800, change: "+950", type: "surge" as const },
  { period: "يناير 2026", price: 7040, change: "+1,240", type: "surge" as const },
  { period: "فبراير 2026", price: 6650, change: "-390", type: "down" as const },
  { period: "أبريل 2026", price: 6810, change: "+160", type: "up" as const },
  { period: "مايو 2026", price: 6500, change: "-310", type: "down" as const },
  { period: "يونيو 2026", price: 6170, change: "-330", type: "down" as const },
];

// ─── Gold Rules ───
const goldRules = [
  {
    icon: <DollarSign className="w-5 h-5" />,
    title: "راقب سعر الدولار",
    desc: "ارتفاع الدولار = ارتفاع الذهب. تحرك الذهب بنسبة 80-90% مع الدولار في مصر",
  },
  {
    icon: <Shield className="w-5 h-5" />,
    title: "التزم بالخطة المحددة",
    desc: "لا تشتري بعاطفة أو خوف من تفويت الفرصة (FOMO). عند قاع الذعر لا تتبع",
  },
  {
    icon: <BarChart3 className="w-5 h-5" />,
    title: "اختر العيار المناسب",
    desc: "عيار 21: الأكثر تداولاً وسهولة. عيار 18: أرخص بفجوة أكبر. عيار 24: أقل فجوة للبيع",
  },
  {
    icon: <Landmark className="w-5 h-5" />,
    title: "اشترِ من مصادر موثوقة",
    desc: "تعامل مع حلقات مسجلة لدى اتحاد الصناعات. احتفظ بالفواتير وختْم الدمغة والقياس",
  },
  {
    icon: <PiggyBank className="w-5 h-5" />,
    title: "اختر صناعة منخفضة",
    desc: "اختر سبائك أو عملات ذهبية بتصنيع منخفض (10-30 ج.م) بدلاً من المشغولات (50-150 ج.م)",
  },
  {
    icon: <Gem className="w-5 h-5" />,
    title: "نوّع استثماراتك",
    desc: "خصص 15-25% من محفظتك للذهب فقط. التنويع بين الذهب والودائع والعقارات والأسهم أكثر أماناً",
  },
  {
    icon: <Info className="w-5 h-5" />,
    title: "تابع أخبار الاقتصاد",
    desc: "التضخم وقرارات البنك المركزي وبيانات FOMC هي أقوى المحركات لسعر الذهب محلياً وعالمياً",
  },
];

// ─── Section Toggle Component ───
function SectionToggle({
  title,
  subtitle,
  icon,
  accentColor,
  children,
  defaultOpen = false,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accentColor: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl ring-1 ring-border/20 overflow-hidden bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${accentColor} flex items-center justify-center text-white shadow-md`}>
            {icon}
          </div>
          <div className="text-right">
            <h4 className="text-base font-bold">{title}</h4>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="text-muted-foreground">
          {open ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-border/20">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Component: InvestmentPlanTable ───
interface InvestmentPlanTableProps {
  plans: InvestmentPlan[];
  signal: SignalResult | null;
  currentPrice: number | null;
}

export function InvestmentPlanTable({
  plans,
  signal,
  currentPrice,
}: InvestmentPlanTableProps) {
  const activePlans = plans.filter((p) => p.active).sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4">
      {/* Main Strategy Card */}
      <Card className="rounded-2xl border-0 shadow-xl ring-1 ring-border/20 overflow-hidden">
        {/* Top accent */}
        <div className="h-1.5 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500" />
        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 px-5 py-4 flex items-center gap-3 border-b border-border/30">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-md shadow-amber-400/20">
            <Gem className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold">خطة الاستثمار — حتى نهاية 2026</h3>
            <p className="text-sm text-muted-foreground">Investment Strategy — ذهب عيار 21</p>
          </div>
        </div>
        <CardContent className="p-4 space-y-4">
          {/* Executive Summary */}
          <div className="rounded-xl bg-gradient-to-br from-amber-50/80 to-yellow-50/50 dark:from-amber-950/20 dark:to-yellow-950/10 p-4 ring-1 ring-amber-200/50 dark:ring-amber-800/30">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-400/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-amber-800 dark:text-amber-300 mb-1">الخلاصة التنفيذية</h4>
                <p className="text-sm text-muted-foreground leading-relaxed" dir="rtl">
                  التصحيح الحالي (%12 من القمة) يمثل فرصة شراء حقيقية مدعومة باستمرار البنك المركزي في الشراء والتوترات الجيوسياسية. 
                  ارتفاع 88% في عام واحد ثم تصحيح طبيعي — التزام بمنهج الشراء التدريجي (DCA) يقلل المخاطر بشكل كبير مقارنة بالشراء بدفعة واحدة.
                </p>
              </div>
            </div>
          </div>

          {/* DCA Strategy Phases */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h4 className="text-sm font-bold">استراتيجية الشراء التدريجي (DCA)</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {dcaPhases.map((phase, idx) => (
                <motion.div
                  key={phase.phase}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className={`rounded-xl p-4 ${phase.bgLight} ring-1 ${phase.borderColor}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-r ${phase.color} flex items-center justify-center text-white shadow-sm`}>
                      {phase.icon}
                    </div>
                    <div>
                      <span className="text-xs font-medium text-muted-foreground">المرحلة {phase.phase}</span>
                      <p className="text-sm font-bold">{phase.title}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex items-center justify-center w-12 h-8 rounded-lg bg-gradient-to-r ${phase.color} text-white text-sm font-black shadow-sm`}>
                      {phase.allocation}%
                    </span>
                    <span className="text-sm text-muted-foreground font-mono tabular-nums">
                      {phase.priceRange} ج.م
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{phase.description}</p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Buy/Sell Zone Table */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h4 className="text-sm font-bold">مناطق الشراء والبيع</h4>
            </div>
            <div className="rounded-xl ring-1 ring-border/20 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="py-2.5 px-3 text-right font-bold text-muted-foreground">المستوى (ج.م/جرام)</th>
                    <th className="py-2.5 px-3 text-right font-bold text-muted-foreground">الإجراء</th>
                    <th className="py-2.5 px-3 text-right font-bold text-muted-foreground">نسبة الميزانية</th>
                  </tr>
                </thead>
                <tbody>
                  {activePlans.map((plan, idx) => {
                    const config = getActionConfig(plan.action);
                    const isActive =
                      signal &&
                      signal.action === plan.action &&
                      signal.priceRangeMin === plan.priceRangeMin;
                    return (
                      <motion.tr
                        key={plan.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        className={`border-t border-border/10 ${isActive ? config.bg : ""} ${
                          isActive ? "font-bold" : ""
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono tabular-nums">
                          {plan.priceRangeMin.toLocaleString()} – {plan.priceRangeMax ? plan.priceRangeMax.toLocaleString() : "∞"}
                          {isActive && (
                            <Badge variant="outline" className="mr-2 border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 text-xs px-1.5 py-0 rounded-md">
                              نشط
                            </Badge>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`${config.badgeBg} text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow-sm inline-flex items-center gap-1`} dir="rtl">
                            {config.icon}
                            {plan.action}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`font-bold tabular-nums ${plan.expectedReturn > 0 ? "text-emerald-600" : plan.expectedReturn < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                            {plan.expectedReturn > 0 ? "+" : ""}{plan.expectedReturn}%
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expandable Sections */}
      <SectionToggle
        title="مسار تطور السعر 2025-2026"
        subtitle="Price Evolution Timeline"
        icon={<TrendingUp className="w-5 h-5" />}
        accentColor="bg-gradient-to-r from-amber-400 to-yellow-500"
      >
        <div className="mt-4 space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
          {priceTimeline.map((item, idx) => {
            const isSurge = item.type === "surge";
            const isDown = item.type === "down";
            const isStart = item.type === "start";
            return (
              <div key={idx} className={`flex items-center gap-3 py-2 px-3 rounded-xl ${
                isSurge ? "bg-red-50 dark:bg-red-950/10" : isDown ? "bg-amber-50 dark:bg-amber-950/10" : isStart ? "bg-muted/30" : "bg-emerald-50/50 dark:bg-emerald-950/5"
              }`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isSurge ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" :
                  isDown ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" :
                  isStart ? "bg-muted text-muted-foreground" :
                  "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                }`}>
                  {isSurge ? <TrendingUp className="w-4 h-4" /> : isDown ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">{item.period}</span>
                    <span className="text-sm font-mono font-bold tabular-nums">{item.price.toLocaleString()} ج.م</span>
                  </div>
                  {item.change && (
                    <span className={`text-xs font-bold ${
                      isSurge ? "text-red-600 dark:text-red-400" : isDown ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                    }`}>
                      {item.change}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SectionToggle>

      <SectionToggle
        title="المحركات الرئيسية"
        subtitle="Key Market Drivers"
        icon={<Zap className="w-5 h-5" />}
        accentColor="bg-gradient-to-r from-emerald-400 to-green-500"
      >
        <div className="mt-4 space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/10">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
              <Landmark className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-bold">شراء البنك المركزي مستمر</p>
              <p className="text-xs text-muted-foreground mt-0.5">التوترات الجيوسياسية وبنوك مركزية تشتري الذهب كأصل آمن — الدعم الأساسي مستمر</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-xl bg-green-50/50 dark:bg-green-950/10">
            <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-bold">سعر الدولار أهم عامل محلي</p>
              <p className="text-xs text-muted-foreground mt-0.5">كل حركة في الدولار تترجم فوراً إلى حركة مماثلة في سعر الذهب بالجنيه — نسبة ارتباط 80-90%</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-xl bg-teal-50/50 dark:bg-teal-950/10">
            <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center flex-shrink-0">
              <TrendingDown className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="text-sm font-bold">خفض الفائدة الأمريكية</p>
              <p className="text-xs text-muted-foreground mt-0.5">توقعات خفض الفائدة إلى 3.6% بنهاية 2026 — انخفاض الفائدة يعزز الذهب كمخزن للقيمة</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/10">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-bold">خفض فائدة البنك المركزي المصري</p>
              <p className="text-xs text-muted-foreground mt-0.5">خفض الفائدة المركزية في فبراير 2026 إلى 19% — يدعم توجيه الأموال نحو أصول ذات عوائد أعلى</p>
            </div>
          </div>
        </div>
      </SectionToggle>

      <SectionToggle
        title="نقاط القوة والمخاطر"
        subtitle="Strengths & Risks"
        icon={<AlertTriangle className="w-5 h-5" />}
        accentColor="bg-gradient-to-r from-amber-400 to-orange-500"
      >
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Strengths */}
          <div className="rounded-xl bg-emerald-50/50 dark:bg-emerald-950/10 p-4 ring-1 ring-emerald-200/50 dark:ring-emerald-800/30">
            <h5 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              نقاط القوة
            </h5>
            <ul className="space-y-2">
              <li className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                <span>اتجاه صاعد طويل الأمد — 565% مكاسب خلال 5 سنوات</span>
              </li>
              <li className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                <span>استمرار شراء البنوك المركزية والتوترات الجيوسياسية</span>
              </li>
              <li className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                <span>فجوة سعرية موثوقة — فارق 60 ج.م بين الشراء والبيع (≈1%)</span>
              </li>
              <li className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                <span>خفض الفائدة الأمريكية يجعل الذهب أكثر جاذبية</span>
              </li>
            </ul>
          </div>
          {/* Risks */}
          <div className="rounded-xl bg-red-50/50 dark:bg-red-950/10 p-4 ring-1 ring-red-200/50 dark:ring-red-800/30">
            <h5 className="text-sm font-bold text-red-700 dark:text-red-400 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              المخاطر
            </h5>
            <ul className="space-y-2">
              <li className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                <span>التصحيح قد يتعمق — عيار 12 قد ينخفض لأقل من 5,500 ج.م إذا وصل الدولار 4,000 أونصة</span>
              </li>
              <li className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                <span>استمرار التصحيح قد يكسر الذهب — ضغط على السعر المحلي حتى يرتفع عالمياً</span>
              </li>
              <li className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                <span>تقلب سعر الصرف — أي عافية للجنيه ترفع تكاليف التأمين والتخزين</span>
              </li>
              <li className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                <span>الذهب لا يولد عائداً — مع فائدة 19% قد يبدو أقل جاذبية</span>
              </li>
            </ul>
          </div>
        </div>
      </SectionToggle>

      <SectionToggle
        title="قواعد الذهب للمستثمر المصري"
        subtitle="7 Golden Rules"
        icon={<BookOpen className="w-5 h-5" />}
        accentColor="bg-gradient-to-r from-yellow-400 to-amber-500"
        defaultOpen={false}
      >
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {goldRules.map((rule, idx) => (
            <div key={idx} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors">
              <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0 text-amber-600 dark:text-amber-400">
                {rule.icon}
              </div>
              <div>
                <p className="text-xs font-bold">{rule.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{rule.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionToggle>

      <SectionToggle
        title="لمن تناسب هذه الاستراتيجية"
        subtitle="Who This Strategy Suits"
        icon={<Users className="w-5 h-5" />}
        accentColor="bg-gradient-to-r from-sky-400 to-blue-500"
        defaultOpen={false}
      >
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Suits */}
          <div className="rounded-xl bg-emerald-50/50 dark:bg-emerald-950/10 p-4 ring-1 ring-emerald-200/50 dark:ring-emerald-800/30">
            <h5 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              تناسب من...
            </h5>
            <ul className="space-y-2">
              <li className="flex items-start gap-2 text-xs text-muted-foreground">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                <span>أصحاب الدخل المحدود الذين يريدون دخلاً من ربط الذهب شهرياً</span>
              </li>
              <li className="flex items-start gap-2 text-xs text-muted-foreground">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                <span>من يرغبون في حماية أموالهم من أكلاه قيمة الجنيه المصري</span>
              </li>
              <li className="flex items-start gap-2 text-xs text-muted-foreground">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                <span>من يستطيعون الانتظار 6-12 شهر على الأقل</span>
              </li>
              <li className="flex items-start gap-2 text-xs text-muted-foreground">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                <span>المستثمرون الذين يملكون سيولة فائضة</span>
              </li>
            </ul>
          </div>
          {/* Does NOT Suit */}
          <div className="rounded-xl bg-red-50/50 dark:bg-red-950/10 p-4 ring-1 ring-red-200/50 dark:ring-red-800/30">
            <h5 className="text-sm font-bold text-red-700 dark:text-red-400 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              يجب أن يتجنبها من...
            </h5>
            <ul className="space-y-2">
              <li className="flex items-start gap-2 text-xs text-muted-foreground">
                <TrendingDown className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                <span>من لا يتحمل تقلبات السعر اليومية</span>
              </li>
              <li className="flex items-start gap-2 text-xs text-muted-foreground">
                <TrendingDown className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                <span>من يتوقع عافية قوية للجنيه المصري (قد يضغط على الذهب محلياً)</span>
              </li>
              <li className="flex items-start gap-2 text-xs text-muted-foreground">
                <TrendingDown className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                <span>من يحتاج أمواله على المدى القصير (أقل من 6 أشهر)</span>
              </li>
              <li className="flex items-start gap-2 text-xs text-muted-foreground">
                <TrendingDown className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                <span>من يبحث عن عوائد يومية سريعة</span>
              </li>
            </ul>
          </div>
        </div>
      </SectionToggle>

      {/* Immediate Action Tip */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/20 dark:to-green-950/20 p-4 ring-2 ring-emerald-300/50 dark:ring-emerald-700/30 shadow-lg"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 flex items-center justify-center shadow-md flex-shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-emerald-800 dark:text-emerald-300 mb-1">نصائح فورية للتنفيذ</h4>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ArrowRight className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                <span>ابدأ فوراً بشراء 40% من ميزانيتك عند المستويات الحالية (6,100-6,200 ج.م عيار 21)</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ArrowRight className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                <span>ضع تنبيهات سعرية عند مستوى 5,900 ج.م لتنفيذ المرحلة الثانية</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ArrowRight className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                <span>تابع سعر الأونصة عالمياً يومياً عبر TradingEconomics أو Investing.com</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ArrowRight className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                <span>راقب سعر الدولار مقابل الجنيه من موقع البنك المركزي المصري</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ArrowRight className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                <span>سجّل كل عملية شراء بالتفصيل: التاريخ، السعر، العيار، الوزن، المصدر</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ArrowRight className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                <span>أعد تقييم الاستراتيجية كل 3 أشهر بناءً على تطورات السوق</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Current Signal Card ───
interface CurrentSignalCardProps {
  signal: SignalResult | null;
  currentPrice: number | null;
}

export function CurrentSignalCard({ signal, currentPrice }: CurrentSignalCardProps) {
  if (!signal) {
    return (
      <Card className="rounded-2xl border-0 shadow-xl ring-1 ring-border/20 overflow-hidden h-full">
        <div className="h-1.5 bg-muted" />
        <div className="bg-gradient-to-r from-muted/50 to-muted/30 px-5 py-4 flex items-center gap-3 border-b border-border/30">
          <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
            <Minus className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-base font-bold">الإشارة الحالية</h3>
            <p className="text-sm text-muted-foreground">Current Signal</p>
          </div>
        </div>
        <CardContent className="p-5">
          <div className="text-center py-4">
            {currentPrice ? (
              <>
                <p className="text-muted-foreground text-sm">
                  السعر الحالي:{" "}
                  <span className="font-mono font-black text-foreground text-xl tabular-nums">
                    {currentPrice.toLocaleString()} EGP/g
                  </span>
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  لا توجد خطة مطابقة
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-base">
                لا توجد بيانات سعر متاحة
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const config = getActionConfig(signal.action);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 15 }}
      className="h-full"
    >
      <Card className={`rounded-2xl border-0 shadow-xl ring-2 ${config.border} overflow-hidden h-full`}>
        {/* Top gradient bar */}
        <div className={`h-1.5 bg-gradient-to-r ${config.gradient}`} />
        <div className="bg-gradient-to-r from-muted/30 to-transparent px-5 py-4 flex items-center gap-3 border-b border-border/30">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-md shadow-amber-400/20">
            <Target className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold">الإشارة الحالية</h3>
            <p className="text-sm text-muted-foreground">Current Signal</p>
          </div>
        </div>
        <CardContent className="p-5">
          <div className="flex flex-col gap-4">
            <div className={`${config.badgeBg} text-white text-base font-bold px-4 py-2.5 rounded-xl shadow-md flex items-center gap-2 justify-center`} dir="rtl">
              {config.icon}
              {signal.action}
            </div>
            <div className="text-center">
              <p className="text-3xl font-black font-mono text-foreground tabular-nums">
                {currentPrice?.toLocaleString()}
                <span className="text-base text-muted-foreground font-medium ml-1">EGP/g</span>
              </p>
              <p
                className={`text-base font-bold mt-2 ${
                  signal.expectedReturn > 0
                    ? "text-emerald-600"
                    : signal.expectedReturn < 0
                    ? "text-red-600"
                    : "text-muted-foreground"
                }`}
              >
                العائد: {signal.expectedReturn > 0 ? "+" : ""}
                {signal.expectedReturn}%
              </p>
            </div>
            <p className="text-sm text-muted-foreground text-center" dir="rtl">
              {signal.label}
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
