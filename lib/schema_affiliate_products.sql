-- ─────────────────────────────────────────────────────────────────────────────
-- affiliate_products table — Amazon affiliate product articles
-- Run every statement in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create the table
CREATE TABLE IF NOT EXISTS affiliate_products (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  amazon_title     TEXT        NOT NULL,
  affiliate_link   TEXT        NOT NULL,
  slug             TEXT        NOT NULL UNIQUE,
  seo_title        TEXT,
  seo_subtitle     TEXT,
  meta_description TEXT,
  article_body     TEXT,
  article_url      TEXT,
  status           TEXT        NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft', 'published'))
);

-- 2. Index on slug (fast article page lookups)
CREATE INDEX IF NOT EXISTS idx_affiliate_products_slug
  ON affiliate_products (slug);

-- 3. Index for listing published products (index page + related articles)
CREATE INDEX IF NOT EXISTS idx_affiliate_products_status_created
  ON affiliate_products (status, created_at DESC);

-- ─── Row Level Security ───────────────────────────────────────────────────────

-- 4. Enable RLS
ALTER TABLE affiliate_products ENABLE ROW LEVEL SECURITY;

-- 5. Anyone can read published articles (powers the public product pages)
CREATE POLICY "Public can read published products"
  ON affiliate_products
  FOR SELECT
  USING (status = 'published');

-- 6. Anon key can insert new rows (admin add-product form — add auth later)
CREATE POLICY "Admin can insert products"
  ON affiliate_products
  FOR INSERT
  WITH CHECK (true);

-- 7. Anon key can update rows (lets you change status from draft → published)
CREATE POLICY "Admin can update products"
  ON affiliate_products
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
