-- ================================================================
-- CheapestAlt — Trending Articles Table
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ================================================================

CREATE TABLE IF NOT EXISTS trending_articles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  slug             TEXT UNIQUE NOT NULL,
  keyword          TEXT NOT NULL,
  product_name     TEXT,
  content          TEXT,          -- full HTML article
  meta_description TEXT,
  variation_type   TEXT DEFAULT 'alternative',  -- alternative|comparison|deal|budget
  source           TEXT DEFAULT 'google_trends',
  affiliate_link   TEXT,
  cover_image      TEXT,
  background_style JSONB DEFAULT '{}',
  click_count      INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  last_generated   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trending_slug_idx    ON trending_articles (slug);
CREATE INDEX IF NOT EXISTS trending_kw_idx      ON trending_articles (keyword);
CREATE INDEX IF NOT EXISTS trending_created_idx ON trending_articles (created_at DESC);

ALTER TABLE trending_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read trending"   ON trending_articles;
DROP POLICY IF EXISTS "Public insert trending" ON trending_articles;
DROP POLICY IF EXISTS "Public update trending" ON trending_articles;

CREATE POLICY "Public read trending"   ON trending_articles FOR SELECT USING (true);
CREATE POLICY "Public insert trending" ON trending_articles FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update trending" ON trending_articles FOR UPDATE USING (true);

SELECT COUNT(*) AS total_articles FROM trending_articles;
