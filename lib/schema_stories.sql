-- ================================================================
-- CheapestAlt — Web Stories Table
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ================================================================

CREATE TABLE IF NOT EXISTS stories (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           TEXT UNIQUE NOT NULL,
  title          TEXT NOT NULL,
  keyword        TEXT,
  source         TEXT DEFAULT 'trending',
  html           TEXT,
  amp_valid      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  last_generated TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stories_slug_idx      ON stories (slug);
CREATE INDEX IF NOT EXISTS stories_created_idx   ON stories (created_at DESC);
CREATE INDEX IF NOT EXISTS stories_keyword_idx   ON stories (keyword);

ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read stories"   ON stories;
DROP POLICY IF EXISTS "Public insert stories" ON stories;
DROP POLICY IF EXISTS "Public update stories" ON stories;

CREATE POLICY "Public read stories"   ON stories FOR SELECT USING (true);
CREATE POLICY "Public insert stories" ON stories FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update stories" ON stories FOR UPDATE USING (true);

-- Verify
SELECT COUNT(*) as total_stories FROM stories;
