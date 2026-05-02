"use strict";
// api/trending.js
// GET /trending          → article index page
// GET /trending/[slug]   → individual article

const https = require("https");

function sbReq(path) {
  const base = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return Promise.resolve({ data: null, error: "no-config" });
  const host = base.replace(/^https?:\/\//, "");
  return new Promise(resolve => {
    const h = { "apikey": key, "Authorization": "Bearer " + key };
    const req = https.request(
      { hostname: host, path: "/rest/v1/" + path, method: "GET", headers: h },
      r => {
        let d = ""; r.on("data", c => d += c);
        r.on("end", () => {
          let p = null; try { p = JSON.parse(d); } catch {}
          resolve(r.statusCode >= 400 ? { data: null, error: d.slice(0,200) } : { data: p, error: null });
        });
      }
    );
    req.on("error", e => resolve({ data: null, error: e.message }));
    req.setTimeout(6000, () => { req.destroy(); resolve({ data: null, error: "timeout" }); });
    req.end();
  });
}

// Track CTA clicks
function trackClick(slug) {
  const base = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return;
  const host = base.replace(/^https?:\/\//, "");
  const body = Buffer.from(JSON.stringify({ click_count: 1 }));
  // Use RPC or raw PATCH with increment — simplified: just log
  console.log("Click tracked:", slug);
}

function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

const FAV = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%232563EB'/%3E%3Ctext x='16' y='22' font-family='Inter' font-size='13' font-weight='800' fill='white' text-anchor='middle'%3ECA%3C/text%3E%3C/svg%3E";
const GA  = "G-6MR7X29W2X";

// ── Index page ─────────────────────────────────────────────────────────────────
function buildIndex(articles) {
  const TYPE_COLORS = {
    alternative: { bg:"#EFF6FF", color:"#2563EB", label:"Alternative" },
    comparison:  { bg:"#F5F3FF", color:"#7C3AED", label:"Comparison" },
    deal:        { bg:"#FFFBEB", color:"#D97706", label:"Best Deal" },
  };

  const cards = articles.map(a => {
    const tc = TYPE_COLORS[a.variation_type] || TYPE_COLORS.alternative;
    const date = a.created_at ? new Date(a.created_at).toLocaleDateString("en-US", {month:"short",day:"numeric",year:"numeric"}) : "";
    return '<a href="/trending/' + esc(a.slug) + '" class="card">' +
      '<div class="card-badge" style="background:' + tc.bg + ';color:' + tc.color + '">' + tc.label + '</div>' +
      '<div class="card-title">' + esc(a.title) + '</div>' +
      '<div class="card-meta">' + esc(a.keyword) + ' &bull; ' + date + '</div>' +
      '<div class="card-cta">Read Article →</div>' +
      '</a>';
  }).join("");

  const css = '*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,system-ui,sans-serif;background:#0F172A;color:#fff;min-height:100vh}' +
    '.hdr{background:#1E293B;border-bottom:2px solid #2563EB;padding:0 24px;height:58px;display:flex;align-items:center;justify-content:space-between}' +
    '.logo{font-size:18px;font-weight:800;color:#fff;text-decoration:none}.logo em{color:#2563EB;font-style:normal}' +
    '.nav a{color:#94A3B8;text-decoration:none;font-size:13px;font-weight:600;margin-left:14px;padding:6px 12px;border-radius:7px;border:1px solid #334155}' +
    '.nav a:hover{background:#2563EB;color:#fff;border-color:#2563EB}' +
    '.main-content{flex:1}' +
    '.hero{text-align:center;padding:56px 24px 40px}' +
    '.hero-badge{display:inline-block;background:rgba(37,99,235,.2);border:1px solid #2563EB;color:#60A5FA;font-size:12px;font-weight:700;padding:5px 14px;border-radius:20px;margin-bottom:14px;letter-spacing:.5px}' +
    '.hero h1{font-size:34px;font-weight:900;margin-bottom:10px;background:linear-gradient(135deg,#60A5FA,#A78BFA);-webkit-background-clip:text;-webkit-text-fill-color:transparent}' +
    '.hero p{font-size:15px;color:#94A3B8;max-width:520px;margin:0 auto}' +
    '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;max-width:1100px;margin:0 auto;padding:0 24px 60px}' +
    '.card{background:#1E293B;border:1.5px solid #334155;border-radius:14px;padding:22px;text-decoration:none;display:flex;flex-direction:column;gap:10px;transition:transform .15s,border-color .15s}' +
    '.card:hover{transform:translateY(-4px);border-color:#2563EB}' +
    '.card-badge{display:inline-block;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;width:fit-content;text-transform:uppercase;letter-spacing:.4px}' +
    '.card-title{font-size:15px;font-weight:700;color:#F1F5F9;line-height:1.4}' +
    '.card-meta{font-size:12px;color:#64748B}' +
    '.card-cta{font-size:13px;font-weight:700;color:#60A5FA;margin-top:4px}' +
    '.empty{text-align:center;padding:60px 24px;color:#64748B}' +
    '.ftr{background:#1E293B;border-top:1px solid #334155;padding:24px;margin-top:0}' +
    '.ftr-in{max-width:1100px;margin:0 auto;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:13px;color:#64748B;align-items:center}' +
    '.ftr-in a{color:#64748B;text-decoration:none}.ftr-in a:hover{color:#fff}' +
    '.ftr-links{display:flex;gap:16px;flex-wrap:wrap}' +
    '@media(max-width:600px){.hdr{flex-direction:column;height:auto;padding:12px 16px;gap:8px;align-items:center}.nav{display:flex;justify-content:center;flex-wrap:wrap;gap:6px}.nav a{margin-left:0;font-size:12px;padding:5px 10px}.hero h1{font-size:24px}.grid{grid-template-columns:1fr}.ftr-in{flex-direction:column;align-items:center;text-align:center}.ftr-links{justify-content:center}}';

  return '<!DOCTYPE html><html lang="en"><head>' +
    '<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>' +
    '<title>Trending Product Deals — Best Alternatives &amp; Savings | CheapestAlt</title>' +
    '<meta name="description" content="Discover the best product alternatives, deals and savings updated automatically every day. Compare prices and save money today."/>' +
    '<link rel="canonical" href="https://www.cheapestalt.com/trending"/>' +
    '<link rel="icon" type="image/svg+xml" href="' + FAV + '"/>' +
    '<script async src="https://www.googletagmanager.com/gtag/js?id=' + GA + '"></script>' +
    '<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","' + GA + '");</script>' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>' +
    '<style>' + css + '</style>' +
    '</head><body>' +
    '<header class="hdr"><a href="/" class="logo">Cheapest<em>Alt</em></a>' +
    '<nav class="nav"><a href="/">Alternatives</a><a href="/#compare">Compare</a><a href="/stories">Stories</a><a href="/trending">Articles</a></nav>' +
    '</header>' +
    '<div class="main-content"><div class="hero">' +
    '<div class="hero-badge">🔥 New Deals Published Daily</div>' +
    '<h1>Today\'s Best Product Deals</h1>' +
    '<p>Our AI finds the best alternatives and savings across thousands of Amazon products — so you never overpay again.</p>' +
    '</div>' +
    (articles.length > 0
      ? '<div class="grid">' + cards + '</div>'
      : '<div class="empty"><h2>Articles coming soon</h2><p>Check back in a few hours — new articles are generated automatically.</p></div>'
    ) +
    '<footer class="ftr"><div class="ftr-in"><span>&copy; 2026 CheapestAlt</span>' +
    '<div class="ftr-links"><a href="/">Home</a><a href="/stories">Stories</a><a href="mailto:Support@cheapestalt.com">Contact</a></div>' +
    '</div></div></footer>' +
    '</body></html>';
}

// ── 404 page ──────────────────────────────────────────────────────────────────
function notFound() {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Not Found | CheapestAlt</title>' +
    '<style>body{font-family:system-ui;background:#0F172A;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}' +
    '.c{text-align:center}.c h1{font-size:22px;margin-bottom:10px}.c p{color:#94A3B8;margin-bottom:20px}' +
    'a{background:#2563EB;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600}</style></head>' +
    '<body><div class="c"><div style="font-size:48px;margin-bottom:16px">📭</div><h1>Article not found</h1>' +
    '<p>This article may still be generating.</p><a href="/trending">Browse all articles</a></div></body></html>';
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  const url = (req.url || "").split("?")[0];

  // Track CTA clicks — GET /trending/click?slug=xxx
  if (url === "/trending/click") {
    const slug = (req.query && req.query.slug) || "";
    if (slug) trackClick(slug);
    return res.status(200).json({ ok: true });
  }

  // Index page
  if (url === "/trending" || url === "/trending/") {
    const { data } = await sbReq(
      "trending_articles?select=slug,title,keyword,variation_type,created_at" +
      "&order=created_at.desc&limit=60"
    );
    const articles = Array.isArray(data) ? data : [];
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=1800, s-maxage=3600");
    return res.status(200).send(buildIndex(articles));
  }

  // Individual article
  const match = url.match(/^\/trending\/([^/]+)$/);
  if (match) {
    const slug = match[1];
    const { data, error } = await sbReq(
      "trending_articles?slug=eq." + encodeURIComponent(slug) + "&select=slug,title,content&limit=1"
    );
    if (error) { res.setHeader("Content-Type","text/html;charset=utf-8"); return res.status(500).send(notFound()); }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.content) { res.setHeader("Content-Type","text/html;charset=utf-8"); return res.status(404).send(notFound()); }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    return res.status(200).send(row.content);
  }

  return res.status(404).json({ error: "Not found" });
};
