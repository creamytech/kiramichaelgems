import { useEffect, useRef } from "react";
import { supabase, dbLoad } from "../lib/supabase";
import { store } from "../theme";

// Polls Supabase every N seconds and updates state if cloud data changed
export default function useRealtimeSync({ interval = 8000, onSync }) {
  const timer = useRef(null);
  const lastHash = useRef({});

  useEffect(() => {
    if (!supabase) return;

    async function poll() {
      try {
        const tables = ["orders", "sellers", "shows", "inventory"];
        for (const table of tables) {
          const data = await dbLoad(table);
          const hash = JSON.stringify(data);
          if (lastHash.current[table] && lastHash.current[table] !== hash) {
            // Data changed in cloud — notify app
            onSync?.(table, data);
          }
          lastHash.current[table] = hash;
        }
      } catch {}
    }

    // Initial hash
    poll();

    // Poll on interval
    timer.current = setInterval(poll, interval);

    // Also poll when tab becomes visible (user switches back to app)
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
