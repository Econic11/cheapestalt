"use strict";

const https = require("https");
const HAIKU  = "claude-haiku-4-5-20251001";
const SONNET = "claude-sonnet-4-6";
const TAG    = "cheapestalt-20";

function sbReq(method, path, body) {
  const base = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return Promise.resolve({ data: null, error: "no-config" });
  const host = base.replace(/^https?:\/\//, "");
  const pl   = body ? JSON.stringify(body) : null;
  return new Promise(resolve => {
    const h = { "apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json" };
    if (method === "POST")  h["Prefer"] = "resolution=merge-duplicates";
    if (pl) h["Content-Length"] = Buffer.byteLength(pl);
    const req = https.request({ hostname: host, path: "/rest/v1/" + path, method, headers: h }, r => {
      let d = ""; r.on("data", c => d += c);
      r.on("end", () => {
        let p = null; try { p = JSON.parse(d); } catch {}
        resolve(r.statusCode >= 400 ? { data: null, error: p || d.slice(0, 300) } : { data: p, error: null });
      });
    });
    req.on("error", e => resolve({ data: null, error: e.message }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ data: null, error: "timeout" }); });
    if (pl) req.write(pl);
    req.end();
  });
}

const db = {
  getAlt: s => sbReq("GET", "pages?slug=eq." + encodeURIComponent(s) + "&select=slug,html,content&limit=1", null),
  saveAlt: r => sbReq("POST", "pages", r),
  updAlt: (s, r) => sbReq("PATCH", "pages?slug=eq." + encodeURIComponent(s), r),
  getCmp: s => sbReq("GET", "comparisons?slug=eq." + encodeURIComponent(s) + "&select=slug,html,content&limit=1", null),
  saveCmp: r => sbReq("POST", "comparisons?on_conflict=slug", r),
  updCmp: (s, r) => sbReq("PATCH", "comparisons?slug=eq." + encodeURIComponent(s), r),
};

const mem = new Map();
function mGet(k) { const e = mem.get(k); if (!e || Date.now() - e.t > 86400000) { mem.delete(k); return null; } return e.v; }
function mSet(k, v) { if (mem.size > 500) mem.delete(mem.keys().next().value); mem.set(k, { v, t: Date.now() }); }

function mkSlug(s) { return s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim(); }
function unslug(s) { return s.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function amz(n) { return "https://www.amazon.com/s?k=" + encodeURIComponent(n) + "&tag=" + TAG; }
function asinImg(asin) {
  if (!asin || !/^B[0-9A-Z]{9}$/.test(asin)) return null;
  return "https://images-na.ssl-images-amazon.com/images/P/" + asin + ".01._SL200_.jpg";
}

async function fetchAmazonProducts(keyword) {
  try {
    const amzModule = require("./_amazon");
    return await amzModule.searchProducts(keyword, 4);
  } catch(e) {
    console.log("Amazon API skipped:", e.message);
    return [];
  }
}

function buildProductCards(products) {
  try {
    const amzModule = require("./_amazon");
    return amzModule.productGrid(products);
  } catch(e) {
    return "";
  }
}

function parseSlug(raw) {
  const s = raw.toLowerCase().trim();
  const vs = s.match(/^(.+?)-vs-(.+)$/);
  if (vs) return { type: "compare", a: unslug(vs[1]), b: unslug(vs[2]) };
  const best = s.match(/^best-(.+)-alternatives$/);
  if (best) return { type: "search", angle: "best", product: unslug(best[1]) };
  const cheap = s.match(/^cheap-(.+)-alternatives$/);
  if (cheap) return { type: "search", angle: "cheap", product: unslug(cheap[1]) };
  const alt = s.match(/^(.+)-alternatives$/);
  if (alt) return { type: "search", angle: "general", product: unslug(alt[1]) };
  return null;
}

function callClaude(apiKey, model, system, user, maxTok) {
  const body = JSON.stringify({ model, max_tokens: maxTok, system, messages: [{ role: "user", content: user }] });
  return new Promise((ok, fail) => {
    const req = https.request({
      hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
    }, r => { let d = ""; r.on("data", c => d += c); r.on("end", () => ok({ status: r.statusCode, raw: d })); });
    req.on("error", fail);
    req.setTimeout(29000, () => req.destroy(new Error("Timeout")));
    req.write(body); req.end();
  });
}

function xJSON(text) {
  let s = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a !== -1 && b !== -1) s = s.slice(a, b + 1);
  s = s.replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(s);
}

