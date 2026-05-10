"use strict";
// api/stories.js
// GET /stories/[slug]  â†’ serves AMP Web Story HTML
// GET /stories         â†’ serves story index page

const https = require("https");
const GA_ID = "G-6MR7X29W2X";
const TAG   = "cheapestalt-20";

// â”€â”€ Supabase â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function sbReq(method, path) {
  const base = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return Promise.resolve({ data: null, error: "no-config" });
  const host = base.replace(/^https?:\/\//, "");
  return new Promise(resolve => {
    const h = { "apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json" };
    const req = https.request({ hostname: host, path: "/rest/v1/" + path, method: "GET", headers: h }, r => {
      let d = ""; r.on("data", c => d += c);
      r.on("end", () => {
        let p = null; try { p = JSON.parse(d); } catch {}
        resolve(r.statusCode >= 400 ? { data: null, error: p || d.slice(0, 200) } : { data: p, error: null });
      });
    });
    req.on("error", e => resolve({ data: null, error: e.message }));
    req.setTimeout(6000, () => { req.destroy(); resolve({ data: null, error: "timeout" }); });
    req.end();
  });
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const FAV = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%232563EB'/%3E%3Ctext x='16' y='22' font-family='Inter' font-size='13' font-weight='800' fill='white' text-anchor='middle'%3ECA%3C/text%3E%3C/svg%3E";

// â”€â”€ Story index page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildIndexPage(stories) {
  // Assign gradient per card based on index for visual variety
  const GRADIENTS = [
    "linear-gradient(135deg,#1a1a2e,#16213e)",
    "linear-gradient(135deg,#0f3460,#533483)",
    "linear-gradient(135deg,#e94560,#0f3460)",
    "linear-gradient(135deg,#533483,#e94560)",
    "linear-gradient(135deg,#1a1a2e,#533483)",
    "linear-gradient(135deg,#16213e,#e94560)",
    "linear-gradient(135deg,#0d1117,#2563EB)",
    "linear-gradient(135deg,#2563EB,#7C3AED)",
    "linear-gradient(135deg,#7C3AED,#DB2777)",
    "linear-gradient(135deg,#059669,#0f3460)",
  ];
  const EMOJIS = ["ðŸŽ§","ðŸ ","ðŸ’»","ðŸ’ª","ðŸŒ¿","ðŸ“¸","ðŸŽ®","ðŸ¾","âš¡","ðŸŽ"];

  const cards = stories.map((s, i) => {
    const grad = GRADIENTS[i % GRADIENTS.length];
    const emoji = EMOJIS[i % EMOJIS.length];
    return `<a href="/stories/${esc(s.slug)}" class="card" style="background:${grad};">
      <div class="card-emoji">${emoji}</div>
      <div class="card-title">${esc(s.title)}</div>
      <div class="card-kw">${esc(s.keyword || "")}</div>
      <div class="card-cta">Watch Story â†’</div>
    </a>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Today's Trending Product Stories â€” Best Deals Found Daily | CheapestAlt</title>
  <meta name="description" content="Our AI scans thousands of Amazon products every day to find the best deals. Discover what is trending right now and save money instantly."/>
  <link rel="canonical" href="https://www.cheapestalt.com/stories"/>
  <link rel="icon" type="image/svg+xml" href="${FAV}"/>
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');</script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Inter,sans-serif;background:#0F172A;color:#fff;min-height:100vh}
    .hdr{background:#1E293B;border-bottom:2px solid #2563EB;padding:0 24px;height:60px;display:flex;align-items:center;justify-content:space-between}
    .logo{font-size:18px;font-weight:800;color:#fff;text-decoration:none}
    .logo em{color:#2563EB;font-style:normal}
    .nav a{color:#ffffff;text-decoration:none;font-size:13.5px;font-weight:600;margin-left:6px;background:rgba(255,255,255,0.1);padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.15)}
    .nav a:hover{background:#2563EB;border-color:#2563EB}
    .hero{text-align:center;padding:60px 24px 40px}
    .hero h1{font-size:36px;font-weight:800;margin-bottom:12px;background:linear-gradient(135deg,#60A5FA,#A78BFA);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .hero p{font-size:16px;color:#94A3B8;max-width:500px;margin:0 auto}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:14px;max-width:1100px;margin:0 auto;padding:0 24px 60px}
    .card{border:none;border-radius:20px;padding:24px 16px 20px;text-decoration:none;display:flex;flex-direction:column;align-items:center;gap:10px;transition:transform .2s,box-shadow .2s;box-shadow:0 4px 20px rgba(0,0,0,0.3);position:relative;overflow:hidden}
    .card::before{content:"";position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,0.05);opacity:0;transition:opacity .2s}
    .card:hover{transform:translateY(-6px);box-shadow:0 12px 40px rgba(0,0,0,0.5)}
    .card:hover::before{opacity:1}
    .card-emoji{font-size:44px;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.3))}
    .card-title{font-size:13px;font-weight:700;color:#ffffff;text-align:center;line-height:1.4;text-shadow:0 1px 4px rgba(0,0,0,0.5)}
    .card-kw{font-size:11px;color:rgba(255,255,255,0.6);text-align:center;font-weight:500}
    .card-cta{font-size:12px;font-weight:700;color:#FFD700;margin-top:4px;letter-spacing:0.3px}
    .empty{text-align:center;padding:60px 24px;color:#64748B}
    .empty h2{font-size:20px;margin-bottom:8px;color:#94A3B8}
    .hero-badge{display:inline-block;background:rgba(37,99,235,0.2);border:1px solid #2563EB;color:#60A5FA;font-size:13px;font-weight:700;padding:6px 16px;border-radius:20px;margin-bottom:16px;letter-spacing:0.3px}
    .hero-stats{display:flex;gap:20px;justify-content:center;flex-wrap:wrap;margin-top:20px}
    .hero-stats span{font-size:13px;color:#60A5FA;font-weight:600}
    .ftr{background:#1E293B;border-top:1px solid #334155;padding:28px 24px;margin-top:20px}
    .ftr-in{max-width:900px;margin:0 auto;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:13px;color:#94A3B8;align-items:center}
    .ftr-in a{color:#94A3B8;text-decoration:none;font-weight:500}.ftr-in a:hover{color:#fff}
    .ftr-links{display:flex;gap:16px;flex-wrap:wrap}
    @media(max-width:600px){.hdr{flex-direction:column;height:auto;padding:10px 16px;gap:8px;align-items:center}.nav{justify-content:center;flex-wrap:wrap;gap:6px}.nav a{font-size:11px;padding:5px 10px;margin-left:0}.hero h1{font-size:26px}.grid{grid-template-columns:repeat(2,1fr)}.hero-stats{gap:12px}}
  </style>
</head>
<body>
<header class="hdr">
  <a href="/" class="logo">Cheapest<em>Alt</em></a>
  <nav class="nav">
    <a href="/">Alternatives</a>
    <a href="https://cheapestalt.com/compare">Compare</a>
    <a href="/stories">Stories</a>
  </nav>
</header>
<div class="hero">
  <div class="hero-badge">ðŸ”¥ Updated Daily by AI</div>
  <h1>Today's Best Product Deals</h1>
  <p>Our AI scans thousands of Amazon listings every day and handpicks the most trending products â€” so you never miss a deal. Fresh stories published every morning.</p>
  <div class="hero-stats">
    <span>âœ… AI-curated deals</span>
    <span>âœ… Updated every 24h</span>
    <span>âœ… Verified Amazon prices</span>
  </div>
</div>
${stories.length > 0
  ? `<div class="grid">${cards}</div>`
  : `<div class="empty"><h2>Stories coming soon</h2><p>Check back in a few hours â€” our daily pipeline generates fresh stories automatically.</p></div>`
}
<footer class="ftr"><div class="ftr-in">
  <span>&copy; 2026 CheapestAlt. All rights reserved.</span>
  <div class="ftr-links">
    <a href="/">Home</a>
    <a href="/#about">About</a>
    <a href="/stories">Stories</a>
    <a href="/#disclosure">Affiliate Disclosure</a>
    <a href="mailto:Support@cheapestalt.com">Contact</a>
  </div>
</div></footer>
</body>
</html>`;
}

// â”€â”€ 404 page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function notFoundPage(slug) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Story Not Found | CheapestAlt</title>
  <link rel="icon" type="image/svg+xml" href="${FAV}"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet"/>
  <style>
    body{font-family:Inter,sans-serif;background:#0F172A;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
    .c{text-align:center;padding:40px 24px}
    h1{font-size:24px;font-weight:700;margin-bottom:10px}
    p{color:#94A3B8;margin-bottom:20px}
    a{background:#2563EB;color:#fff;padding:11px 24px;border-radius:8px;text-decoration:none;font-weight:600}
  </style>
</head>
<body>
<div class="c">
  <div style="font-size:48px;margin-bottom:16px">ðŸ“­</div>
  <h1>Story not found</h1>
  <p>This story may still be generating, or the URL may be incorrect.</p>
  <a href="/stories">Browse all stories</a>
</div>
</body>
</html>`;
}

// â”€â”€ MAIN HANDLER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  const url = (req.url || "").split("?")[0];

  // /stories â€” index page
  if (url === "/stories" || url === "/stories/") {
    const { data: rows } = await sbReq("GET",
      "stories?select=slug,title,keyword&order=created_at.desc&limit=50");
    const stories = Array.isArray(rows) ? rows : [];
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(buildIndexPage(stories));
  }

  // /stories/[slug] â€” individual AMP story
  const slugMatch = url.match(/^\/stories\/([^/]+)$/);
  if (slugMatch) {
    const slug = slugMatch[1].toLowerCase().trim();
    const { data: rows, error } = await sbReq("GET",
      "stories?slug=eq." + encodeURIComponent(slug) + "&select=slug,title,keyword,html&limit=1");

    if (error) {
      console.error("Stories DB error:", error);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(500).send(notFoundPage(slug));
    }

    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row || !row.html) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(404).send(notFoundPage(slug));
    }

    // Serve the AMP story HTML directly
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    return res.status(200).send(row.html);
  }

  // Unknown path
  return res.status(404).json({ error: "Not found" });
};
