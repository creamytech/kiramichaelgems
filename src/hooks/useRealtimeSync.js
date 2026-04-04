import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

const SINGLE_ROW = new Set(["settings", "inventory"]);

// Fetches directly from Supabase, NO cache
async function fetchDirect(table) {
  if (!supabase) return null;
  try {
    let q = supabase.from(table).select("*");
    if (!SINGLE_ROW.has(table)) q = q.order("id", { ascending: false });
    const { data, error } = await q;
    if (error || !data || data.length === 0) return null;
    if (SINGLE_ROW.has(table)) return data[0].data;
    return data.map(r => r.data);
  } catch { return null; }
}

export default function useRealtimeSync({ interval = 8000, onSync }) {
  const timer = useRef(null);
  const lastHash = useRef({});

  useEffect(() => {
    if (!supabase) return;

    async function poll() {
      const tables = ["orders", "sellers", "shows", "inventory"];
      for (const table of tables) {
        try {
          const data = await fetchDirect(table);
          if (data === null) continue;
          const hash = JSON.stringify(data);
          if (lastHash.current[table] !== undefined && lastHash.current[table] !== hash) {
            onSync?.(table, data);
          }
          lastHash.current[table] = hash;
        } catch {}
      }
    }

    // Initial snapshot
    poll();

    // Poll every interval
    timer.current = setInterval(poll, interval);

    // Also poll when app regains focus
    function onVisible() {
      if (document.visibilityState === "visible") poll();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [interval, onSync]);
}