const ALT_SYS = 'Return ONLY valid JSON. No markdown. No apostrophes. Exact schema: {"original":{"name":"str","price":99},"alternatives":[{"name":"str","price":49,"save":"Save 50%","reason":"one short sentence"},{"name":"str","price":39,"save":"Save 60%","reason":"one short sentence"},{"name":"str","price":29,"save":"Save 70%","reason":"one short sentence"},{"name":"str","price":19,"save":"Save 80%","reason":"one short sentence"}]}. Rules: real Amazon products, USD prices, 4 alternatives cheaper than original, no apostrophes.';

const CMP_SYS = 'Return ONLY valid JSON. No markdown. No apostrophes. Schema: {"productA":{"name":"str","price":0,"pros":["str","str","str"],"cons":["str","str"]},"productB":{"name":"str","price":0,"pros":["str","str","str"],"cons":["str","str"]},"comparison":[{"feature":"str","a":"str","b":"str","winner":"a"},{"feature":"str","a":"str","b":"str","winner":"b"},{"feature":"str","a":"str","b":"str","winner":"a"},{"feature":"str","a":"str","b":"str","winner":"tie"},{"feature":"str","a":"str","b":"str","winner":"b"},{"feature":"str","a":"str","b":"str","winner":"a"}],"intro":"str","verdict":"str","winner":"str","winnerReason":"str","faqs":[{"q":"str","a":"str"},{"q":"str","a":"str"},{"q":"str","a":"str"}]}. Rules: 6 comparison rows, winner = a or b or tie only, 3 pros 2 cons each, no apostrophes.';

function errPage(msg) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Error</title></head><body style="font-family:sans-serif;text-align:center;padding:80px"><h1>Oops</h1><p>' + esc(msg) + '</p><a href="/">Go home</a></body></html>';
}

