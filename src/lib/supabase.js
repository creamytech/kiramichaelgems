import { createClient } from "@supabase/supabase-js";

// ─── Supabase Config ────────────────────────────────────────────────────────
// Set these in your .env file:
//   VITE_SUPABASE_URL=https://your-project.supabase.co
//   VITE_SUPABASE_ANON_KEY=your-anon-key
const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  || "";
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabase = supabaseUrl && supabaseAnon
  ? createClient(supabaseUrl, supabaseAnon)
  : null;

export const isOnline = () => !!supabase;

// ─── DB helpers (fall back to localStorage when Supabase isn't configured) ──

const localStore = {
  get(k)    { try{const v=localStorage.getItem(k);return v?JSON.parse(v):null;}catch{return null;} },
  set(k,v)  { try{localStorage.setItem(k,JSON.stringify(v));}catch{} },
};

// Table → localStorage key mapping
const TABLE_KEY = {
  orders:    "km-builds",
  templates: "km-templates",
  items:     "km-custom",
  settings:  "km-settings",
  inventory: "km-inventory",
};

// ─── CRUD that works with or without Supabase ───────────────────────────────

export async function dbLoad(table) {
  const key = TABLE_KEY[table];
  if (!supabase) return localStore.get(key);

  try {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;

    // For settings, return the single row's data field
    if (table === "settings" && data.length > 0) return data[0].data;
    // For inventory, return the single row's data field
    if (table === "inventory" && data.length > 0) return data[0].data;
    // For lists, return the array
    return data.map(r => r.data);
  } catch (err) {
    console.warn(`Supabase load failed for ${table}, falling back to local:`, err.message);
    return localStore.get(key);
  }
}

export async function dbSave(table, value) {
  const key = TABLE_KEY[table];
  // Always save locally as cache
  localStore.set(key, value);

  if (!supabase) return;

  try {
    if (table === "settings" || table === "inventory") {
      // Single-row tables: upsert by id=1
      await supabase
        .from(table)
        .upsert({ id: 1, data: value, updated_at: new Date().toISOString() });
    } else if (table === "orders" || table === "templates" || table === "items") {
      // For array tables, we do a full replace (simple approach for small datasets)
      // Delete all then re-insert
      await supabase.from(table).delete().neq("id", 0); // delete all
      if (Array.isArray(value) && value.length > 0) {
        const rows = value.map((item, idx) => ({
          id: idx + 1,
          data: item,
          record_id: item.id || idx,
          created_at: item.date || item.createdAt || new Date().toISOString(),
        }));
        await supabase.from(table).insert(rows);
      }
    }
  } catch (err) {
    console.warn(`Supabase save failed for ${table}:`, err.message);
  }
}

// ─── Auth helpers ───────────────────────────────────────────────────────────

export async function signIn(email, password) {
  if (!supabase) return { error: { message: "Supabase not configured" } };
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email, password) {
  if (!supabase) return { error: { message: "Supabase not configured" } };
  return supabase.auth.signUp({ email, password });
}

export async function signOut() {
  if (!supabase) return;
  return supabase.auth.signOut();
}

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

export function onAuthChange(callback) {
  if (!supabase) return { data: { subscription: { unsubscribe: () => {} } } };
  return supabase.auth.onAuthStateChange(callback);
}
