import { useState, useEffect, useCallback } from "react";

const CACHE_KEY = "km-metal-prices";
const CACHE_TTL = 10 * 60 * 1000; // 10 min cache

function getCached() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.ts < CACHE_TTL) return cached;
    return null;
  } catch { return null; }
}

export default function useMetalPrices() {
  const [prices, setPrices] = useState(() => {
    const c = getCached();
    return c || { gold: null, silver: null, ts: 0, loading: true, error: null };
  });

  const fetch_ = useCallback(async () => {
    // Check cache first
    const cached = getCached();
    if (cached && cached.gold) {
      setPrices({ ...cached, loading: false, error: null });
      return;
    }

    setPrices(p => ({ ...p, loading: true, error: null }));

    try {
      // Try metals.live (free, no key)
      const res = await fetch("https://api.metals.live/v1/spot", {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // metals.live returns array: [{gold: price, silver: price, ...}]
      const spot = Array.isArray(data) ? data[0] : data;
      const gold = spot.gold || spot.Gold || null;
      const silver = spot.silver || spot.Silver || null;

      if (!gold) throw new Error("No gold price in response");

      const result = { gold, silver, ts: Date.now(), loading: false, error: null };
      setPrices(result);
      localStorage.setItem(CACHE_KEY, JSON.stringify(result));
    } catch (err) {
      console.warn("Metal price fetch failed:", err.message);
      // Try fallback: goldpricez (no CORS issues typically)
      try {
        const res2 = await fetch("https://api.goldpricez.com/v1/rates/gold/usd", {
          signal: AbortSignal.timeout(8000),
        });
        if (res2.ok) {
          const d2 = await res2.json();
          const gold = d2.price || d2.rate || null;
          if (gold) {
            const result = { gold, silver: prices.silver, ts: Date.now(), loading: false, error: null };
            setPrices(result);
            localStorage.setItem(CACHE_KEY, JSON.stringify(result));
            return;
          }
        }
      } catch {}

      setPrices(p => ({
        ...p,
        loading: false,
        error: err.message,
        // Keep stale data if we have any
        gold: p.gold || getCached()?.gold || null,
        silver: p.silver || getCached()?.silver || null,
      }));
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { ...prices, refresh: fetch_ };
}
