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
      console.warn(`dbLoad(${table}) error:`, error.message, error.code);
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

// ─── Save (merge strategy for list tables) ──────────────────────────────────
export async function dbSave(table, value) {
  const key = KEY[table];
  local.set(key, value);

  if (!_supabase) return;

  try {
    if (SINGLE_ROW.has(table)) {
      const { error } = await _supabase
        .from(table)
        .upsert({ id: 1, data: value, updated_at: new Date().toISOString() });
      if (error) throw error;
    } else {
      // MERGE strategy: fetch existing from cloud, merge with local, write back
      const { data: existing } = await _supabase.from(table).select("record_id, id").catch(() => ({ data: [] }));
      const existingIds = new Set((existing || []).map(r => r.record_id));

      // Build the full list: local items are the source of truth for items we know about
      const localIds = new Set();
      const toUpsert = [];

      if (Array.isArray(value)) {
        value.forEach(item => {
          const rid = String(item.id || "");
          localIds.add(rid);
          toUpsert.push({
            record_id: rid,
            data: item,
            created_at: item.date || item.createdAt || new Date().toISOString(),
          });
        });
      }

      // Delete items that exist in cloud but were deleted locally
      const toDelete = [...existingIds].filter(rid => !localIds.has(rid));
      if (toDelete.length > 0) {
        await _supabase.from(table).delete().in("record_id", toDelete);
      }

      // Upsert all local items (insert or update by record_id)
      if (toUpsert.length > 0) {
        for (let i = 0; i < toUpsert.length; i += 50) {
          const chunk = toUpsert.slice(i, i + 50);
          const { error } = await _supabase.from(table).upsert(chunk, {
            onConflict: "record_id",
          });
          if (error) {
            // Fallback: delete all and reinsert if upsert fails (schema might not have unique constraint)
            console.warn(`Upsert failed for ${table}, using replace:`, error.message);
            await _supabase.from(table).delete().gte("id", 0);
            for (let j = 0; j < toUpsert.length; j += 50) {
              await _supabase.from(table).insert(toUpsert.slice(j, j + 50));
            }
            break;
          }
        }
      }
    }
  } catch (err) {
    console.warn(`dbSave(${table}) failed:`, err.message);
  }
}

// ─── Full sync: merge cloud + local ─────────────────────────────────────────
export async function dbMergeLoad(table) {
  const key = KEY[table];
  if (!_supabase) return local.get(key);
  if (SINGLE_ROW.has(table)) return dbLoad(table);

  try {
    const cloudData = await dbLoad(table);
    const localData = local.get(key);

    if (!cloudData?.length && !localData?.length) return null;
    if (!cloudData?.length) return localData;
    if (!localData?.length) return cloudData;

    // Merge: use record ID as key, prefer most recent
    const merged = new Map();
    // Cloud first
    (cloudData || []).forEach(item => {
      const id = String(item.id || "");
      if (id) merged.set(id, item);
    });
    // Local overwrites cloud for items we have locally
    (localData || []).forEach(item => {
      const id = String(item.id || "");
      if (id) merged.set(id, item);
    });

    const result = [...merged.values()];
    local.set(key, result);
    return result;
  } catch (err) {
    console.warn(`dbMergeLoad(${table}) failed:`, err.message);
    return local.get(key);
  }
}

// ─── Test connection ────────────────────────────────────────────────────────
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
