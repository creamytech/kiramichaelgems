import { useState, useEffect, useCallback } from "react";

const CACHE_KEY = "km-geo-tax";
const CACHE_TTL = 30 * 60 * 1000; // 30 min

function getCached() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return (Date.now() - c.ts < CACHE_TTL) ? c : null;
  } catch { return null; }
}

export default function useGeoTax() {
  const [tax, setTax] = useState(() => {
    const c = getCached();
    return c || { taxRate: null, county: null, city: null, note: null, loading: false, error: null };
  });

  const detect = useCallback(async () => {
    const cached = getCached();
    if (cached?.taxRate) {
      setTax({ ...cached, loading: false, error: null });
      return cached;
    }

    setTax(p => ({ ...p, loading: true, error: null }));

    try {
      // Get user location
      const pos = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) reject(new Error("Geolocation not available"));
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false, timeout: 8000, maximumAge: 300000,
        });
      });

      const { latitude, longitude } = pos.coords;

      // Call our API route for tax lookup
      const res = await fetch(`/api/tax?lat=${latitude}&lon=${longitude}`);
      if (!res.ok) throw new Error("Tax API failed");
      const data = await res.json();

      const result = { ...data, ts: Date.now(), loading: false, error: null };
      setTax(result);
      localStorage.setItem(CACHE_KEY, JSON.stringify(result));
      return result;
    } catch (err) {
      const result = { taxRate: null, county: null, note: null, loading: false, error: err.message };
      setTax(result);
      return result;
    }
  }, []);

  return { ...tax, detect };
}
