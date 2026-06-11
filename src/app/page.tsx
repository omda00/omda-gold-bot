"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/dashboard/header";
import { GoldCalculator } from "@/components/dashboard/gold-calculator";
import { DashboardFooter } from "@/components/dashboard/footer";
import type { CalculatorPriceResult } from "@/lib/dashboard-types";

export default function Home() {
  const [calculatorData, setCalculatorData] = useState<CalculatorPriceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [lastAutomationRun, setLastAutomationRun] = useState<string | null>(null);

  // Fetch calculator data from DB
  const fetchCalculatorData = useCallback(async (): Promise<CalculatorPriceResult | null> => {
    try {
      const res = await fetch("/api/calculator");
      if (res.ok) {
        const data = await res.json();
        setCalculatorData(data);
        return data;
      }
    } catch (err) {
      console.error("Fetch calculator error:", err);
    }
    return null;
  }, []);

  // Fetch config for header/footer status
  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      if (res.ok) {
        const data = await res.json();
        setAutomationEnabled(data?.AUTOMATION_ENABLED === "true");
      }
    } catch (err) {
      console.error("Fetch config error:", err);
    }
  }, []);

  // Trigger background price fetch
  const triggerPriceFetch = useCallback(async () => {
    try {
      await fetch("/api/prices", { method: "POST" });
    } catch (err) {
      console.error("Price fetch trigger error:", err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchCalculatorData(), fetchConfig()]);
      setLoading(false);
    };
    init();
  }, [fetchCalculatorData, fetchConfig]);

  // Auto-refresh calculator data every 1 second (lightweight DB read)
  useEffect(() => {
    const pollInterval = setInterval(() => {
      fetchCalculatorData();
    }, 1000);
    return () => clearInterval(pollInterval);
  }, [fetchCalculatorData]);

  // Auto-fetch fresh prices from web every 1 minute
  useEffect(() => {
    triggerPriceFetch();
    const autoFetchInterval = setInterval(() => {
      triggerPriceFetch();
    }, 60000);
    return () => clearInterval(autoFetchInterval);
  }, [triggerPriceFetch]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-amber-50/10 dark:to-amber-950/5">
      <DashboardHeader automationEnabled={automationEnabled} />

      <main className="flex-1 max-w-3xl mx-auto w-full px-3 sm:px-6 py-3 sm:py-5">
        <GoldCalculator
          calculatorData={calculatorData}
          loading={loading}
          onFetch={fetchCalculatorData}
        />
      </main>

      <DashboardFooter
        automationEnabled={automationEnabled}
        lastAutomationRun={lastAutomationRun}
      />
    </div>
  );
}
