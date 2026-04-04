import { useState, useEffect, useCallback } from "react";

const CACHE_KEY = "km-metal-prices";
const CACHE_TTL = 10 * 60 * 1000; // 10 min

function getCached() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return (Date.now() - c.ts < CACHE_TTL) ? c : null;
  } catch { return null; }
}

// Multiple free APIs to try (CORS-friendly)
const APIS = [
  {
    url: "https://api.metals.live/v1/spot",
    parse: (d) => { const s = Array.isArray(d)?d[0]:d; return { gold:s.gold||s.Gold, silver:s.silver||s.Silver }; },
  },
  {
    url: "https://api.metals.dev/v1/latest?api_key=demo&currency=USD&unit=toz",
    parse: (d) => ({ gold:d.metals?.gold, silver:d.metals?.silver }),
  },
  {
    // Fallback: use a public proxy to fetch from another source
    url: "https://data-asg.goldprice.org/dbXRates/USD",
    parse: (d) => {
      const items = d.items || [];
      const xau = items.find(i=>i.curr==="USD");
      return { gold: xau?.xauPrice, silver: xau?.xagPrice };
    },
  },
];

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

    for (const api of APIS) {
      try {
        const res = await fetch(api.url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) continue;
        const data = await res.json();
        const { gold, silver } = api.parse(data);
        if (gold && gold > 100) { // sanity check
          const result = { gold, silver: silver||null, ts: Date.now(), loading: false, error: null };
          setPrices(result);
          localStorage.setItem(CACHE_KEY, JSON.stringify(result));
          return;
        }
      } catch { continue; }
    }

    // All failed
    const stale = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    setPrices({
      gold: stale?.gold || null,
      silver: stale?.silver || null,
      ts: stale?.ts || 0,
      loading: false,
      error: "Could not fetch live prices",
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...prices, refresh };
}