function buildAltHTML(d, product, angle, rawSlug, amzProducts, amazonSection) {
  const o = d.original || {};
  const alt = d.alternatives || [];
  const origImg = (amzProducts && amzProducts[0] && amzProducts[0].image) || asinImg(o.asin) || null;
  const labelMap = { best: "Best", cheap: "Cheapest", general: "Top" };
  const lbl = labelMap[angle] || "Top";
  const title = lbl + " Alternatives to " + (o.name || product) + " - Save Money in 2026";
  const desc = "Find cheaper alternatives to " + (o.name || product) + " on Amazon.";
  const colors = ["#16A34A","#C2410C","#7C3AED","#2563EB"];
  const types = ["Cheap Option","Best Deal","Best Value","Our Recommendation"];
  const altCards = alt.map((a, i) => {
    const col = colors[Math.min(i,3)];
    const pct = a.save || ("Save " + Math.round(Math.max(0,(1-(a.price||0)/(o.price||1))*100)) + "%");
    const aImg = a.image || asinImg(a.asin);
    return '<div style="border:1.5px solid #E2E8F0;border-radius:12px;padding:18px 20px;margin-bottom:12px;background:#fff">' +
      '<div style="display:flex;gap:12px;align-items:flex-start">' +
      (aImg ? '<img src="' + esc(aImg) + '" alt="' + esc(a.name) + '" style="width:44px;height:44px;object-fit:contain;border-radius:8px;flex-shrink:0;background:#F8FAFC;border:1px solid #E2E8F0;" onerror="this.style.display=\'none\'"/>' : '') +
      '<div style="flex:1">' +
      '<span style="background:#F8FAFC;color:' + col + ';font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px">' + types[Math.min(i,3)] + '</span>' +
      '<div style="font-size:15px;font-weight:700;margin:8px 0 4px">' + esc(a.name) + '</div>' +
      '<div style="font-size:18px;font-weight:800;color:' + col + '">' + pct + '</div>' +
      (a.reason ? '<div style="font-size:13px;color:#475569;margin:6px 0 10px">' + esc(a.reason) + '</div>' : '') +
      '<a href="' + amz(a.name) + '" target="_blank" rel="noopener" style="display:inline-block;background:#FF9900;color:#0F172A;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">View on Amazon</a>' +
      '</div></div></div>';
  }).join("");

  return '<!DOCTYPE html><html lang="en"><head>' +
    '<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>' +
    '<title>' + esc(title) + ' | CheapestAlt</title>' +
    '<meta name="description" content="' + esc(desc) + '"/>' +
    '<link rel="canonical" href="https://cheapestalt.com/find?slug=' + esc(rawSlug) + '"/>' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet"/>' +
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,sans-serif;background:#fff;color:#0F172A}.hdr{background:#fff;border-bottom:1.5px solid #E2E8F0;padding:0 28px;height:58px;display:flex;align-items:center;justify-content:space-between}.logo{font-size:18px;font-weight:800;text-decoration:none;color:#0F172A}.logo em{color:#2563EB;font-style:normal}.nav a{background:#2563EB;color:#fff;padding:7px 16px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;margin-left:6px}.wrap{max-width:860px;margin:0 auto;padding:44px 24px 80px}h1{font-size:28px;font-weight:800;margin-bottom:12px}.lead{font-size:15px;color:#475569;margin-bottom:28px}.disc{background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:10px;padding:12px 16px;font-size:12px;color:#475569;margin-top:24px}.ftr{background:#F8FAFC;border-top:1.5px solid #E2E8F0;padding:24px 28px;margin-top:40px;font-size:13px;color:#475569;text-align:center}</style>' +
    '</head><body>' +
    '<header class="hdr"><a href="/" class="logo">Cheapest<em>Alt</em></a><nav><a href="/">Find Alternatives</a></nav></header>' +
    '<main class="wrap">' +
    '<h1>' + esc(title) + '</h1>' +
    '<p class="lead">Compare cheaper alternatives to ' + esc(o.name||product) + ' on Amazon.</p>' +
    '<div style="border:2px solid #BFDBFE;border-radius:14px;padding:20px 24px;margin-bottom:28px;display:flex;gap:16px;align-items:center">' +
    (origImg ? '<img src="' + origImg + '" alt="' + esc(o.name||product) + '" style="width:44px;height:44px;object-fit:contain;border-radius:8px;display:block;flex-shrink:0;" onerror="this.style.display=\'none\'"/>' : '') +
    '<div><div style="font-size:11px;font-weight:700;color:#2563EB;text-transform:uppercase;margin-bottom:4px">Original product</div>' +
    '<div style="font-size:17px;font-weight:700;margin-bottom:6px">' + esc(o.name||product) + '</div>' +
    '<div style="font-size:24px;font-weight:800;margin-bottom:10px">$' + Number(o.price||0).toLocaleString() + '</div>' +
    '<a href="' + amz(o.name||product) + '" target="_blank" rel="noopener" style="display:inline-block;background:#FF9900;color:#0F172A;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">Check price on Amazon</a>' +
    '</div></div>' +
    altCards +
    '<div class="disc">Affiliate disclosure: Links are Amazon affiliate links. We earn a small commission at no extra cost to you.</div>' +
    '</main>' +
    (amazonSection ? '<div style="max-width:860px;margin:0 auto;padding:0 24px 32px;">' + amazonSection + '</div>' : '') +
    '<footer class="ftr" style="margin-top:0;">© 2026 CheapestAlt</footer>' +
    '</body></html>';
}

