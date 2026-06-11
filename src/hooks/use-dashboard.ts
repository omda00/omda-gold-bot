"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  PricesResponse,
  InvestmentPlan,
  NotificationLog,
  AppConfig,
  PriceHistoryResponse,
  SignalResult,
  CalculatorPriceResult,
} from "@/lib/dashboard-types";

export function useDashboardData() {
  const [prices, setPrices] = useState<PricesResponse>({ gold: null, usdEgp: null });
  const [plans, setPlans] = useState<InvestmentPlan[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryResponse>({ records: [], count: 0 });
  const [signal, setSignal] = useState<SignalResult | null>(null);
  const [calculatorData, setCalculatorData] = useState<CalculatorPriceResult | null>(null);

  const [loading, setLoading] = useState({
    prices: true,
    plans: true,
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

  // Seed data on first load
  const seedData = useCallback(async () => {
    if (seededRef.current) return;
    try {
      // Seed config
      await fetch("/api/config");
      // Seed investment plan if none exist
      const planRes = await fetch("/api/plan");
      const planData = await planRes.json();
      if (Array.isArray(planData) && planData.length === 0) {
        await fetch("/api/plan/seed", { method: "POST" });
      }
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

  // Fetch plans
  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch("/api/plan");
      if (res.ok) {
        const data = await res.json();
        setPlans(Array.isArray(data) ? data : []);
        return data;
      }
    } catch (err) {
      console.error("Fetch plans error:", err);
    }
    return [];
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
    // Prevent concurrent fetches
    if (isFetchingRef.current) return null;
    isFetchingRef.current = true;
    setLoading((prev) => ({ ...prev, fetching: true }));
    try {
      const res = await fetch("/api/prices", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setPrices({ gold: data.gold, usdEgp: data.usdEgp });
        setLastWebFetch(new Date().toISOString());
        return data;
      } else {
        // Even on error, try to get the latest prices from the response
        try {
          const errorData = await res.json();
          // The API might still return cached prices
          if (errorData.gold || errorData.usdEgp) {
            setPrices({ gold: errorData.gold, usdEgp: errorData.usdEgp });
          }
          console.error("Fetch prices error:", errorData.error || errorData.message);
        } catch {
          console.error("Fetch prices error: Unknown error");
        }
        return null;
      }
    } catch (err) {
      console.error("Network error fetching prices:", err);
      return null;
    } finally {
      setLoading((prev) => ({ ...prev, fetching: false }));
      isFetchingRef.current = false;
    }
  }, []);

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

  // Send telegram message
  const sendTelegramMessage = useCallback(async (message: string) => {
    try {
      const res = await fetch("/api/telegram/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      return data;
    } catch (err) {
      console.error("Send telegram error:", err);
      return { ok: false, error: "Network error" };
    }
  }, []);

  // Seed default plan
  const seedPlan = useCallback(async () => {
    try {
      const res = await fetch("/api/plan/seed", { method: "POST" });
      if (res.ok) {
        await fetchPlans();
        return true;
      }
    } catch (err) {
      console.error("Seed plan error:", err);
    }
    return false;
  }, [fetchPlans]);

  // Save plans
  const savePlans = useCallback(async (updatedPlans: InvestmentPlan[]) => {
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedPlans),
      });
      if (res.ok) {
        await fetchPlans();
        return true;
      }
    } catch (err) {
      console.error("Save plans error:", err);
    }
    return false;
  }, [fetchPlans]);

  // Run automation
  const runAutomation = useCallback(async () => {
    setLoading((prev) => ({ ...prev, automation: true }));
    try {
      const res = await fetch("/api/automation/run", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setLastAutomationRun(new Date().toISOString());
        // Refresh prices and logs
        await Promise.all([fetchPrices(), fetchLogs(), fetchPlans()]);
        return data;
      } else {
        throw new Error(data.error || "Automation failed");
      }
    } finally {
      setLoading((prev) => ({ ...prev, automation: false }));
    }
  }, [fetchPrices, fetchLogs, fetchPlans]);

  // Detect current signal
  const detectCurrentSignal = useCallback(
    (goldPrice: number | null) => {
      if (goldPrice === null || !plans.length) {
        setSignal(null);
        return;
      }
      const activePlans = plans.filter((p) => p.active).sort((a, b) => a.order - b.order);
      for (const p of activePlans) {
        const minOk = goldPrice >= p.priceRangeMin;
        const maxOk = p.priceRangeMax === null || goldPrice <= p.priceRangeMax;
        if (minOk && maxOk) {
          setSignal({
            action: p.action,
            label: p.label,
            priceRangeMin: p.priceRangeMin,
            priceRangeMax: p.priceRangeMax,
            expectedReturn: p.expectedReturn,
          });
          return;
        }
      }
      setSignal(null);
    },
    [plans]
  );

  // Initial data load
  useEffect(() => {
    const init = async () => {
      await seedData();
      const [, planData, configData] = await Promise.all([
        fetchPrices(),
        fetchPlans(),
        fetchConfig(),
        fetchLogs(),
        fetchCalculatorData(),
      ]);
      setLoading((prev) => ({
        ...prev,
        prices: false,
        plans: false,
        logs: false,
        config: false,
        calculator: false,
      }));
    };
    init();
  }, [seedData, fetchPrices, fetchPlans, fetchConfig, fetchLogs, fetchCalculatorData]);

  // Update signal when prices or plans change
  useEffect(() => {
    detectCurrentSignal(prices.gold?.price ?? null);
  }, [prices.gold?.price, plans, detectCurrentSignal]);

  // =============================================
  // Polling: Read DB prices every 1 second
  // This is lightweight and ensures the UI always
  // shows the latest data from the database
  // =============================================
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(() => {
      fetchPrices();
    }, 1000);
  }, [fetchPrices]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // =============================================
  // Auto-fetch: Fetch fresh prices from the web
  // every 30 seconds in the background
  // This keeps the database updated so the 1-second
  // polling always shows relatively fresh data
  // =============================================
  const startAutoFetch = useCallback(() => {
    if (autoFetchIntervalRef.current) clearInterval(autoFetchIntervalRef.current);
    // Fetch immediately on start
    triggerFetchPrices();
    // Then every 30 seconds
    autoFetchIntervalRef.current = setInterval(() => {
      triggerFetchPrices();
    }, 30000);
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
    plans,
    logs,
    config,
    priceHistory,
    signal,
    calculatorData,
    loading,
    lastAutomationRun,
    lastWebFetch,
    fetchPrices,
    fetchPlans,
    fetchConfig,
    fetchLogs,
    fetchPriceHistory,
    triggerFetchPrices,
    updateConfig,
    testTelegram,
    sendTelegramMessage,
    seedPlan,
    savePlans,
    runAutomation,
    fetchCalculatorData,
    detectCurrentSignal,
  };
}
