-- ================================================================
-- CheapestAlt — Comparisons Table
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ================================================================

-- Separate table for comparison pages (avoids column conflicts with pages table)
CREATE TABLE IF NOT EXISTS comparisons (
  id             BIGSERIAL PRIMARY KEY,
  slug           TEXT UNIQUE NOT NULL,    -- e.g. "airpods-pro-vs-sony-wf1000xm5"
  type           TEXT DEFAULT 'comparison',
  product_a      TEXT NOT NULL,
  product_b      TEXT NOT NULL,
  title          TEXT,
  content        JSONB,
  html           TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  last_generated TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comparisons_slug_idx ON comparisons (slug);

ALTER TABLE comparisons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read comparisons"   ON comparisons;
DROP POLICY IF EXISTS "Public insert comparisons" ON comparisons;
DROP POLICY IF EXISTS "Public update comparisons" ON comparisons;

CREATE POLICY "Public read comparisons"   ON comparisons FOR SELECT USING (true);
CREATE POLICY "Public insert comparisons" ON comparisons FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update comparisons" ON comparisons FOR UPDATE USING (true);

-- Verify
SELECT COUNT(*) as total_comparisons FROM comparisons;
