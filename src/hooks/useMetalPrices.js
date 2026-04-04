import { useState, useEffect, useCallback } from "react";

const CACHE_KEY = "km-metal-prices";
const CACHE_TTL = 5 * 60 * 1000; // 5 min

function getCached() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return (Date.now() - c.ts < CACHE_TTL) ? c : null;
  } catch { return null; }
}

export default function useMetalPrices() {
  const [prices, setPrices] = useState(() => {
    const c = getCached();
    return c || { gold: null, silver: null, ts: 0, loading: true, error: null };
  });

  const refresh = useCallback(async () => {
    const cached = getCached();
    if (cached?.gold) {
      setPrices({ ...cached, loading: false, error: null });
      return;
    }

    setPrices(p => ({ ...p, loading: true, error: null }));

    try {
      // Use our own Vercel API route — no CORS issues
      const res = await fetch("/api/metals", { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.gold && data.gold > 100) {
        const result = { gold: data.gold, silver: data.silver || null, ts: Date.now(), loading: false, error: null };
        setPrices(result);
        localStorage.setItem(CACHE_KEY, JSON.stringify(result));
        return;
      }
      throw new Error("Invalid price data");
    } catch (err) {
      // Fallback: try direct API calls (may work on some browsers)
      for (const url of [
        "https://data-asg.goldprice.org/dbXRates/USD",
        "https://api.metals.live/v1/spot",
      ]) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
          if (!res.ok) continue;
          const d = await res.json();
          let gold, silver;
          if (d.items) { // goldprice.org
            const item = d.items[0];
            gold = item?.xauPrice; silver = item?.xagPrice;
          } else { // metals.live
            const s = Array.isArray(d) ? d[0] : d;
            gold = s?.gold || s?.Gold; silver = s?.silver || s?.Silver;
          }
          if (gold && gold > 100) {
            const result = { gold, silver: silver || null, ts: Date.now(), loading: false, error: null };
            setPrices(result);
            localStorage.setItem(CACHE_KEY, JSON.stringify(result));
            return;
          }
        } catch { continue; }
      }

      // All failed — use stale cache if available
      const stale = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      setPrices({
        gold: stale?.gold || null, silver: stale?.silver || null,
        ts: stale?.ts || 0, loading: false,
        error: "Could not fetch live prices",
      });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...prices, refresh };
}
