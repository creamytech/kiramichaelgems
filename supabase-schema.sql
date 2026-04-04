-- ═══════════════════════════════════════════════════════════════════════════
-- Kiramichael Gems — Full Schema (drop & recreate)
-- Run this in Supabase SQL Editor. It's safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing tables if they exist (clean slate)
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS templates CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS shows CASCADE;
DROP TABLE IF EXISTS sellers CASCADE;

-- ─── Sellers / Profiles ──────────────────────────────────────────────────────
CREATE TABLE sellers (
  id          BIGSERIAL PRIMARY KEY,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── Shows / Events ─────────────────────────────────────────────────────────
CREATE TABLE shows (
  id          BIGSERIAL PRIMARY KEY,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── Orders ─────────────────────────────────────────────────────────────────
CREATE TABLE orders (
  id          BIGSERIAL PRIMARY KEY,
  data        JSONB NOT NULL,
  record_id   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── Templates ──────────────────────────────────────────────────────────────
CREATE TABLE templates (
  id          BIGSERIAL PRIMARY KEY,
  data        JSONB NOT NULL,
  record_id   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── Custom Items ───────────────────────────────────────────────────────────
CREATE TABLE items (
  id          BIGSERIAL PRIMARY KEY,
  data        JSONB NOT NULL,
  record_id   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── Settings (single row) ──────────────────────────────────────────────────
CREATE TABLE settings (
  id          INT PRIMARY KEY DEFAULT 1,
  data        JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── Inventory (single row) ─────────────────────────────────────────────────
CREATE TABLE inventory (
  id          INT PRIMARY KEY DEFAULT 1,
  data        JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── Enable RLS with public access ──────────────────────────────────────────
-- (No auth required — all access via anon key)

ALTER TABLE sellers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE shows     ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

-- Public access policies for all tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['sellers','shows','orders','templates','items','settings','inventory'])
  LOOP
    EXECUTE format('CREATE POLICY "anon_select" ON %I FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY "anon_insert" ON %I FOR INSERT WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "anon_update" ON %I FOR UPDATE USING (true)', t);
    EXECUTE format('CREATE POLICY "anon_delete" ON %I FOR DELETE USING (true)', t);
  END LOOP;
END $$;

-- Seed settings and inventory with empty row so upsert works
INSERT INTO settings (id, data) VALUES (1, '{}') ON CONFLICT (id) DO NOTHING;
INSERT INTO inventory (id, data) VALUES (1, '{}') ON CONFLICT (id) DO NOTHING;
