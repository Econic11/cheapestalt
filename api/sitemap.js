"use strict";
// api/sitemap.js
// Unified sitemap handler
// GET /sitemap-stories.xml   → AMP Web Stories sitemap
// GET /sitemap-trending.xml  → Trending articles sitemap

const https = require("https");

function sbGet(host, key, path) {
  return new Promise(resolve => {
    const h = { "apikey": key, "Authorization": "Bearer " + key };
    const req = https.request(
      { hostname: host, path: "/rest/v1/" + path, method: "GET", headers: h },
      r => {
        let d = ""; r.on("data", c => d += c);
        r.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve([]); } });
      }
    );
    req.on("error", () => resolve([]));
    req.setTimeout(8000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

module.exports = async function handler(req, res) {
  const base = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_ANON_KEY;
  const host = base ? base.replace(/^https?:\/\//, "") : "";
  const url  = (req.url || "").split("?")[0];

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");

  // Stories sitemap
  if (url === "/sitemap-stories.xml") {
    const rows = (host && key)
      ? await sbGet(host, key, "stories?select=slug&order=created_at.desc&limit=5000")
      : [];
    const urls = (Array.isArray(rows) ? rows : [])
      .filter(r => r && r.slug)
      .map(r => "  <url>\n    <loc>https://www.cheapestalt.com/stories/" + r.slug + "</loc>\n  </url>")
      .join("\n");
    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls + "\n</urlset>"
    );
  }

  // Trending articles sitemap
  if (url === "/sitemap-trending.xml") {
    const rows = (host && key)
      ? await sbGet(host, key, "trending_articles?select=slug,last_generated&order=last_generated.desc&limit=5000")
      : [];
    const urls = (Array.isArray(rows) ? rows : [])
      .filter(r => r && r.slug)
      .map(r =>
        "  <url>\n" +
        "    <loc>https://www.cheapestalt.com/trending/" + r.slug + "</loc>\n" +
        (r.last_generated ? "    <lastmod>" + r.last_generated.split("T")[0] + "</lastmod>\n" : "") +
        "    <changefreq>weekly</changefreq>\n" +
        "    <priority>0.7</priority>\n" +
        "  </url>"
      ).join("\n");
    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls + "\n</urlset>"
    );
  }

  return res.status(404).send('<error>Not found</error>');
};
