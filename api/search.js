// api/search.js
// Model: claude-haiku-4-5-20251001
// Storage: Supabase permanent + in-memory cache

"use strict";
const amz = require("../lib/amazon");
const https = require("https");
const MODEL = "claude-haiku-4-5-20251001";
const TAG   = "cheapestalt-20";

// -- Supabase client ------------------------------------------------------------
function sbReq(method, path, body) {
  const base = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return Promise.resolve({ data: null, error: "no-config" });
  const host    = base.replace(/^https?:\/\//, "");
  const payload = body ? JSON.stringify(body) : null;
  return new Promise(res => {
    const hdrs = { "apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json" };
    if (method === "POST")   hdrs["Prefer"] = "resolution=merge-duplicates";
    if (method === "PATCH")  hdrs["Prefer"] = "return=minimal";
    if (payload) hdrs["Content-Length"] = Buffer.byteLength(payload);
    const req = https.request({ hostname: host, path: "/rest/v1/" + path, method, headers: hdrs }, r => {
      let d = ""; r.on("data", c => d += c);
      r.on("end", () => {
        let parsed = null; try { parsed = JSON.parse(d); } catch {}
        res(r.statusCode >= 400 ? { data: null, error: parsed || d.slice(0, 200) } : { data: parsed, error: null });
      });
    });
    req.on("error", e => res({ data: null, error: e.message }));
    req.setTimeout(8000, () => { req.destroy(); res({ data: null, error: "timeout" }); });
    if (payload) req.write(payload);
    req.end();
  });
}

const db = {
  get:    slug  => sbReq("GET",   "pages?slug=eq." + encodeURIComponent(slug) + "&select=*&limit=1", null),
  insert: row   => sbReq("POST",  "pages", row),
  update: (slug, row) => sbReq("PATCH", "pages?slug=eq." + encodeURIComponent(slug), row),
};

// -- Memory cache ----------------------------------------------------------------
const mem = new Map();
const MEM_TTL = 1000 * 60 * 60 * 6; // 6h warm cache
function mGet(k) { const e = mem.get(k); if (!e || Date.now() - e.t > MEM_TTL) { mem.delete(k); return null; } return e.v; }
function mSet(k, v) { if (mem.size > 300) mem.delete(mem.keys().next().value); mem.set(k, { v, t: Date.now() }); }

// -- Helpers ---------------------------------------------------------------------
function mkSlug(s) { return s.toLowerCase().replace(/[^a-z0-9\s-]/g,"").replace(/\s+/g,"-").replace(/-+/g,"-").trim(); }
function amzUrl(n) { return "https://www.amazon.com/s?k=" + encodeURIComponent(n) + "&tag=" + TAG; }
function amzDirect(item) {
  const asin = item && item.asin;
  if (asin && /^B[0-9A-Z]{9}$/.test(asin)) return "https://www.amazon.com/dp/" + asin + "?tag=" + TAG;
  return amzUrl(item.name);
}
function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function asinImg(asin) {
  if (!asin || !/^B[0-9A-Z]{9}$/.test(asin)) return null;
  return "https://images-na.ssl-images-amazon.com/images/P/" + asin + ".01._SL200_.jpg";
}

// -- Claude call -----------------------------------------------------------------
function claude(apiKey, system, user, maxTok) {
  const body = JSON.stringify({ model: MODEL, max_tokens: maxTok, system, messages: [{ role:"user", content:user }] });
  return new Promise((ok, fail) => {
    const req = https.request({
      hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
      headers: { "Content-Type":"application/json", "Content-Length":Buffer.byteLength(body), "x-api-key":apiKey, "anthropic-version":"2023-06-01" }
    }, r => { let d = ""; r.on("data", c => d += c); r.on("end", () => ok({ status: r.statusCode, raw: d })); });
    req.on("error", fail);
    req.setTimeout(28000, () => req.destroy(new Error("Timeout")));
    req.write(body); req.end();
  });
}

// -- JSON extractor --------------------------------------------------------------
function xJSON(text) {
  let s = text.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a !== -1 && b !== -1) s = s.slice(a, b + 1);
  s = s.replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/,(\s*[}\]])/g,"$1");
  // Remove control chars; escape bare newlines inside strings
  let out = "", inStr = false, prev = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' && prev !== "\\") inStr = !inStr;
    if (inStr && c === "\n") { out += " "; prev = " "; continue; }
    if (inStr && c === "\r") { prev = ""; continue; }
    if (inStr && c === "\t") { out += " "; prev = " "; continue; }
    if (c.charCodeAt(0) < 32 && c !== "\n" && c !== "\r" && c !== "\t") { prev = " "; continue; }
    out += c; prev = c;
  }
  return JSON.parse(out);
}