function buildCmpHTML(d, rawSlug, imgA, imgB, amazonSection) {
  const A = d.productA, B = d.productB;
  if (!A || !B) return null;
  const title = A.name + " vs " + B.name + " - Which is Better in 2026?";
  const desc = "Compare " + A.name + " and " + B.name + ". Prices, pros, cons and verdict.";
  const tRows = (d.comparison || []).map(r =>
    '<tr><td style="font-weight:600;padding:10px 14px;border-bottom:1px solid #E2E8F0">' + esc(r.feature) + '</td>' +
    '<td style="padding:10px 14px;border-bottom:1px solid #E2E8F0;' + (r.winner==="a"?"color:#2563EB;font-weight:700":"") + '">' + esc(r.a) + '</td>' +
    '<td style="padding:10px 14px;border-bottom:1px solid #E2E8F0;' + (r.winner==="b"?"color:#2563EB;font-weight:700":"") + '">' + esc(r.b) + '</td></tr>'
  ).join("");

  return '<!DOCTYPE html><html lang="en"><head>' +
    '<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>' +
    '<title>' + esc(title) + ' | CheapestAlt</title>' +
    '<meta name="description" content="' + esc(desc) + '"/>' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet"/>' +
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,sans-serif;background:#fff;color:#0F172A}.hdr{background:#fff;border-bottom:1.5px solid #E2E8F0;padding:0 28px;height:58px;display:flex;align-items:center;justify-content:space-between}.logo{font-size:18px;font-weight:800;text-decoration:none;color:#0F172A}.logo em{color:#2563EB;font-style:normal}.nav a{background:#2563EB;color:#fff;padding:7px 16px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none}.wrap{max-width:860px;margin:0 auto;padding:44px 24px 80px}h1{font-size:26px;font-weight:800;margin-bottom:20px}.ftr{background:#F8FAFC;border-top:1.5px solid #E2E8F0;padding:24px;margin-top:40px;font-size:13px;color:#475569;text-align:center}</style>' +
    '</head><body>' +
    '<header class="hdr"><a href="/" class="logo">Cheapest<em>Alt</em></a><nav><a href="/">Find Alternatives</a></nav></header>' +
    '<main class="wrap">' +
    '<h1>' + esc(title) + '</h1>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:28px">' +
    '<div style="background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:12px;padding:20px">' + (imgA ? '<img src="' + imgA + '" alt="' + esc(A.name) + '" style="width:56px;height:56px;object-fit:contain;border-radius:8px;margin-bottom:10px;background:#fff;border:1px solid #E2E8F0;display:block;"/>' : '') + '<h3 style="font-size:15px;font-weight:700;margin-bottom:8px">' + esc(A.name) + '</h3><div style="font-size:22px;font-weight:800;color:#2563EB;margin-bottom:12px">$' + Number(A.price||0).toLocaleString() + '</div>' + (A.pros||[]).map(p=>'<div style="font-size:13px;color:#16A34A;padding:2px 0">✓ '+esc(p)+'</div>').join("") + (A.cons||[]).map(c=>'<div style="font-size:13px;color:#DC2626;padding:2px 0">✗ '+esc(c)+'</div>').join("") + '</div>' +
    '<div style="background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:12px;padding:20px">' + (imgB ? '<img src="' + imgB + '" alt="' + esc(B.name) + '" style="width:56px;height:56px;object-fit:contain;border-radius:8px;margin-bottom:10px;background:#fff;border:1px solid #E2E8F0;display:block;"/>' : '') + '<h3 style="font-size:15px;font-weight:700;margin-bottom:8px">' + esc(B.name) + '</h3><div style="font-size:22px;font-weight:800;color:#2563EB;margin-bottom:12px">$' + Number(B.price||0).toLocaleString() + '</div>' + (B.pros||[]).map(p=>'<div style="font-size:13px;color:#16A34A;padding:2px 0">✓ '+esc(p)+'</div>').join("") + (B.cons||[]).map(c=>'<div style="font-size:13px;color:#DC2626;padding:2px 0">✗ '+esc(c)+'</div>').join("") + '</div>' +
    '</div>' +
    '<div style="overflow-x:auto;margin-bottom:28px"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#F8FAFC"><th style="padding:10px 14px;text-align:left;font-size:12px;text-transform:uppercase;border-bottom:1.5px solid #E2E8F0">Feature</th><th style="padding:10px 14px;text-align:left;font-size:12px;text-transform:uppercase;border-bottom:1.5px solid #E2E8F0">' + esc(A.name) + '</th><th style="padding:10px 14px;text-align:left;font-size:12px;text-transform:uppercase;border-bottom:1.5px solid #E2E8F0">' + esc(B.name) + '</th></tr></thead><tbody>' + tRows + '</tbody></table></div>' +
    (d.verdict ? '<div style="background:#FFFBEB;border:1.5px solid #FDE68A;border-radius:10px;padding:16px;margin-bottom:28px;font-size:14px;line-height:1.7"><strong>Verdict: </strong>' + esc(d.verdict) + '</div>' : '') +
    '<div style="background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:10px;padding:12px 16px;font-size:12px;color:#475569">Affiliate disclosure: Links are Amazon affiliate links. We earn a small commission at no extra cost to you.</div>' +
    '</main>' +
    (amazonSection ? '<div style="max-width:860px;margin:0 auto;padding:0 24px 32px;">' + amazonSection + '</div>' : '') +
    '<footer class="ftr" style="margin-top:0;">© 2026 CheapestAlt</footer>' +
    '</body></html>';
}

