"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  PricesResponse,
  NotificationLog,
  AppConfig,
  PriceHistoryResponse,
  CalculatorPriceResult,
  TelegramUser,
} from "@/lib/dashboard-types";

export function useDashboardData() {
  const [prices, setPrices] = useState<PricesResponse>({ gold: null, usdEgp: null, allKarats: [], goldPound: null });
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryResponse>({ records: [], count: 0 });
  const [calculatorData, setCalculatorData] = useState<CalculatorPriceResult | null>(null);
  const [telegramUsers, setTelegramUsers] = useState<TelegramUser[]>([]);

  const [loading, setLoading] = useState({
    prices: true,
    logs: true,
    config: true,
    history: false,
    fetching: false,
    automation: false,
    calculator: true,
  });

  const [lastAutomationRun, setLastAutomationRun] = useState<string | null>(null);
  const [lastWebFetch, setLastWebFetch] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoFetchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seededRef = useRef(false);
  const isFetchingRef = useRef(false);
  const lastFetchAttemptRef = useRef<number>(0);

  // Seed data on first load + initialize cron scheduler
  const seedData = useCallback(async () => {
    if (seededRef.current) return;
    try {
      await fetch("/api/config");
      // Initialize cron scheduler (hourly Telegram reports)
      await fetch("/api/cron/init");
      seededRef.current = true;
    } catch (err) {
      console.error("Seed error:", err);
    }
  }, []);

  // Fetch prices from DB (lightweight GET)
  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch("/api/prices");
      if (res.ok) {
        const data = await res.json();
        setPrices(data);
        return data;
      }
    } catch (err) {
      console.error("Fetch prices error:", err);
    }
    return null;
  }, []);

  // Fetch config
  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        return data;
      }
    } catch (err) {
      console.error("Fetch config error:", err);
    }
    return null;
  }, []);

  // Fetch logs
  const fetchLogs = useCallback(async (type?: string, limit = 50) => {
    try {
      const params = new URLSearchParams();
      if (type && type !== "all") params.set("type", type);
      params.set("limit", String(limit));
      const res = await fetch(`/api/logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        return data;
      }
    } catch (err) {
      console.error("Fetch logs error:", err);
    }
    return null;
  }, []);

  // Fetch price history
  const fetchPriceHistory = useCallback(async (symbol = "GOLD_EGP", days = 30) => {
    setLoading((prev) => ({ ...prev, history: true }));
    try {
      const params = new URLSearchParams({ symbol, days: String(days) });
      const res = await fetch(`/api/prices/history?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPriceHistory(data);
        return data;
      }
    } catch (err) {
      console.error("Fetch history error:", err);
    } finally {
      setLoading((prev) => ({ ...prev, history: false }));
    }
    return null;
  }, []);

  // Fetch calculator prices
  const fetchCalculatorData = useCallback(async () => {
    setLoading((prev) => ({ ...prev, calculator: true }));
    try {
      const res = await fetch("/api/calculator");
      if (res.ok) {
        const data = await res.json();
        setCalculatorData(data);
        return data;
      }
    } catch (err) {
      console.error("Fetch calculator error:", err);
    } finally {
      setLoading((prev) => ({ ...prev, calculator: false }));
    }
    return null;
  }, []);

  // Trigger manual price fetch from the web (POST)
  const triggerFetchPrices = useCallback(async () => {
    if (isFetchingRef.current) {
      await fetchPrices();
      return null;
    }
    isFetchingRef.current = true;
    lastFetchAttemptRef.current = Date.now();
    setLoading((prev) => ({ ...prev, fetching: true }));
    try {
      const res = await fetch("/api/prices", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setPrices({ gold: data.gold, usdEgp: data.usdEgp, allKarats: data.allKarats || [], goldPound: data.goldPound || null });
        setLastWebFetch(new Date().toISOString());
        return data;
      } else {
        try {
          const errorData = await res.json();
          if (errorData.gold || errorData.usdEgp) {
            setPrices({ gold: errorData.gold, usdEgp: errorData.usdEgp, allKarats: errorData.allKarats || [], goldPound: errorData.goldPound || null });
          }
          console.error("Fetch prices error:", errorData.error || errorData.message);
        } catch {
          console.error("Fetch prices error: Unknown error");
        }
        await fetchPrices();
        return null;
      }
    } catch (err) {
      console.error("Network error fetching prices:", err);
      await fetchPrices();
      return null;
    } finally {
      setLoading((prev) => ({ ...prev, fetching: false }));
      isFetchingRef.current = false;
    }
  }, [fetchPrices]);

  // Update config
  const updateConfig = useCallback(async (key: string, value: string) => {
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (res.ok) {
        setConfig((prev) => (prev ? { ...prev, [key]: value } : null));
        return true;
      }
    } catch (err) {
      console.error("Update config error:", err);
    }
    return false;
  }, []);

  // Test telegram
  const testTelegram = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/test", { method: "POST" });
      const data = await res.json();
      return data;
    } catch (err) {
      console.error("Test telegram error:", err);
      return { ok: false, error: "Network error" };
    }
  }, []);

  // Run automation
  const runAutomation = useCallback(async () => {
    setLoading((prev) => ({ ...prev, automation: true }));
    try {
      const res = await fetch("/api/automation/run", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setLastAutomationRun(new Date().toISOString());
        await Promise.all([fetchPrices(), fetchLogs()]);
        return data;
      } else {
        throw new Error(data.error || "Automation failed");
      }
    } finally {
      setLoading((prev) => ({ ...prev, automation: false }));
    }
  }, [fetchPrices, fetchLogs]);

  // ==========================================
  // Telegram Users Management
  // ==========================================

  // Fetch telegram users
  const fetchTelegramUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram-users");
      if (res.ok) {
        const data = await res.json();
        setTelegramUsers(Array.isArray(data) ? data : []);
        return data;
      }
    } catch (err) {
      console.error("Fetch telegram users error:", err);
    }
    return [];
  }, []);

  // Add telegram user
  const addTelegramUser = useCallback(async (name: string, botToken: string, chatId: string) => {
    try {
      const res = await fetch("/api/telegram-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, botToken, chatId }),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchTelegramUsers();
        return { ok: true, data };
      }
      return { ok: false, error: data.error || "فشل في إضافة المستخدم" };
    } catch (err) {
      console.error("Add telegram user error:", err);
      return { ok: false, error: "خطأ في الاتصال" };
    }
  }, [fetchTelegramUsers]);

  // Delete telegram user
  const deleteTelegramUser = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/telegram-users/${id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchTelegramUsers();
        return true;
      }
      return false;
    } catch (err) {
      console.error("Delete telegram user error:", err);
      return false;
    }
  }, [fetchTelegramUsers]);

  // Toggle telegram user active status
  const toggleTelegramUser = useCallback(async (id: string, active: boolean) => {
    try {
      const res = await fetch(`/api/telegram-users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (res.ok) {
        await fetchTelegramUsers();
        return true;
      }
      return false;
    } catch (err) {
      console.error("Toggle telegram user error:", err);
      return false;
    }
  }, [fetchTelegramUsers]);

  // Test telegram user connection
  const testTelegramUser = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/telegram-users/${id}/test`, { method: "POST" });
      const data = await res.json();
      return data;
    } catch (err) {
      console.error("Test telegram user error:", err);
      return { ok: false, error: "خطأ في الاتصال" };
    }
  }, []);

  // Initial data load
  useEffect(() => {
    const init = async () => {
      await seedData();
      await Promise.all([
        fetchPrices(),
        fetchConfig(),
        fetchLogs(),
        fetchCalculatorData(),
        fetchTelegramUsers(),
      ]);
      setLoading((prev) => ({
        ...prev,
        prices: false,
        logs: false,
        config: false,
        calculator: false,
      }));
    };
    init();
  }, [seedData, fetchPrices, fetchConfig, fetchLogs, fetchCalculatorData]);

  // =============================================
  // Polling: Read DB prices every 10 seconds
  // =============================================
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(() => {
      fetchPrices();
    }, 10000);
  }, [fetchPrices]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // =============================================
  // Auto-fetch: Fetch fresh prices from the web
  // every 2 minutes in the background
  // =============================================
  const startAutoFetch = useCallback(() => {
    if (autoFetchIntervalRef.current) clearInterval(autoFetchIntervalRef.current);
    autoFetchIntervalRef.current = setInterval(() => {
      triggerFetchPrices();
    }, 120000);
  }, [triggerFetchPrices]);

  const stopAutoFetch = useCallback(() => {
    if (autoFetchIntervalRef.current) {
      clearInterval(autoFetchIntervalRef.current);
      autoFetchIntervalRef.current = null;
    }
  }, []);

  // Start both polling and auto-fetch
  useEffect(() => {
    startPolling();
    startAutoFetch();
    return () => {
      stopPolling();
      stopAutoFetch();
    };
  }, [startPolling, stopPolling, startAutoFetch, stopAutoFetch]);

  return {
    prices,
    logs,
    config,
    priceHistory,
    calculatorData,
    telegramUsers,
    loading,
    lastAutomationRun,
    lastWebFetch,
    fetchPrices,
    fetchConfig,
    fetchLogs,
    fetchPriceHistory,
    triggerFetchPrices,
    updateConfig,
    testTelegram,
    runAutomation,
    fetchCalculatorData,
    fetchTelegramUsers,
    addTelegramUser,
    deleteTelegramUser,
    toggleTelegramUser,
    testTelegramUser,
  };
}
