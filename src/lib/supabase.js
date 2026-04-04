import { createClient } from "@supabase/supabase-js";

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  || "";
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

let _supabase = null;
let _initError = null;
try {
  if (supabaseUrl && supabaseAnon) {
    _supabase = createClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
} catch (err) {
  _initError = err.message;
  console.warn("Supabase init failed:", err.message);
}
export const supabase = _supabase;
export const isOnline = () => !!_supabase;
export const getDebugInfo = () => ({
  url: supabaseUrl ? supabaseUrl.slice(0, 30) + "..." : "not set",
  keyPrefix: supabaseAnon ? supabaseAnon.slice(0, 20) + "..." : "not set",
  client: !!_supabase,
  initError: _initError,
});

// ─── Local storage fallback ─────────────────────────────────────────────────
const local = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const KEY = {
  orders: "km-builds", templates: "km-templates", items: "km-custom",
  settings: "km-settings", inventory: "km-inventory", shows: "km-shows",
  sellers: "km-sellers",
};

const SINGLE_ROW = new Set(["settings", "inventory"]);

// ─── Load ───────────────────────────────────────────────────────────────────
export async function dbLoad(table) {
  const key = KEY[table];
  if (!_supabase) return local.get(key);

  try {
    let q = _supabase.from(table).select("*");
    if (!SINGLE_ROW.has(table)) q = q.order("id", { ascending: false });
    const { data, error } = await q;
    if (error) {
      console.warn(`dbLoad(${table}) error:`, error.message, error.code, error.hint);
      throw error;
    }
    if (!data || data.length === 0) return local.get(key);

    if (SINGLE_ROW.has(table)) {
      const result = data[0].data;
      local.set(key, result);
      return result;
    }
    const result = data.map(r => r.data);
    local.set(key, result);
    return result;
  } catch (err) {
    console.warn(`dbLoad(${table}) failed:`, err.message);
    return local.get(key);
  }
}

// Test connection
export async function testConnection() {
  if (!_supabase) return { ok: false, error: "Client not initialized", debug: getDebugInfo() };
  try {
    const { data, error } = await _supabase.from("settings").select("id").limit(1);
    if (error) return { ok: false, error: error.message, code: error.code, hint: error.hint, debug: getDebugInfo() };
    return { ok: true, rows: data?.length ?? 0, debug: getDebugInfo() };
  } catch (err) {
    return { ok: false, error: err.message, debug: getDebugInfo() };
  }
}

// ─── Save ───────────────────────────────────────────────────────────────────
export async function dbSave(table, value) {
  const key = KEY[table];
  local.set(key, value); // always cache locally first

  if (!_supabase) return;

  try {
    if (SINGLE_ROW.has(table)) {
      const { error } = await _supabase
        .from(table)
        .upsert({ id: 1, data: value, updated_at: new Date().toISOString() });
      if (error) throw error;
    } else {
      // Delete all then re-insert (simple & reliable for small datasets)
      await _supabase.from(table).delete().gte("id", 0);
      if (Array.isArray(value) && value.length > 0) {
        // Batch insert in chunks of 50 to avoid payload limits
        for (let i = 0; i < value.length; i += 50) {
          const chunk = value.slice(i, i + 50).map((item, idx) => ({
            data: item,
            record_id: String(item.id || (i + idx)),
            created_at: item.date || item.createdAt || new Date().toISOString(),
          }));
          const { error } = await _supabase.from(table).insert(chunk);
          if (error) throw error;
        }
      }
    }
  } catch (err) {
    console.warn(`dbSave(${table}) failed:`, err.message);
  }
}
