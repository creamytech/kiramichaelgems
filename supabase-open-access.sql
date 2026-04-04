-- ═══════════════════════════════════════════════════════════════════════════
-- Kiramichael Gems — Open Access Policies (no auth required)
-- Run this AFTER the main schema to allow access without login.
-- When you add authentication later, drop these and use the auth policies.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing restrictive policies (they require auth.uid)
DO $$ BEGIN
  -- Orders
  DROP POLICY IF EXISTS "Users see own orders" ON orders;
  DROP POLICY IF EXISTS "Users insert own orders" ON orders;
  DROP POLICY IF EXISTS "Users update own orders" ON orders;
  DROP POLICY IF EXISTS "Users delete own orders" ON orders;
  -- Templates
  DROP POLICY IF EXISTS "Users see own templates" ON templates;
  DROP POLICY IF EXISTS "Users insert own templates" ON templates;
  DROP POLICY IF EXISTS "Users update own templates" ON templates;
  DROP POLICY IF EXISTS "Users delete own templates" ON templates;
  -- Items
  DROP POLICY IF EXISTS "Users see own items" ON items;
  DROP POLICY IF EXISTS "Users insert own items" ON items;
  DROP POLICY IF EXISTS "Users update own items" ON items;
  DROP POLICY IF EXISTS "Users delete own items" ON items;
  -- Settings
  DROP POLICY IF EXISTS "Users see own settings" ON settings;
  DROP POLICY IF EXISTS "Users insert own settings" ON settings;
  DROP POLICY IF EXISTS "Users update own settings" ON settings;
  -- Inventory
  DROP POLICY IF EXISTS "Users see own inventory" ON inventory;
  DROP POLICY IF EXISTS "Users insert own inventory" ON inventory;
  DROP POLICY IF EXISTS "Users update own inventory" ON inventory;
END $$;

-- Make user_id nullable (no auth = no user)
ALTER TABLE orders    ALTER COLUMN user_id DROP NOT NULL, ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE templates ALTER COLUMN user_id DROP NOT NULL, ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE items     ALTER COLUMN user_id DROP NOT NULL, ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE settings  ALTER COLUMN user_id DROP NOT NULL, ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE inventory ALTER COLUMN user_id DROP NOT NULL, ALTER COLUMN user_id DROP DEFAULT;

-- Allow all operations via anon key (RLS still on, but policies permit all)
CREATE POLICY "Public read"   ON orders    FOR SELECT USING (true);
CREATE POLICY "Public insert" ON orders    FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update" ON orders    FOR UPDATE USING (true);
CREATE POLICY "Public delete" ON orders    FOR DELETE USING (true);

CREATE POLICY "Public read"   ON templates FOR SELECT USING (true);
CREATE POLICY "Public insert" ON templates FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update" ON templates FOR UPDATE USING (true);
CREATE POLICY "Public delete" ON templates FOR DELETE USING (true);

CREATE POLICY "Public read"   ON items     FOR SELECT USING (true);
CREATE POLICY "Public insert" ON items     FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update" ON items     FOR UPDATE USING (true);
CREATE POLICY "Public delete" ON items     FOR DELETE USING (true);

CREATE POLICY "Public read"   ON settings  FOR SELECT USING (true);
CREATE POLICY "Public insert" ON settings  FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update" ON settings  FOR UPDATE USING (true);

CREATE POLICY "Public read"   ON inventory FOR SELECT USING (true);
CREATE POLICY "Public insert" ON inventory FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update" ON inventory FOR UPDATE USING (true);