// -- Pre-render HTML page (lifetime SEO storage) ---------------------------------
function renderHTML(data, slug) {
  const o   = data.original;
  const alt = data.alternatives || [];
  const pSlug = mkSlug(o.name);

  const altCards = alt.map((a, i) => {
    const types   = ["Cheap Option","Best Deal","Best Value","Our Recommendation"];
    const colors  = ["#16A34A","#C2410C","#7C3AED","#2563EB"];
    const bgcols  = ["#F0FDF4","#FFF7ED","#F5F3FF","#EFF6FF"];
    const brdcols = ["#BBF7D0","#FED7AA","#DDD6FE","#BFDBFE"];
    const t = types[Math.min(i, 3)], col = colors[Math.min(i, 3)];
    const bg = bgcols[Math.min(i, 3)], brd = brdcols[Math.min(i, 3)];
    const pct = a.save || ("Save " + Math.round((1 - a.price / o.price) * 100) + "%");
    return '<div style="background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:14px;padding:18px 20px;margin-bottom:12px">' +
      '<span style="background:' + bg + ';color:' + col + ';border:1px solid ' + brd + ';font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px">' + t + '</span>' +
      '<div style="font-size:15px;font-weight:700;margin:8px 0 4px">' + esc(a.name) + '</div>' +
      '<div style="font-size:18px;font-weight:800;color:' + col + '">' + pct + '</div>' +
      (a.reason ? '<div style="font-size:13px;color:#475569;margin:6px 0 10px">' + esc(a.reason) + '</div>' : '') +
      '<a href="' + amzUrl(a.name) + '" target="_blank" rel="noopener" style="display:inline-block;background:#FF9900;color:#0F172A;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">View deal on Amazon &#8594;</a>' +
      '</div>';
  }).join("");

  const title = "Cheaper Alternatives to " + o.name + " — Save Money in 2026";
  const desc  = "Find the best cheaper alternatives to " + o.name + " on Amazon. Compare prices and value.";
  const fav   = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%232563EB'/%3E%3Ctext x='16' y='22' font-family='Inter' font-size='13' font-weight='800' fill='white' text-anchor='middle'%3ECA%3C/text%3E%3C/svg%3E";

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(title)} | CheapestAlt</title>
<meta name="description" content="${esc(desc)}"/>
<meta property="og:title" content="${esc(title)}"/><meta property="og:description" content="${esc(desc)}"/>
<link rel="canonical" href="https://www.cheapestalt.com/find?slug=${esc(slug)}"/>
<link rel="icon" type="image/svg+xml" href="${fav}"/>
<meta name="theme-color" content="#2563EB"/>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-6MR7X29W2X"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-6MR7X29W2X');</script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,system-ui,sans-serif;color:#0F172A;background:#fff;-webkit-font-smoothing:antialiased}
.hdr{background:#fff;border-bottom:1.5px solid #E2E8F0;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 28px;height:58px;position:sticky;top:0;z-index:200}
.logo{font-size:18px;font-weight:800;color:#0F172A;text-decoration:none;letter-spacing:-0.4px}
.logo em{color:#2563EB;font-style:normal}
.nav{display:flex;gap:6px;justify-self:center}
.nav a{background:#2563EB;border:1.5px solid #2563EB;padding:7px 16px;border-radius:8px;font-size:13.5px;font-weight:600;color:#fff;text-decoration:none;white-space:nowrap}
.nav a:hover{background:#1D4ED8}
.tag{font-size:12px;color:#0F172A;border:1.5px solid #E2E8F0;border-radius:20px;padding:4px 12px;font-weight:500;background:#F8FAFC;justify-self:end;white-space:nowrap}
.wrap{max-width:860px;margin:0 auto;padding:44px 24px 80px}
h1{font-size:30px;font-weight:800;letter-spacing:-0.6px;line-height:1.2;margin-bottom:12px}
.lead{font-size:15px;color:#475569;margin-bottom:32px;line-height:1.7}
.orig{background:#fff;border:2px solid #BFDBFE;border-radius:14px;padding:20px 24px;margin-bottom:28px;display:flex;gap:20px;align-items:center}
.orig-icon{font-size:44px}
.orig-info{flex:1}
.orig-label{font-size:11px;font-weight:700;color:#2563EB;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
.orig-name{font-size:17px;font-weight:700;margin-bottom:6px}
.orig-price{font-size:26px;font-weight:800;margin-bottom:8px}
.btn-az{display:inline-block;background:#FF9900;color:#0F172A;padding:11px 22px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none}
.btn-az:hover{background:#E88A00}
.alts-label{font-size:12px;font-weight:700;color:#0F172A;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:14px;padding-bottom:10px;border-bottom:1.5px solid #E2E8F0}
.disc{background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:10px;padding:12px 16px;font-size:12px;color:#475569;margin-top:24px}
.ftr{background:#F8FAFC;border-top:1.5px solid #E2E8F0;padding:24px 28px;margin-top:40px}
.ftr-in{max-width:860px;margin:0 auto;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:13px;color:#0F172A;align-items:center}
.ftr-in a{color:#0F172A;text-decoration:none;font-weight:500}.ftr-in a:hover{color:#2563EB}
.faq-sec{border:1.5px solid #E2E8F0;border-radius:12px;overflow:hidden;margin-top:24px}
.faq-hd{background:#F8FAFC;padding:12px 18px;font-size:14px;font-weight:700;border-bottom:1.5px solid #E2E8F0}
.faq-bd{padding:16px 18px}
.faq-q{font-size:14px;font-weight:700;margin-bottom:5px;color:#0F172A}
.faq-a{font-size:13px;color:#475569;line-height:1.6;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #F1F5F9}
.faq-a:last-child{margin-bottom:0;padding-bottom:0;border-bottom:none}
@media(max-width:640px){.hdr{display:flex;flex-direction:column;height:auto;padding:12px 16px;gap:10px;align-items:center;text-align:center}.logo{justify-self:unset}.tag{display:none}.nav{justify-content:center;flex-wrap:wrap;gap:6px;width:100%}.nav a{font-size:12px;padding:6px 10px;white-space:nowrap}.orig{flex-direction:column}.wrap{padding:28px 16px 60px}h1{font-size:22px}}
</style></head><body>
<header class="hdr">
  <a href="/" class="logo">Cheapest<em>Alt</em></a>
  <nav class="nav"><a href="/">Find Alternatives</a><a href="https://cheapestalt.com/compare">Compare</a></nav>
  <div class="tag">Free Â· No signup needed</div>
</header>
<main class="wrap">
  <h1>${esc(title)}</h1>
  <p class="lead">Compare the best cheaper alternatives to ${esc(o.name)} on Amazon — with real value analysis and direct deal links.</p>
  <div class=”orig”>
    ${o.image ? `<div class=”orig-icon”><img src=”${esc(o.image)}” alt=”${esc(o.name)}” style=”width:44px;height:44px;object-fit:contain;border-radius:8px;display:block;” onerror=”this.parentElement.style.display='none'”/></div>` : ''}
    <div class="orig-info">
      <div class="orig-label">Original product</div>
      <div class="orig-name">${esc(o.name)}</div>
      <div class="orig-price">$${Number(o.price||0).toLocaleString()}</div>
      <a href="${amzUrl(o.name)}" target="_blank" rel="noopener" class="btn-az">Check price on Amazon &#8594;</a>
    </div>
  </div>
  <div class="alts-label">Cheaper alternatives — click to check price on Amazon</div>
  ${altCards}
  <div style="margin-top:28px;display:flex;gap:10px;flex-wrap:wrap">
    <a href="/find?slug=best-${pSlug}-alternatives" style="background:#F8FAFC;border:1.5px solid #E2E8F0;padding:8px 16px;border-radius:20px;font-size:13px;font-weight:600;color:#0F172A;text-decoration:none">Best ${esc(o.name)} alternatives</a>
    <a href="/find?slug=cheap-${pSlug}-alternatives" style="background:#F8FAFC;border:1.5px solid #E2E8F0;padding:8px 16px;border-radius:20px;font-size:13px;font-weight:600;color:#0F172A;text-decoration:none">Cheapest ${esc(o.name)} alternatives</a>
  </div>
  ${(data.faqs && data.faqs.length) ? '<div class="faq-sec"><div class="faq-hd">Frequently asked questions</div><div class="faq-bd">' + data.faqs.map(f => '<div class="faq-q">' + esc(f.q) + '</div><div class="faq-a">' + esc(f.a) + '</div>').join("") + '</div></div>' : ''}
  <div class="disc"><strong>Affiliate disclosure:</strong> Links are Amazon affiliate links (tag: ${TAG}). We earn a small commission at no extra cost to you.</div>
</main>
<footer class="ftr"><div class="ftr-in">
  <span>Â© 2026 CheapestAlt</span>
  <div style="display:flex;gap:16px;flex-wrap:wrap">
    <a href="/">Home</a><a href="/#about">About</a><a href="mailto:Support@cheapestalt.com">Contact</a>
  </div>
</div></footer>
</body></html>`;
}


// -- Render unique VARIANT article (best / cheapest / general) — SEO optimised ----
function renderVariantHTML(data, slug, angle, qBase, pSlug) {
  const o   = data.original || {};
  const alt = data.alternatives || [];
  const oName = o.name || qBase;

  // Per-angle copy
  const cfg = {
    general: {
      label:   "Top",
      h1:      "Top Alternatives to " + oName + " — Best Value Picks in 2026",
      desc:    "Compare the top cheaper alternatives to " + oName + " on Amazon. Honest value analysis, pros & cons, and expert recommendation.",
      intro:   oName + " is a popular product but comes at a premium price. We analysed hundreds of Amazon listings to find the best alternatives that offer real value — not just a lower price tag. Every option below has been selected for quality, customer satisfaction, and genuine savings.",
      focus:   "Balanced mix of budget and mid-range options.",
      recTitle:"Best overall pick",
    },
    best: {
      label:   "Best",
      h1:      "Best Alternatives to " + oName + " — Top-Rated Picks in 2026",
      desc:    "Find the best-rated alternatives to " + oName + " on Amazon. Compare top-reviewed options with pros, cons, and expert recommendation.",
      intro:   "Looking for the highest-rated alternatives to " + oName + "? We filtered Amazon by customer rating, number of reviews, and overall satisfaction to bring you the best options. These alternatives are top-ranked in their category and trusted by thousands of buyers.",
      focus:   "Highest-rated and most reviewed options.",
      recTitle:"Our top-rated pick",
    },
    cheap: {
      label:   "Cheapest",
      h1:      "Cheapest Alternatives to " + oName + " — Save the Most in 2026",
      desc:    "Find the cheapest alternatives to " + oName + " on Amazon and save up to 80%. Compare budget picks with pros, cons, and buying advice.",
      intro:   "Want the maximum savings vs " + oName + "? We searched Amazon for the most affordable alternatives that still deliver acceptable quality. Whether you need a temporary solution or just want to save money without compromising too much, these budget picks deliver the most savings.",
      focus:   "Cheapest options with the most savings percentage.",
      recTitle:"Best budget pick",
    },
  };
  const angle2 = cfg[angle] ? angle : "general";
  const cv = cfg[angle2];

  const FAV = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%232563EB'/%3E%3Ctext x='16' y='22' font-family='Inter' font-size='13' font-weight='800' fill='white' text-anchor='middle'%3ECA%3C/text%3E%3C/svg%3E";
  const GA  = "G-6MR7X29W2X";
  const CSS = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,system-ui,sans-serif;color:#0F172A;background:#fff;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;min-height:100vh}main{flex:1}.wrap{max-width:880px;margin:0 auto;padding:44px 24px 80px}.hdr{background:#fff;border-bottom:1.5px solid #E2E8F0;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 28px;height:58px;position:sticky;top:0;z-index:200}.logo{font-size:18px;font-weight:800;color:#0F172A;text-decoration:none;letter-spacing:-0.4px;justify-self:start}.logo em{color:#2563EB;font-style:normal}.nav{display:flex;gap:6px;justify-self:center}.nav a{background:#2563EB;padding:7px 16px;border-radius:8px;font-size:13.5px;font-weight:600;color:#fff;text-decoration:none;white-space:nowrap}.nav a:hover{background:#1D4ED8}.tag{font-size:12px;color:#0F172A;border:1.5px solid #E2E8F0;border-radius:20px;padding:4px 12px;font-weight:500;background:#F8FAFC;justify-self:end;white-space:nowrap}h1{font-size:28px;font-weight:800;letter-spacing:-0.6px;line-height:1.2;margin-bottom:12px}h2{font-size:18px;font-weight:700;margin:28px 0 12px}.lead{font-size:15px;color:#475569;margin-bottom:28px;line-height:1.7}.badge{display:inline-block;background:#EFF6FF;color:#2563EB;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;border:1px solid #BFDBFE;margin-bottom:16px}.sec{border:1.5px solid #E2E8F0;border-radius:12px;margin-bottom:12px;overflow:hidden}.sec-h{background:#F8FAFC;padding:12px 18px;font-size:14px;font-weight:700;cursor:pointer;display:flex;justify-content:space-between;align-items:center;user-select:none}.sec-h:hover{background:#F1F5F9}.sec-b{display:none;padding:16px 18px;border-top:1px solid #E2E8F0}.sec.open .sec-b{display:block}.sec-ico{font-size:11px;transition:transform .2s;flex-shrink:0}.sec.open .sec-ico{transform:rotate(180deg)}.orig-card{background:#fff;border:2px solid #BFDBFE;border-radius:14px;padding:20px 24px;margin-bottom:24px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}.orig-ico{font-size:44px;flex-shrink:0}.orig-lbl{font-size:11px;font-weight:700;color:#2563EB;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}.orig-name{font-size:17px;font-weight:700;margin-bottom:6px}.orig-price{font-size:24px;font-weight:800;margin-bottom:10px}.alt-card{border:1.5px solid #E2E8F0;border-radius:12px;padding:18px 20px;margin-bottom:12px;background:#fff}.alt-top{display:flex;gap:14px;align-items:flex-start;margin-bottom:12px}.alt-ico{font-size:32px;flex-shrink:0;width:42px;text-align:center}.alt-bdg{display:inline-block;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:6px}.alt-name{font-size:15px;font-weight:700;margin-bottom:4px}.alt-save{font-size:19px;font-weight:800;margin-bottom:6px}.alt-reason{font-size:13px;color:#475569;line-height:1.6;margin-bottom:10px}.pc-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0}.pc-col{background:#F8FAFC;border-radius:8px;padding:10px 12px}.pc-col-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px}.pc{display:flex;gap:6px;font-size:13px;padding:2px 0;align-items:flex-start}.pc-dot{width:15px;height:15px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;margin-top:2px}.verdict-card{background:#FFFBEB;border:1.5px solid #FDE68A;border-radius:10px;padding:12px 16px;font-size:13px;line-height:1.7;color:#78350F;margin:10px 0}.rec-box{background:#0F172A;border-radius:12px;padding:18px 22px;color:#E2E8F0;font-size:14px;line-height:1.75}.rec-title{font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px}.faq-q{font-size:14px;font-weight:700;margin-bottom:5px;color:#0F172A}.faq-a{font-size:13px;color:#475569;line-height:1.6;margin-bottom:14px}.btn-az{display:inline-block;background:#FF9900;color:#0F172A;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;margin-top:10px}.btn-az:hover{background:#E88A00}.rel{display:flex;gap:8px;flex-wrap:wrap}.rel a{background:#F8FAFC;border:1.5px solid #E2E8F0;padding:7px 14px;border-radius:20px;font-size:13px;font-weight:600;color:#0F172A;text-decoration:none}.rel a:hover{border-color:#2563EB;color:#2563EB}.disc{background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:10px;padding:12px 16px;font-size:12px;color:#475569;margin-top:24px}.ftr{background:#F8FAFC;border-top:1.5px solid #E2E8F0;padding:24px 28px}.ftr-in{max-width:880px;margin:0 auto;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:13px;color:#0F172A;align-items:center}.ftr-in a{color:#0F172A;text-decoration:none;font-weight:500}.ftr-in a:hover{color:#2563EB}.ftr-links{display:flex;gap:16px;flex-wrap:wrap}@media(max-width:640px){.hdr{display:flex;flex-direction:column;height:auto;padding:12px 16px;gap:10px;align-items:center;text-align:center}.logo{justify-self:unset}.tag{display:none}.nav{justify-content:center;flex-wrap:wrap;gap:6px;width:100%}.nav a{font-size:12px;padding:6px 10px;white-space:nowrap}.pc-grid{grid-template-columns:1fr}.wrap{padding:28px 16px 60px}h1{font-size:22px}}`;

  // Badge styles per card position
  const types  = ["Cheap Option","Best Deal","Best Value Pick","Our Recommendation"];
  const colors = ["#16A34A","#C2410C","#7C3AED","#2563EB"];
  const bgs    = ["#F0FDF4","#FFF7ED","#F5F3FF","#EFF6FF"];
  const brds   = ["#BBF7D0","#FED7AA","#DDD6FE","#BFDBFE"];

  // Per-alternative default pros/cons (since Haiku prompt is simple)
  const defaultPros = [
    ["Significant price saving","Available on Amazon Prime","Good value for money"],
    ["Highly rated by customers","Strong build quality","Competitive price"],
    ["Low price point","Good for casual use","Easy to find on Amazon"],
    ["Best price-to-quality ratio","Recommended by experts","Trusted brand"],
  ];
  const defaultCons = [
    ["Not as premium as original","Fewer features"],
    ["May lack some premium features","Smaller brand"],
    ["Basic feature set","Entry-level quality"],
    ["May sell out quickly","Limited availability"],
  ];

  function pcItem(text, type) {
    return '<div class="pc"><span class="pc-dot" style="background:' +
      (type==="pro" ? "#F0FDF4;color:#16A34A" : "#FEF2F2;color:#DC2626") + '">' +
      (type==="pro" ? "&#10003;" : "&#10007;") + '</span>' + esc(text) + '</div>';
  }

  function sec(title, content, open) {
    return '<div class="sec' + (open ? ' open' : '') + '" onclick="tog(this)">' +
      '<div class="sec-h">' + esc(title) + '<span class="sec-ico">&#9662;</span></div>' +
      '<div class="sec-b">' + content + '</div></div>';
  }

  // Original product card
  const origCard =
    '<div class=”orig-card”>' +
    (o.image ? '<div class=”orig-ico”><img src=”' + esc(o.image) + '” alt=”' + esc(oName) + '” style=”width:44px;height:44px;object-fit:contain;border-radius:8px;display:block;” onerror=”this.parentElement.style.display=\'none\'”></div>' : '') +
    '<div style="flex:1;min-width:160px">' +
      '<div class="orig-lbl">Original product</div>' +
      '<div class="orig-name">' + esc(oName) + '</div>' +
      '<div class="orig-price">$' + Number(o.price||0).toLocaleString() + '</div>' +
      '<a href="' + amzUrl(oName) + '" target="_blank" rel="noopener" class="btn-az">Check price on Amazon &#8594;</a>' +
    '</div></div>';

  // Alternative cards — each unique with pros/cons and verdict
  const altCards = alt.map((a, i) => {
    const idx = Math.min(i, 3);
    const pct = a.save || ("Save " + Math.round(Math.max(0,(1-(a.price||0)/(o.price||1))*100)) + "%");
    const pros = (a.pros || defaultPros[idx] || defaultPros[0]);
    const cons = (a.cons || defaultCons[idx] || defaultCons[0]);
    const verdict = a.verdict || (angle2==="cheap"
      ? "Best budget pick if you want maximum savings on " + oName + "."
      : angle2==="best"
      ? "Top-rated option with strong customer reviews."
      : "Solid value alternative to " + oName + " — recommended for most buyers.");

    return ‘<div class="alt-card">’ +
      ‘<div class="alt-top">’ +
        (a.image ? ‘<div class="alt-ico"><img src="’ + esc(a.image) + ‘" alt="’ + esc(a.name) + ‘" style="width:40px;height:40px;object-fit:contain;border-radius:6px;display:block;margin:auto;" onerror="this.parentElement.style.display=\’none\’"></div>’ : ‘’) +
        '<div style="flex:1">' +
          '<span class="alt-bdg" style="background:' + bgs[idx] + ';color:' + colors[idx] + ';border:1px solid ' + brds[idx] + '">' + types[idx] + '</span>' +
          '<div class="alt-name">' + esc(a.name) + '</div>' +
          '<div class="alt-save" style="color:' + colors[idx] + '">' + esc(pct) + '</div>' +
          (a.reason ? '<div class="alt-reason">' + esc(a.reason) + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="pc-grid">' +
        '<div class="pc-col"><div class="pc-col-title" style="color:#16A34A">Pros</div>' +
          pros.map(p => pcItem(p,"pro")).join("") +
        '</div>' +
        '<div class="pc-col"><div class="pc-col-title" style="color:#DC2626">Cons</div>' +
          cons.map(p => pcItem(p,"con")).join("") +
        '</div>' +
      '</div>' +
      '<div class="verdict-card"><strong>Verdict: </strong>' + esc(verdict) + '</div>' +
      '<a href="' + amzUrl(a.name) + '" target="_blank" rel="noopener" class="btn-az">View deal on Amazon &#8594;</a>' +
      '</div>';
  }).join("");

  // Recommendation box — picks best option by angle
  const best = angle2==="cheap"
    ? alt.reduce((a,b) => ((a.price||9999) < (b.price||9999) ? a : b), alt[0]||{})
    : alt.reduce((a,b) => ((a.rating||0) > (b.rating||0) ? a : b), alt[0]||{});
  const recText = angle2==="cheap"
    ? "For maximum savings, we recommend <strong>" + esc(best.name||"") + "</strong> — the cheapest option at $" + Number(best.price||0).toLocaleString() + ". It offers the highest savings percentage vs " + esc(oName) + " and is available on Amazon."
    : angle2==="best"
    ? "Our top-rated pick is <strong>" + esc(best.name||"") + "</strong> — it has the strongest customer ratings and delivers the best quality-to-price ratio in this comparison."
    : "For most buyers, we recommend <strong>" + esc(best.name||"") + "</strong> — it strikes the best balance between price, quality, and availability on Amazon.";

  // FAQs — use Claude-generated if available, else fallback per angle
  const claudeFaqs = (data.faqs && data.faqs.length >= 3) ? data.faqs : null;
  const faqs = claudeFaqs || (angle2==="cheap" ? [
    { q: "What is the cheapest alternative to " + oName + "?",
      a: (alt[0]||{}).name ? (alt[0].name + " at $" + Number((alt[0].price||0)).toLocaleString() + " — a saving of " + (alt[0].save||"up to 80%") + " vs the original.") : "See the options above for current Amazon prices." },
    { q: "Are cheap alternatives to " + oName + " worth it?",
      a: "Yes — many budget alternatives deliver 80% of the performance at 30% of the price. The key is to check reviews and ratings before buying, which we have done for you above." },
    { q: "Do budget alternatives come with a warranty?",
      a: "Most alternatives sold on Amazon include at least a 12-month manufacturer warranty. Check the product listing for full warranty details." },
    { q: "Can I return a " + oName + " alternative if I am not satisfied?",
      a: "Yes — all products listed here are sold on Amazon, which offers a standard 30-day return policy on most items." },
  ] : angle2==="best" ? [
    { q: "What is the best-rated alternative to " + oName + "?",
      a: (alt[0]||{}).name ? (alt[0].name + " — it has the highest customer rating and most positive reviews in this category.") : "See the top options above ranked by customer rating." },
    { q: "How do I choose the best alternative to " + oName + "?",
      a: "Look at customer ratings (4 stars and above), number of reviews (more is better), and whether the product is sold by a reputable brand. All options above meet these criteria." },
    { q: "Are highly-rated alternatives reliable?",
      a: "Products with 4+ star ratings and thousands of reviews are generally very reliable. We only include alternatives with proven track records in this list." },
    { q: "What features should I look for in an alternative to " + oName + "?",
      a: "Focus on the core features you use most. Our pros and cons breakdown above highlights which alternatives excel at specific features so you can match them to your needs." },
  ] : [
    { q: "What is the best alternative to " + oName + "?",
      a: (alt[0]||{}).name ? ("Based on our analysis, " + alt[0].name + " offers the best overall value — strong savings with good quality and positive Amazon reviews.") : "See our top picks above — each has been selected for value and quality." },
    { q: "How much can I save by switching from " + oName + "?",
      a: "Depending on the alternative you choose, you can save anywhere from 30% to 80% compared to " + oName + ". Check the savings percentage next to each option above." },
    { q: "Do alternatives to " + oName + " ship with Amazon Prime?",
      a: "Yes — all alternatives listed above are available on Amazon, and most qualify for Prime shipping with free 1-2 day delivery." },
    { q: "Is it safe to buy alternatives to " + oName + " on Amazon?",
      a: "Amazon has a strong buyer protection policy. All products are returnable within 30 days if you are not satisfied, making it risk-free to try a cheaper alternative." },
  ]);

  // Cross-links to other variants
  const relLinks =
    '<div class="rel">' +
    (angle2!=="general" ? '<a href="/find?slug=' + qBase + '-alternatives">Top ' + esc(oName) + ' alternatives</a>' : '') +
    (angle2!=="best"    ? '<a href="/find?slug=best-' + qBase + '-alternatives">Best alternatives</a>' : '') +
    (angle2!=="cheap"   ? '<a href="/find?slug=cheap-' + qBase + '-alternatives">Cheapest alternatives</a>' : '') +
    '<a href="/">Search more products &#8594;</a>' +
    '</div>';

  // FAQ HTML
  const faqHtml = faqs.map(f =>
    '<div style="padding:12px 0;border-bottom:1px solid #F1F5F9">' +
    '<div class="faq-q">' + esc(f.q) + '</div>' +
    '<div class="faq-a">' + esc(f.a) + '</div></div>'
  ).join("");

  const body =
    '<div class="badge">' + cv.label + ' alternatives</div>' +
    '<h1>' + esc(cv.h1) + '</h1>' +
    '<p class="lead">' + esc(cv.intro) + '</p>' +
    '<h2>Original: ' + esc(oName) + '</h2>' +
    origCard +
    '<h2>' + cv.label + ' alternatives — pros, cons & verdict</h2>' +
    altCards +
    sec("Expert recommendation",
      '<div class="rec-box"><div class="rec-title">' + cv.recTitle + '</div>' + recText + '</div>') +
    sec("Frequently asked questions", faqHtml) +
    sec("Related pages", relLinks) +
    '<div class="disc"><strong>Affiliate disclosure:</strong> Links are Amazon affiliate links (tag: ' + TAG + '). We earn a small commission at no extra cost to you. Rankings are based on value analysis — never paid placements.</div>';

  return '<!DOCTYPE html><html lang="en"><head>\n' +
    '<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>\n' +
    '<title>' + esc(cv.h1) + ' | CheapestAlt</title>\n' +
    '<meta name="description" content="' + esc(cv.desc) + '"/>\n' +
    '<meta property="og:title" content="' + esc(cv.h1) + '"/>\n' +
    '<meta property="og:description" content="' + esc(cv.desc) + '"/>\n' +
    '<link rel="canonical" href="https://www.cheapestalt.com/find?slug=' + esc(slug) + '"/>\n' +
    '<link rel="icon" type="image/svg+xml" href="' + FAV + '"/>\n' +
    '<meta name="theme-color" content="#2563EB"/>\n' +
    '<script async src="https://www.googletagmanager.com/gtag/js?id=' + GA + '"></script>\n' +
    '<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","' + GA + '");</script>\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"/>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>\n' +
    '<style>' + CSS + '</style></head><body>\n' +
    '<header class="hdr"><a href="/" class="logo">Cheapest<em>Alt</em></a>' +
    '<nav class="nav"><a href="/">Find Alternatives</a><a href="https://cheapestalt.com/compare">Compare Products</a></nav>' +
    '<div class="tag">Free &middot; No signup needed</div></header>\n' +
    '<main class="wrap">' + body + '</main>\n' +
    '<footer class="ftr"><div class="ftr-in"><span>&copy; 2026 CheapestAlt. All rights reserved.</span>' +
    '<div class="ftr-links"><a href="/">Home</a><a href="/#about">About</a>' +
    '<a href="/#how-it-works">How it works</a><a href="/#disclosure">Affiliate Disclosure</a>' +
    '<a href="mailto:Support@cheapestalt.com">Contact</a></div></div></footer>\n' +
    '<script>function tog(el){el.classList.toggle("open")}</script>\n' +
    '</body></html>';
}

// -- Prompt ----------------------------------------------------------------------
const SYS = 'Return ONLY valid JSON. No markdown. No apostrophes. ' +
  'Schema: {"original":{"name":"str","asin":"B0XXXXXXXXX","price":99,"rating":4.5,"reviews":1000,"icon":"emoji"},' +
  '"alternatives":[{"name":"str","asin":"B0XXXXXXXXX","price":49,"rating":4.2,"reviews":500,"icon":"emoji","save":"Save X%","reason":"str"}],' +
  '"faqs":[{"q":"str","a":"str"},{"q":"str","a":"str"},{"q":"str","a":"str"},{"q":"str","a":"str"}]}. ' +
  'Rules: 4 cheaper Amazon alternatives, include the real Amazon ASIN for every product (format B followed by 9 uppercase letters/digits — leave empty string if unknown), estimate real current Amazon USD price for every product (never use 0), sort by most savings, 4 FAQs specific to this product and its alternatives, no apostrophes.';

// -- Main handler ----------------------------------------------------------------
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed", received: req.method, url: req.url });

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "CLAUDE_API_KEY not set" });

  const { query } = req.body || {};
  if (!query || typeof query !== "string" || !query.trim())
    return res.status(400).json({ error: "Missing field: query" });

  const q     = query.trim().slice(0, 150);
  const slug  = mkSlug(q);
  const hasDB = !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);

  // 1. Memory cache (fastest)
  const hit = mGet(slug);
  if (hit) return res.status(200).json(Object.assign({}, hit, { fromCache: true }));

  // 2. Supabase — permanent lifetime storage
  if (hasDB) {
    const { data: rows } = await db.get(slug);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row && row.content) {
      let result;
      try { result = (row.content && typeof row.content === "object") ? row.content : (row.content ? JSON.parse(row.content) : {}); }
      catch { result = {}; }
      mSet(slug, result);
      return res.status(200).json(Object.assign({}, result, { fromCache: false, fromDatabase: true }));
    }
  }

  // 3. Generate with Claude
  let cr;
  try { cr = await claude(apiKey, SYS, 'Find 4 cheaper alternatives for: "' + q + '". Return JSON only.', 900); }
  catch (e) { return res.status(502).json({ error: "Network error contacting AI. Please try again." }); }

  let cb;
  try { cb = JSON.parse(cr.raw); }
  catch { return res.status(502).json({ error: "Please try again in a few seconds." }); }

  if (cr.status !== 200)
    return res.status(502).json({ error: "AI service unavailable. Please try again." });

  const raw = cb && cb.content && cb.content[0] && cb.content[0].text;
  if (!raw) return res.status(502).json({ error: "Empty response. Please try again." });

  let data;
  try { data = xJSON(raw); }
  catch { return res.status(502).json({ error: "Please try again in a few seconds." }); }

  if (!data.original || !Array.isArray(data.alternatives))
    return res.status(502).json({ error: "Please try again with a different product name." });

  // 4. Enrich
  const pSlug = mkSlug(data.original.name) || slug;
  data.original.links = { amazon: amzDirect(data.original) };
  data.original.image = asinImg(data.original.asin);
  data.alternatives   = data.alternatives.map(a => Object.assign({}, a, {
    links: { amazon: amzDirect(a) },
    save:  a.save || ("Save " + Math.round((1 - a.price / data.original.price) * 100) + "%"),
    image: asinImg(a.asin),
  }));

  // 4b. Enrich original + alternatives with Amazon data (image, price, rating, direct link)
  try {
    const [origResults, ...altResults] = await Promise.all([
      amz.searchProducts(data.original.name, 1).catch(() => []),
      ...data.alternatives.map(alt => amz.searchProducts(alt.name, 1).catch(() => []))
    ]);
    if (origResults && origResults[0]) data.original.image = origResults[0].image || null;
    const realResults = altResults;
    data.alternatives = data.alternatives.map((alt, i) => {
      const real = realResults[i] && realResults[i][0];
      if (!real) return alt;
      return Object.assign({}, alt, {
        asin:      real.asin,
        image:     real.image || alt.image,
        realPrice: real.price,
        rating:    real.rating,
        reviews:   real.reviews,
        links:     { amazon: real.url },
      });
    });
    data.amazonProducts = realResults.map(r => r && r[0]).filter(Boolean);
  } catch(e) {
    console.log("Amazon API fallback:", e.message);
  }

  data.query       = q;
  data.slug        = slug;
  data.seoSlug     = pSlug + "-alternatives";
  data.seoUrls     = { alternatives: "/find?slug=" + pSlug + "-alternatives", best: "/find?slug=best-" + pSlug + "-alternatives", cheap: "/find?slug=cheap-" + pSlug + "-alternatives" };
  data.generatedAt = new Date().toISOString();
  data.fromCache   = false;
  data.fromDatabase = false;

  // 5. Pre-render HTML for instant SEO delivery
  const html = renderHTML(data, slug);

  // 6. Save to Supabase — AWAITED so Vercel doesn't kill before save completes
  if (hasDB) {
    // Save main slug
    const row = {
      slug,
      type:        "alternative",
      keyword:     q,
      title:       data.original.name + " — Cheaper Alternatives on Amazon",
      content:     data,
      html,
      created_at:  data.generatedAt,
      last_generated: data.generatedAt,
    };
    try {
      const r = await db.insert(row);
      if (r.error) {
        console.error("INSERT ERR:", JSON.stringify(r.error).slice(0,200));
        await db.update(slug, { content: data, html, last_generated: data.generatedAt });
      } else { console.log("SAVED:", slug); }
    } catch(e) { console.error("DB catch:", e.message); }

    // Save variant slugs in background — fire and forget to keep response fast
    const qBase = slug;
    const variantSlugs = new Set([
      qBase     + "-alternatives",
      "best-"  + qBase  + "-alternatives",
      "cheap-" + qBase  + "-alternatives",
      pSlug    + "-alternatives",
      "best-"  + pSlug + "-alternatives",
      "cheap-" + pSlug + "-alternatives",
    ]);
    variantSlugs.delete(slug);
    (async () => {
      for (const vs of variantSlugs) {
        const vAngle = vs.startsWith("best-") ? "best" : vs.startsWith("cheap-") ? "cheap" : "general";
        const vhtml = renderVariantHTML(data, vs, vAngle, qBase, pSlug);
        const vTitles = { best: "Best", cheap: "Cheapest", general: "Top" };
        const vrow = {
          slug: vs, type: "alternative", keyword: q,
          title: vTitles[vAngle] + " Alternatives to " + data.original.name + " on Amazon",
          content: data, html: vhtml,
          created_at: data.generatedAt, last_generated: data.generatedAt,
        };
        try {
          const vr = await db.insert(vrow);
          if (vr.error) await db.update(vs, { content: data, html: vhtml, last_generated: data.generatedAt });
        } catch(e) {}
      }
    })();
  }

  mSet(slug, data);
  return res.status(200).json(data);
};
