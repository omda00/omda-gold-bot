// Types for the AI Workflow Automation Platform Dashboard

export interface PriceRecord {
  id: string;
  symbol: string;
  price: number;
  currency: string;
  change: number | null;
  source: string | null;
  buyPrice: number | null;
  sellPrice: number | null;
  createdAt: string;
}

export interface KaratPriceRecord {
  karat: number;
  sellPrice: number | null;
  buyPrice: number | null;
}

export interface PricesResponse {
  gold: PriceRecord | null;
  usdEgp: PriceRecord | null;
  allKarats: KaratPriceRecord[];
}

export interface InvestmentPlan {
  id: string;
  priceRangeMin: number;
  priceRangeMax: number | null;
  action: string;
  expectedReturn: number;
  label: string;
  order: number;
  active: boolean;
}

export interface NotificationLog {
  id: string;
  type: string;
  title: string;
  message: string;
  sentAt: string;
  success: boolean;
  error: string | null;
}

export interface AppConfig {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  AUTOMATION_ENABLED: string;
  DAILY_REPORT_TIME: string;
  USD_DROP_THRESHOLD: string;
  [key: string]: string;
}

export interface PriceHistoryResponse {
  records: PriceRecord[];
  count: number;
}

export interface SignalResult {
  action: string;
  label: string;
  priceRangeMin: number;
  priceRangeMax: number | null;
  expectedReturn: number;
}

export interface AutomationResult {
  prices?: {
    gold?: { price: number; change: number };
    usdEgp?: { price: number; change: number };
  };
  signals?: { action: string; label: string } | null;
  usdDrop?: boolean;
  notifications?: { type: string; sent: boolean; error?: string }[];
  errors?: string[];
}

// Calculator types
export interface KaratPrice {
  karat: number;
  sellPrice: number | null;
  buyPrice: number | null;
}

export interface GoldPoundPrice {
  sellPrice: number | null;
  buyPrice: number | null;
}

export interface CalculatorPriceResult {
  karats: KaratPrice[];
  goldPound: GoldPoundPrice;
  source: string;
  fetchedAt: string;
}

// Telegram User types
export interface TelegramUser {
  id: string;
  name: string;
  botToken: string; // Masked in API responses
  chatId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
