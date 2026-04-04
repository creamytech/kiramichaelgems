-- ═══════════════════════════════════════════════════════════════════════════
-- Kiramichael Gems — Supabase Schema
-- Run this in your Supabase SQL Editor after creating the project
-- ═══════════════════════════════════════════════════════════════════════════

-- Orders table (saved builds/invoices)
CREATE TABLE IF NOT EXISTS orders (
  id          BIGINT PRIMARY KEY,
  record_id   BIGINT,
  data        JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  user_id     UUID REFERENCES auth.users(id) DEFAULT auth.uid()
);

-- Templates table (saved build templates)
CREATE TABLE IF NOT EXISTS templates (
  id          BIGINT PRIMARY KEY,
  record_id   BIGINT,
  data        JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  user_id     UUID REFERENCES auth.users(id) DEFAULT auth.uid()
);

-- Custom items table (user-added catalog items)
CREATE TABLE IF NOT EXISTS items (
  id          BIGINT PRIMARY KEY,
  record_id   BIGINT,
  data        JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  user_id     UUID REFERENCES auth.users(id) DEFAULT auth.uid()
);

-- Settings table (single row per user)
CREATE TABLE IF NOT EXISTS settings (
  id          BIGINT PRIMARY KEY DEFAULT 1,
  data        JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now(),
  user_id     UUID REFERENCES auth.users(id) DEFAULT auth.uid()
);

-- Inventory table (single row per user, stock levels as JSON)
CREATE TABLE IF NOT EXISTS inventory (
  id          BIGINT PRIMARY KEY DEFAULT 1,
  data        JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now(),
  user_id     UUID REFERENCES auth.users(id) DEFAULT auth.uid()
);

-- ─── Row Level Security ─────────────────────────────────────────────────────
-- Each user can only see and modify their own data

ALTER TABLE orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

-- Orders policies
CREATE POLICY "Users see own orders"    ON orders    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own orders" ON orders    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own orders" ON orders    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own orders" ON orders    FOR DELETE USING (auth.uid() = user_id);

-- Templates policies
CREATE POLICY "Users see own templates"    ON templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own templates" ON templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own templates" ON templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own templates" ON templates FOR DELETE USING (auth.uid() = user_id);

-- Items policies
CREATE POLICY "Users see own items"    ON items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own items" ON items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own items" ON items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own items" ON items FOR DELETE USING (auth.uid() = user_id);

-- Settings policies
CREATE POLICY "Users see own settings"    ON settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own settings" ON settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own settings" ON settings FOR UPDATE USING (auth.uid() = user_id);

-- Inventory policies
CREATE POLICY "Users see own inventory"    ON inventory FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own inventory" ON inventory FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own inventory" ON inventory FOR UPDATE USING (auth.uid() = user_id);
