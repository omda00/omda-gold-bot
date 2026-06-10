"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  PricesResponse,
  InvestmentPlan,
  NotificationLog,
  AppConfig,
  PriceHistoryResponse,
  SignalResult,
} from "@/lib/dashboard-types";

export function useDashboardData() {
  const [prices, setPrices] = useState<PricesResponse>({ gold: null, usdEgp: null });
  const [plans, setPlans] = useState<InvestmentPlan[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryResponse>({ records: [], count: 0 });
  const [signal, setSignal] = useState<SignalResult | null>(null);

  const [loading, setLoading] = useState({
    prices: true,
    plans: true,
    logs: true,
    config: true,
    history: false,
    fetching: false,
    automation: false,
  });

  const [lastAutomationRun, setLastAutomationRun] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seededRef = useRef(false);

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

  // Fetch prices
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

  // Trigger manual price fetch
  const triggerFetchPrices = useCallback(async () => {
    setLoading((prev) => ({ ...prev, fetching: true }));
    try {
      const res = await fetch("/api/prices", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setPrices({ gold: data.gold, usdEgp: data.usdEgp });
        return data;
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to fetch prices");
      }
    } finally {
      setLoading((prev) => ({ ...prev, fetching: false }));
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
      ]);
      setLoading((prev) => ({
        ...prev,
        prices: false,
        plans: false,
        logs: false,
        config: false,
      }));
    };
    init();
  }, [seedData, fetchPrices, fetchPlans, fetchConfig, fetchLogs]);

  // Update signal when prices or plans change
  useEffect(() => {
    detectCurrentSignal(prices.gold?.price ?? null);
  }, [prices.gold?.price, plans, detectCurrentSignal]);

  // Poll for prices every 60 seconds
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(() => {
      fetchPrices();
    }, 60000);
  }, [fetchPrices]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Auto-poll when on dashboard
  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  return {
    prices,
    plans,
    logs,
    config,
    priceHistory,
    signal,
    loading,
    lastAutomationRun,
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
    detectCurrentSignal,
  };
}
