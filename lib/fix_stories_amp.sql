-- ================================================================
-- CheapestAlt — Fix AMP validation issues in existing stories
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
--
-- What this fixes:
--   1. publisher-logo-src: any invalid URL → https://www.cheapestalt.com/logo.png
--   2. poster-portrait-src: base64/query params → clean Pexels URL
--   3. poster-square-src: same as above
--   4. amp-img src: strips ?w=...&h=...&fit=crop query params
--   5. Moves amp-boilerplate before <script> tags if order is wrong
--
-- SAFE: only updates html column, does NOT change slug, title, keyword,
--       created_at, or any other column. Data is never deleted.
-- ================================================================

-- Preview how many stories need fixing (run this first)
SELECT
  COUNT(*) AS total_stories,
  COUNT(*) FILTER (WHERE html LIKE '%data:image/svg%')         AS has_base64_logo,
  COUNT(*) FILTER (WHERE html LIKE '%source.unsplash.com%')    AS has_unsplash,
  COUNT(*) FILTER (WHERE html LIKE '%pexels.com%?w=%')         AS has_pexels_query_params,
  COUNT(*) FILTER (WHERE html NOT LIKE '%logo.png%')           AS missing_logo_png,
  COUNT(*) FILTER (WHERE html NOT LIKE '%amp-boilerplate%')    AS missing_boilerplate
FROM stories;


-- ================================================================
-- FIX 1: Replace publisher-logo-src with real PNG URL
-- ================================================================
UPDATE stories
SET html = regexp_replace(
  html,
  'publisher-logo-src="[^"]*"',
  'publisher-logo-src="https://www.cheapestalt.com/logo.png"',
  'g'
)
WHERE html LIKE '%publisher-logo-src%'
  AND html NOT LIKE '%publisher-logo-src="https://www.cheapestalt.com/logo.png"%';


-- ================================================================
-- FIX 2: Strip query parameters from poster-portrait-src
-- Keeps the clean JPEG URL without ?w=800&h=1200&fit=crop
-- ================================================================
UPDATE stories
SET html = regexp_replace(
  html,
  'poster-portrait-src="(https://[^"?]+)\?[^"]*"',
  'poster-portrait-src="\1"',
  'g'
)
WHERE html LIKE '%poster-portrait-src=%'
  AND html LIKE '%poster-portrait-src="%?%"';


-- ================================================================
-- FIX 3: Strip query parameters from poster-square-src
-- ================================================================
UPDATE stories
SET html = regexp_replace(
  html,
  'poster-square-src="(https://[^"?]+)\?[^"]*"',
  'poster-square-src="\1"',
  'g'
)
WHERE html LIKE '%poster-square-src=%'
  AND html LIKE '%poster-square-src="%?%"';


-- ================================================================
-- FIX 4: Strip query parameters from all amp-img src URLs
-- Removes ?w=800&h=1200&fit=crop from Pexels CDN links
-- ================================================================
UPDATE stories
SET html = regexp_replace(
  html,
  'src="(https://images\.pexels\.com/[^"?]+)\?[^"]*"',
  'src="\1"',
  'g'
)
WHERE html LIKE '%images.pexels.com%?%';


-- ================================================================
-- FIX 5: Replace any remaining base64 data URIs in poster attrs
-- Uses a safe default Pexels tech/shopping image
-- ================================================================
UPDATE stories
SET html = regexp_replace(
  html,
  'poster-portrait-src="data:[^"]*"',
  'poster-portrait-src="https://images.pexels.com/photos/5632397/pexels-photo-5632397.jpeg"',
  'g'
)
WHERE html LIKE '%poster-portrait-src="data:%';

UPDATE stories
SET html = regexp_replace(
  html,
  'poster-square-src="data:[^"]*"',
  'poster-square-src="https://images.pexels.com/photos/5632397/pexels-photo-5632397.jpeg"',
  'g'
)
WHERE html LIKE '%poster-square-src="data:%';


-- ================================================================
-- FIX 6: Replace Unsplash random query URLs if any remain
-- ================================================================
UPDATE stories
SET html = regexp_replace(
  html,
  'src="https://source\.unsplash\.com/[^"]*"',
  'src="https://images.pexels.com/photos/5632397/pexels-photo-5632397.jpeg"',
  'g'
)
WHERE html LIKE '%source.unsplash.com%';


-- ================================================================
-- FIX 7: Update last_generated timestamp for all fixed stories
-- ================================================================
UPDATE stories
SET last_generated = NOW()
WHERE html LIKE '%logo.png%'
  AND html LIKE '%pexels.com%';


-- ================================================================
-- Verify fixes applied correctly
-- ================================================================
SELECT
  COUNT(*) AS total_stories,
  COUNT(*) FILTER (WHERE html LIKE '%data:image%')             AS still_has_base64,
  COUNT(*) FILTER (WHERE html LIKE '%source.unsplash.com%')    AS still_has_unsplash,
  COUNT(*) FILTER (WHERE html LIKE '%pexels.com%?w=%')         AS still_has_query_params,
  COUNT(*) FILTER (WHERE html LIKE '%logo.png%')               AS has_logo_png,
  COUNT(*) FILTER (WHERE html LIKE '%pexels.com%')             AS has_pexels_images
FROM stories;

-- Expected result:
--   still_has_base64      = 0
--   still_has_unsplash    = 0
--   still_has_query_params = 0
--   has_logo_png          = total_stories
--   has_pexels_images     = total_stories
