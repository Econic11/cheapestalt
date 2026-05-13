"use strict";
// api/seed-pages.js
// One-time seed endpoint: inserts custom product pages into the Supabase pages table.
// Call once after deployment: GET /api/seed-pages?key=<ADMIN_SECRET>

const https = require("https");
const fs    = require("fs");
const path  = require("path");

const ADMIN_SECRET = process.env.ADMIN_SECRET      || "cheapestalt-admin-2026";
const SUPABASE_URL = process.env.SUPABASE_URL      || "";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "";

const PRODUCT_PAGES = [
  {
    slug:     "goveelife-nugget-ice-maker-pro",
    type:     "product",
    keyword:  "GoveeLife Smart Nugget Ice Maker Pro",
    title:    "GoveeLife Smart Nugget Ice Maker Pro Review 2025 — Best Price on Amazon",
    htmlFile: "goveelife-nugget-ice-maker-pro.html",
  },
];

function upsert(row) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return Promise.resolve({ error: "no-config" });
  const host = SUPABASE_URL.replace(/^https?:\/\//, "");
  const body = Buffer.from(JSON.stringify(row));
  return new Promise(resolve => {
    const req = https.request({
      hostname: host,
      path: "/rest/v1/pages?on_conflict=slug",
      method: "POST",
      headers: {
        "apikey":          SUPABASE_KEY,
        "Authorization":   "Bearer " + SUPABASE_KEY,
        "Content-Type":    "application/json",
        "Content-Length":  body.length,
        "Prefer":          "resolution=merge-duplicates",
      },
    }, r => {
      let d = ""; r.on("data", c => d += c);
      r.on("end", () => resolve(r.statusCode < 300 ? { error: null } : { error: d.slice(0, 300) }));
    });
    req.on("error", e => resolve({ error: e.message }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ error: "timeout" }); });
    req.write(body); req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  const key = (req.query && req.query.key) || "";
  if (key !== ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized — pass ?key=<ADMIN_SECRET>" });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "SUPABASE_URL / SUPABASE_ANON_KEY not set" });
  }

  const results = [];
  const now = new Date().toISOString();

  for (const page of PRODUCT_PAGES) {
    let html;
    try {
      const filePath = path.join(__dirname, "..", page.htmlFile);
      html = fs.readFileSync(filePath, "utf8");
    } catch (e) {
      results.push({ slug: page.slug, success: false, error: "Could not read file: " + e.message });
      continue;
    }

    const row = {
      slug:           page.slug,
      type:           page.type,
      keyword:        page.keyword,
      title:          page.title,
      content:        {},
      html,
      created_at:     now,
      last_generated: now,
    };

    const { error } = await upsert(row);
    if (error) {
      results.push({ slug: page.slug, success: false, error });
    } else {
      results.push({ slug: page.slug, success: true });
    }
  }

  const allOk = results.every(r => r.success);
  return res.status(allOk ? 200 : 207).json({ results });
};
