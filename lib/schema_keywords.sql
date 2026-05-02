-- ================================================================
-- CheapestAlt — Custom Keywords Table
-- Add your own keywords here and they will be used automatically
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ================================================================

CREATE TABLE IF NOT EXISTS custom_keywords (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword    TEXT UNIQUE NOT NULL,
  active     BOOLEAN DEFAULT true,
  priority   INTEGER DEFAULT 1,  -- higher = used first
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE custom_keywords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read keywords"   ON custom_keywords;
DROP POLICY IF EXISTS "Public insert keywords" ON custom_keywords;
DROP POLICY IF EXISTS "Public update keywords" ON custom_keywords;

CREATE POLICY "Public read keywords"   ON custom_keywords FOR SELECT USING (true);
CREATE POLICY "Public insert keywords" ON custom_keywords FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update keywords" ON custom_keywords FOR UPDATE USING (true);

-- Add some example keywords to get started (edit or delete these)
INSERT INTO custom_keywords (keyword, priority) VALUES
  ('wireless earbuds 2026', 10),
  ('robot vacuum deals',    9),
  ('air fryer amazon',      8)
ON CONFLICT (keyword) DO NOTHING;

SELECT * FROM custom_keywords ORDER BY priority DESC;