async function dbSave(hasDB, row, isCompare) {
  if (!hasDB) return;
  const saveFn = isCompare ? db.saveCmp : db.saveAlt;
  const updFn  = isCompare ? db.updCmp  : db.updAlt;
  try {
    const r = await saveFn(row);
    if (r.error) {
      await updFn(row.slug, { html: row.html, last_generated: row.last_generated || new Date().toISOString() });
    }
  } catch(e) { console.error("DB save error:", e.message); }
}

function injectBefore(html, inject, marker) {
  if (!inject) return html;
  const idx = html.lastIndexOf(marker);
  if (idx === -1) {
    const bodyClose = html.lastIndexOf('</body>');
    if (bodyClose !== -1) return html.slice(0, bodyClose) + inject + html.slice(bodyClose);
    return html + inject;
  }
  return html.slice(0, idx) + inject + html.slice(idx);
}

module.exports = async function handler(req, res) {
  try {
    let amazonHtml = "";
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") return res.status(204).end();

    const rawSlug = ((req.query && req.query.slug) || "").trim().toLowerCase();
    if (!rawSlug) return res.status(400).send(errPage("No page specified."));

    const hasDB = !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return res.status(500).send(errPage("Server configuration error: missing API key."));

    // Memory cache — fast path, skips all external API calls
    const cached = mGet(rawSlug);
    if (cached && cached.includes('Top Picks on Amazon')) { res.setHeader("Content-Type", "text/html; charset=utf-8"); return res.status(200).send(cached); }

    // Cache miss — fetch fresh Amazon products for page build
    let realProducts = [];
    try {
      const kw = rawSlug.replace(/-alternatives$/, "").replace(/-vs-.*$/, "").replace(/-/g, " ").trim();
      if (kw) {
        realProducts = await fetchAmazonProducts(kw);
        if (realProducts && realProducts.length > 0) {
          amazonHtml = '<div style="max-width:860px;margin:32px auto;padding:0 24px;font-family:Inter,system-ui,sans-serif">'
            + '<h2 style="font-size:20px;font-weight:800;margin-bottom:16px;color:#0F172A;border-left:4px solid #2563EB;padding-left:12px;">Top Picks on Amazon</h2>'
            + buildProductCards(realProducts)
            + '</div>';
        }
      }
    } catch(e) { console.log("Amazon fetch skipped:", e.message); }

    if (hasDB) {
      const { data: rows } = await db.getAlt(rawSlug);
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (row && row.content && row.content.original) {
        const content = typeof row.content === "object" ? row.content : JSON.parse(row.content);
        const p2 = parseSlug(rawSlug);
        const angle2 = (p2 && p2.angle) || "general";
        const product2 = (p2 && p2.product) || rawSlug.replace(/-alternatives$/, "").replace(/-/g, " ");
        if (content.original && !content.original.image) content.original.image = asinImg(content.original.asin);
        if (Array.isArray(content.alternatives)) {
          content.alternatives = content.alternatives.map(a => a.image ? a : Object.assign({}, a, { image: asinImg(a.asin) }));
        }
        const freshHtml = buildAltHTML(content, product2, angle2, rawSlug, realProducts, amazonHtml);
        mSet(rawSlug, freshHtml);
        db.updAlt(rawSlug, { html: freshHtml, last_generated: new Date().toISOString() }).catch(() => {});
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(freshHtml);
      }
    }

    const parsed = parseSlug(rawSlug);
    if (!parsed) return res.status(404).send(errPage("Page not found."));

    if (hasDB && parsed.type === "compare") {
      const { data: rows } = await db.getCmp(rawSlug);
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (row && row.content && row.content.productA && row.content.productB) {
        const cContent = typeof row.content === "object" ? row.content : JSON.parse(row.content);
        const freshCmpHtml = buildCmpHTML(cContent, rawSlug, null, null, amazonHtml);
        if (freshCmpHtml) {
          mSet(rawSlug, freshCmpHtml);
          db.updCmp(rawSlug, { html: freshCmpHtml, last_generated: new Date().toISOString() }).catch(() => {});
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          return res.status(200).send(freshCmpHtml);
        }
      }
      if (row && row.html && !row.html.includes('href="/compare/')) {
        const injectedCmpHtml = injectBefore(row.html, amazonHtml, '<footer');
        mSet(rawSlug, injectedCmpHtml);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(injectedCmpHtml);
      }
    }

    const now = new Date().toISOString();
    let cr, cb, rawText, data, html;

    if (parsed.type === "search") {
      try { cr = await callClaude(apiKey, HAIKU, ALT_SYS, 'Find 4 cheaper alternatives for: "' + parsed.product + '". No apostrophes. Return JSON only.', 900); }
      catch(e) { return res.status(502).send(errPage("Could not reach AI. Please try again.")); }
      try { cb = JSON.parse(cr.raw); } catch { return res.status(502).send(errPage("Please try again.")); }
      if (cr.status !== 200) return res.status(502).send(errPage("AI error. Please try again."));
      rawText = cb && cb.content && cb.content[0] && cb.content[0].text;
      if (!rawText) return res.status(502).send(errPage("Empty AI response."));
      try { data = xJSON(rawText); } catch(e) { return res.status(502).send(errPage("Please try again.")); }
      if (!data || !data.original) return res.status(502).send(errPage("Please try again."));
      if (!Array.isArray(data.alternatives)) data.alternatives = [];
      html = buildAltHTML(data, parsed.product, parsed.angle, rawSlug, realProducts, amazonHtml);
      mSet(rawSlug, html);
      await dbSave(hasDB, { slug: rawSlug, type: "alternative", keyword: parsed.product, title: parsed.product + " Alternatives", html, content: data, created_at: now, last_generated: now }, false);
    }

    else if (parsed.type === "compare") {
      try { cr = await callClaude(apiKey, SONNET, CMP_SYS, 'Compare: "' + parsed.a + '" vs "' + parsed.b + '". Return JSON only.', 1400); }
      catch(e) { return res.status(502).send(errPage("Could not reach AI. Please try again.")); }
      try { cb = JSON.parse(cr.raw); } catch { return res.status(502).send(errPage("Please try again.")); }
      if (cr.status !== 200) return res.status(502).send(errPage("AI error. Please try again."));
      rawText = cb && cb.content && cb.content[0] && cb.content[0].text;
      if (!rawText) return res.status(502).send(errPage("Empty AI response."));
      try { data = xJSON(rawText); } catch(e) { return res.status(502).send(errPage("Please try again.")); }
      if (!data || !data.productA || !data.productB) return res.status(502).send(errPage("Please try again."));
      let cmpImgA = null, cmpImgB = null;
      try {
        const [rA, rB] = await Promise.all([
          fetchAmazonProducts(data.productA && data.productA.name || parsed.a),
          fetchAmazonProducts(data.productB && data.productB.name || parsed.b)
        ]);
        if (rA && rA[0]) cmpImgA = rA[0].image || null;
        if (rB && rB[0]) cmpImgB = rB[0].image || null;
      } catch(e) { console.log("Compare image fetch skipped:", e.message); }
      html = buildCmpHTML(data, rawSlug, cmpImgA, cmpImgB, amazonHtml);
      if (!html) return res.status(502).send(errPage("Please try again."));
      mSet(rawSlug, html);
      await dbSave(hasDB, { slug: rawSlug, type: "comparison", product_a: parsed.a, product_b: parsed.b, title: parsed.a + " vs " + parsed.b, html, content: data, created_at: now, last_generated: now }, true);
    }

    else { return res.status(400).send(errPage("Unknown page type.")); }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);

  } catch(e) {
    console.error("FIND CRASH:", e.message, e.stack);
    return res.status(500).send(errPage("Something went wrong: " + e.message));
  }
};
