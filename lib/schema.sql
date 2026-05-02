-- ================================================================
-- CheapestAlt — Supabase Schema
-- Run ONCE in: Supabase Dashboard → SQL Editor → New query → Run
-- ================================================================

-- 1. Create the pages table (if not exists)
CREATE TABLE IF NOT EXISTS pages (
  id             BIGSERIAL PRIMARY KEY,
  slug           TEXT UNIQUE NOT NULL,
  type           TEXT NOT NULL DEFAULT 'alternative',
  keyword        TEXT,
  product_a      TEXT,
  product_b      TEXT,
  title          TEXT,
  content        JSONB,
  html           TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  last_generated TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS pages_slug_idx ON pages (slug);
CREATE INDEX IF NOT EXISTS pages_type_idx ON pages (type);

-- 3. Add missing columns (safe to run if table already exists)
ALTER TABLE pages ADD COLUMN IF NOT EXISTS html           TEXT;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS last_generated TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE pages ADD COLUMN IF NOT EXISTS type           TEXT DEFAULT 'alternative';
ALTER TABLE pages ADD COLUMN IF NOT EXISTS keyword        TEXT;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS product_a      TEXT;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS product_b      TEXT;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS title          TEXT;

-- 4. Row Level Security
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (safe)
DROP POLICY IF EXISTS "Public read pages"   ON pages;
DROP POLICY IF EXISTS "Public insert pages" ON pages;
DROP POLICY IF EXISTS "Public update pages" ON pages;

-- Allow anonymous read, insert, update
CREATE POLICY "Public read pages"   ON pages FOR SELECT USING (true);
CREATE POLICY "Public insert pages" ON pages FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update pages" ON pages FOR UPDATE USING (true);

-- 5. Verify (check output shows table exists)
SELECT COUNT(*) as total_pages FROM pages;
