"use strict";
// api/find.js
// GET /find?slug=airpods-pro-alternatives
// GET /find?slug=airpods-pro-vs-sony-wf1000xm5

const https = require("https");
const HAIKU  = "claude-haiku-4-5-20251001";
const SONNET = "claude-sonnet-4-5-20251022";
const TAG    = "cheapestalt-20";
const GA_ID  = "G-6MR7X29W2X";

// â”€â”€ Supabase â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function sbReq(method, path, body) {
  const base = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return Promise.resolve({ data: null, error: "no-config" });
  const host = base.replace(/^https?:\/\//, "");
  const pl   = body ? JSON.stringify(body) : null;
  return new Promise(resolve => {
    const h = { "apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json" };
    if (method === "POST")  h["Prefer"] = "resolution=merge-duplicates";
    if (method === "PATCH") h["Prefer"] = "return=minimal";
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

// pages table  â†’ alternative pages
// comparisons  â†’ comparison pages
const db = {
  getAlt:    s => sbReq("GET",   "pages?slug=eq."       + encodeURIComponent(s) + "&select=slug,html&limit=1", null),
  saveAlt:   r => sbReq("POST",  "pages",       r),
  updAlt:  (s,r)=>sbReq("PATCH", "pages?slug=eq."       + encodeURIComponent(s), r),
  getCmp:    s => sbReq("GET",   "comparisons?slug=eq."  + encodeURIComponent(s) + "&select=slug,html,content&limit=1", null),
  saveCmp:   r => sbReq("POST",  "comparisons?on_conflict=slug", r),
  updCmp:  (s,r)=>sbReq("PATCH", "comparisons?slug=eq." + encodeURIComponent(s), r),
};

// â”€â”€ Memory cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const mem = new Map();
function mGet(k) { const e = mem.get(k); if (!e || Date.now() - e.t > 86400000) { mem.delete(k); return null; } return e.v; }
function mSet(k, v) { if (mem.size > 500) mem.delete(mem.keys().next().value); mem.set(k, { v, t: Date.now() }); }

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function mkSlug(s) { return s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim(); }
function unslug(s) { return s.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
function esc(s)    { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function amz(n)    { return "https://www.amazon.com/s?k=" + encodeURIComponent(n) + "&tag=" + TAG; }

// â”€â”€ Slug parser â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function parseSlug(raw) {
  const s = raw.toLowerCase().trim();
  const vs    = s.match(/^(.+?)-vs-(.+)$/);
  if (vs)    return { type: "compare",  a: unslug(vs[1]),    b: unslug(vs[2]) };
  const best  = s.match(/^best-(.+)-alternatives$/);
  if (best)  return { type: "search",   angle: "best",    product: unslug(best[1]) };
  const cheap = s.match(/^cheap-(.+)-alternatives$/);
  if (cheap) return { type: "search",   angle: "cheap",   product: unslug(cheap[1]) };
  const alt   = s.match(/^(.+)-alternatives$/);
  if (alt)   return { type: "search",   angle: "general", product: unslug(alt[1]) };
  return null;
}

// â”€â”€ Claude â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ JSON extractor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function xJSON(text) {
  let s = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a !== -1 && b !== -1) s = s.slice(a, b + 1);
  s = s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  s = s.replace(/,(\s*[}\]])/g, "$1");
  let out = "", inStr = false, prev = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' && prev !== "\\") inStr = !inStr;
    if (inStr && c === "\n") { out += " "; prev = " "; continue; }
    if (inStr && c === "\r") { prev = ""; continue; }
    if (inStr && c === "\t") { out += " "; prev = " "; continue; }
    if (c.charCodeAt(0) < 32) { prev = " "; continue; }
    out += c; prev = c;
  }
  try { return JSON.parse(out); }
  catch { return JSON.parse(out.replace(/[\x00-\x1F\x7F]/g, " ")); }
}

// â”€â”€ PROMPTS â€” kept SIMPLE so Claude never truncates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Alternative: original + 4 alternatives. That is all. No pros/cons in JSON.
const ALT_SYS =
  'Return ONLY valid JSON. No markdown. No apostrophes. ' +
  'Exact schema: {"original":{"name":"str","price":99,"icon":"emoji"},' +
  '"alternatives":[' +
    '{"name":"str","price":49,"icon":"emoji","save":"Save 50%","reason":"one short sentence"},' +
    '{"name":"str","price":39,"icon":"emoji","save":"Save 60%","reason":"one short sentence"},' +
    '{"name":"str","price":29,"icon":"emoji","save":"Save 70%","reason":"one short sentence"},' +
    '{"name":"str","price":19,"icon":"emoji","save":"Save 80%","reason":"one short sentence"}' +
  ']}. Rules: real Amazon products, USD prices, 4 alternatives cheaper than original, no apostrophes.';

// Compare: full schema but concise strings
const CMP_SYS =
  'Return ONLY valid JSON. No markdown. No apostrophes. ' +
  'Schema: {"productA":{"name":"str","price":0,"icon":"emoji","pros":["str","str","str"],"cons":["str","str"]},' +
  '"productB":{"name":"str","price":0,"icon":"emoji","pros":["str","str","str"],"cons":["str","str"]},' +
  '"comparison":[{"feature":"str","a":"str","b":"str","winner":"a"},' +
               '{"feature":"str","a":"str","b":"str","winner":"b"},' +
               '{"feature":"str","a":"str","b":"str","winner":"a"},' +
               '{"feature":"str","a":"str","b":"str","winner":"tie"},' +
               '{"feature":"str","a":"str","b":"str","winner":"b"},' +
               '{"feature":"str","a":"str","b":"str","winner":"a"}],' +
  '"intro":"str","verdict":"str","winner":"str","winnerReason":"str",' +
  '"faqs":[{"q":"str","a":"str"},{"q":"str","a":"str"},{"q":"str","a":"str"}]}. ' +
  'Rules: 6 comparison rows shown above as example, winner = a or b or tie only, 3 pros 2 cons each, no apostrophes.';

// â”€â”€ CSS + layout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const FAV = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%232563EB'/%3E%3Ctext x='16' y='22' font-family='Inter' font-size='13' font-weight='800' fill='white' text-anchor='middle'%3ECA%3C/text%3E%3C/svg%3E";

const CSS = `*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,system-ui,sans-serif;color:#0F172A;background:#fff;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;min-height:100vh}
main{flex:1}.wrap{max-width:880px;margin:0 auto;padding:44px 24px 80px}
.hdr{background:#fff;border-bottom:1.5px solid #E2E8F0;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 28px;height:58px;position:sticky;top:0;z-index:200}
.logo{font-size:18px;font-weight:800;color:#0F172A;text-decoration:none;letter-spacing:-0.4px;justify-self:start}.logo em{color:#2563EB;font-style:normal}
.nav{display:flex;gap:6px;justify-self:center}
.nav a{background:#2563EB;padding:7px 16px;border-radius:8px;font-size:13.5px;font-weight:600;color:#fff;text-decoration:none;white-space:nowrap}
.nav a:hover{background:#1D4ED8}
.tag{font-size:12px;color:#0F172A;border:1.5px solid #E2E8F0;border-radius:20px;padding:4px 12px;font-weight:500;background:#F8FAFC;justify-self:end;white-space:nowrap}
h1{font-size:28px;font-weight:800;letter-spacing:-0.6px;line-height:1.2;margin-bottom:12px}
h2{font-size:18px;font-weight:700;margin:28px 0 14px}
.lead{font-size:15px;color:#475569;margin-bottom:28px;line-height:1.7}
.badge{display:inline-block;background:#EFF6FF;color:#2563EB;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;border:1px solid #BFDBFE;margin-bottom:16px}
.sec{border:1.5px solid #E2E8F0;border-radius:12px;margin-bottom:12px;overflow:hidden}
.sec-h{background:#F8FAFC;padding:12px 18px;font-size:14px;font-weight:700;cursor:pointer;display:flex;justify-content:space-between;align-items:center;user-select:none}
.sec-h:hover{background:#F1F5F9}
.sec-b{display:none;padding:16px 18px;border-top:1px solid #E2E8F0}
.sec.open .sec-b{display:block}
.sec-ico{font-size:11px;transition:transform .2s;flex-shrink:0}
.sec.open .sec-ico{transform:rotate(180deg)}
.orig-card{background:#fff;border:2px solid #BFDBFE;border-radius:14px;padding:20px 24px;margin-bottom:28px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.orig-ico{font-size:44px;flex-shrink:0}
.orig-lbl{font-size:11px;font-weight:700;color:#2563EB;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
.orig-name{font-size:17px;font-weight:700;margin-bottom:6px}
.orig-price{font-size:24px;font-weight:800;margin-bottom:10px}
.alt-card{border:1.5px solid #E2E8F0;border-radius:12px;padding:18px 20px;margin-bottom:12px;background:#fff}
.alt-inner{display:flex;gap:14px;align-items:flex-start}
.alt-ico{font-size:34px;flex-shrink:0;width:44px;text-align:center;margin-top:2px}
.alt-bdg{display:inline-block;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:6px}
.alt-name{font-size:15px;font-weight:700;margin-bottom:4px}
.alt-save{font-size:20px;font-weight:800;margin-bottom:6px}
.alt-reason{font-size:13px;color:#475569;line-height:1.6;margin-bottom:10px}
.cmp-tbl{width:100%;border-collapse:collapse;font-size:13.5px}
.cmp-tbl th{background:#F8FAFC;padding:10px 14px;text-align:left;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;border-bottom:1.5px solid #E2E8F0}
.cmp-tbl td{padding:10px 14px;border-bottom:1px solid #E2E8F0}
.cmp-tbl .feat{font-weight:600}.cmp-tbl .win{color:#2563EB;font-weight:700}
.cmp-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.cmp-col{background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:10px;padding:16px}
.cmp-col h3{font-size:14px;font-weight:700;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #E2E8F0}
.cmp-price{font-size:20px;font-weight:800;color:#2563EB;margin-bottom:12px}
.pc{display:flex;gap:6px;font-size:13px;padding:3px 0;align-items:flex-start}
.pc-dot{width:16px;height:16px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;margin-top:2px}
.verdict{background:#FFFBEB;border:1.5px solid #FDE68A;border-radius:10px;padding:14px 18px;font-size:14px;line-height:1.75;color:#78350F}
.faq-q{font-size:14px;font-weight:700;margin-bottom:5px}
.faq-a{font-size:13px;color:#475569;line-height:1.6;margin-bottom:16px}
.btn-az{display:inline-block;background:#FF9900;color:#0F172A;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;margin-top:10px}
.btn-az:hover{background:#E88A00}
.rel{display:flex;gap:8px;flex-wrap:wrap}
.rel a{background:#F8FAFC;border:1.5px solid #E2E8F0;padding:7px 14px;border-radius:20px;font-size:13px;font-weight:600;color:#0F172A;text-decoration:none}
.rel a:hover{border-color:#2563EB;color:#2563EB}
.disc{background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:10px;padding:12px 16px;font-size:12px;color:#475569;margin-top:24px}
.ftr{background:#F8FAFC;border-top:1.5px solid #E2E8F0;padding:24px 28px}
.ftr-in{max-width:880px;margin:0 auto;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:13px;color:#0F172A;align-items:center}
.ftr-in a{color:#0F172A;text-decoration:none;font-weight:500}.ftr-in a:hover{color:#2563EB}
.ftr-links{display:flex;gap:16px;flex-wrap:wrap}
@media(max-width:640px){.hdr{display:flex;flex-direction:column;height:auto;padding:12px 16px;gap:10px;align-items:center;text-align:center}.logo{justify-self:unset}.tag{display:none}.nav{justify-content:center;flex-wrap:wrap;gap:6px;width:100%}.nav a{font-size:12px;padding:6px 10px;white-space:nowrap}.cmp-cols{grid-template-columns:1fr}.wrap{padding:28px 16px 60px}h1{font-size:22px}}`;

const HDR =
  '<header class="hdr"><a href="/" class="logo">Cheapest<em>Alt</em></a>' +
  '<nav class="nav"><a href="/">Find Alternatives</a><a href="https://cheapestalt.com/compare">Compare Products</a></nav>' +
  '<div class="tag">Free &middot; No signup needed</div></header>';

const FTR =
  '<footer class="ftr"><div class="ftr-in"><span>&copy; 2026 CheapestAlt. All rights reserved.</span>' +
  '<div class="ftr-links"><a href="/">Home</a><a href="/#about">About</a>' +
  '<a href="/#how-it-works">How it works</a><a href="/#disclosure">Affiliate Disclosure</a>' +
  '<a href="mailto:Support@cheapestalt.com">Contact</a></div></div></footer>';

function shell(title, desc, slug, body) {
  return '<!DOCTYPE html><html lang="en"><head>\n' +
    '<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>\n' +
    '<title>' + esc(title) + ' | CheapestAlt</title>\n' +
    '<meta name="description" content="' + esc(desc) + '"/>\n' +
    '<meta property="og:title" content="' + esc(title) + '"/>\n' +
    '<meta property="og:description" content="' + esc(desc) + '"/>\n' +
    '<link rel="canonical" href="https://www.cheapestalt.com/find?slug=' + esc(slug) + '"/>\n' +
    '<link rel="icon" type="image/svg+xml" href="' + FAV + '"/>\n' +
    '<meta name="theme-color" content="#2563EB"/>\n' +
    '<script async src="https://www.googletagmanager.com/gtag/js?id=' + GA_ID + '"></script>\n' +
    '<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","' + GA_ID + '");</script>\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"/>\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>\n' +
    '<style>' + CSS + '</style></head><body>\n' +
    HDR + '\n<main class="wrap">' + body + '</main>\n' + FTR + '\n' +
    '<script>function tog(el){el.classList.toggle("open")}</script>\n' +
    '</body></html>';
}

function sec(title, content, open) {
  return '<div class="sec' + (open ? ' open' : '') + '" onclick="tog(this)">' +
    '<div class="sec-h">' + esc(title) + '<span class="sec-ico">&#9662;</span></div>' +
    '<div class="sec-b">' + content + '</div></div>';
}

function btnAz(name) {
  return '<a href="' + amz(name) + '" target="_blank" rel="noopener" class="btn-az">View deal on Amazon &#8594;</a>';
}

function pcItem(text, type) {
  return '<div class="pc"><span class="pc-dot" style="background:' +
    (type === "pro" ? "#F0FDF4;color:#16A34A" : "#FEF2F2;color:#DC2626") + '">' +
    (type === "pro" ? "&#10003;" : "&#10007;") + '</span>' + esc(text) + '</div>';
}

// â”€â”€ BUILD ALTERNATIVE PAGE â€” same structure as search.js renderHTML (v23) â”€â”€â”€â”€â”€â”€â”€â”€
function buildAltHTML(d, product, angle, rawSlug) {
  const o   = d.original || {};
  const alt = d.alternatives || [];
  const pSlug = mkSlug(o.name || product);

  const labelMap = { best: "Best", cheap: "Cheapest", general: "Top" };
  const lbl   = labelMap[angle] || "Top";
  const title = lbl + " Alternatives to " + (o.name || product) + " â€” Save Money in 2026";
  const desc  = "Find the best cheaper alternatives to " + (o.name || product) + " on Amazon. Compare prices and value.";
  const fav   = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%232563EB'/%3E%3Ctext x='16' y='22' font-family='Inter' font-size='13' font-weight='800' fill='white' text-anchor='middle'%3ECA%3C/text%3E%3C/svg%3E";

  const types   = ["Cheap Option","Best Deal","Best Value","Our Recommendation"];
  const colors  = ["#16A34A","#C2410C","#7C3AED","#2563EB"];
  const bgcols  = ["#F0FDF4","#FFF7ED","#F5F3FF","#EFF6FF"];
  const brdcols = ["#BBF7D0","#FED7AA","#DDD6FE","#BFDBFE"];

  const altCards = alt.map((a, i) => {
    const t = types[Math.min(i,3)], col = colors[Math.min(i,3)];
    const bg = bgcols[Math.min(i,3)], brd = brdcols[Math.min(i,3)];
    const pct = a.save || ("Save " + Math.round(Math.max(0,(1-(a.price||0)/(o.price||1))*100)) + "%");
    return '<div style="background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:14px;padding:18px 20px;margin-bottom:12px">' +
      '<span style="background:' + bg + ';color:' + col + ';border:1px solid ' + brd + ';font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px">' + t + '</span>' +
      '<div style="font-size:15px;font-weight:700;margin:8px 0 4px">' + esc(a.name) + '</div>' +
      '<div style="font-size:18px;font-weight:800;color:' + col + '">' + pct + '</div>' +
      (a.reason ? '<div style="font-size:13px;color:#475569;margin:6px 0 10px">' + esc(a.reason) + '</div>' : '') +
      '<a href="' + amz(a.name) + '" target="_blank" rel="noopener" style="display:inline-block;background:#FF9900;color:#0F172A;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">View deal on Amazon &#8594;</a>' +
      '</div>';
  }).join("");

  const html = '<!DOCTYPE html><html lang="en"><head>\n' +
    '<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>\n' +
    '<title>' + esc(title) + ' | CheapestAlt</title>\n' +
    '<meta name="description" content="' + esc(desc) + '"/>\n' +
    '<meta property="og:title" content="' + esc(title) + '"/>\n' +
    '<meta property="og:description" content="' + esc(desc) + '"/>\n' +
    '<link rel="canonical" href="https://www.cheapestalt.com/find?slug=' + esc(rawSlug) + '"/>\n' +
    '<link rel="icon" type="image/svg+xml" href="' + fav + '"/>\n' +
    '<meta name="theme-color" content="#2563EB"/>\n' +
    '<script async src="https://www.googletagmanager.com/gtag/js?id=' + GA_ID + '"></script>\n' +
    '<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag(\"js\",new Date());gtag(\"config\",\"' + GA_ID + '\");</script>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>\n' +
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,system-ui,sans-serif;color:#0F172A;background:#fff;-webkit-font-smoothing:antialiased}' +
    '.hdr{background:#fff;border-bottom:1.5px solid #E2E8F0;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 28px;height:58px;position:sticky;top:0;z-index:200}' +
    '.logo{font-size:18px;font-weight:800;color:#0F172A;text-decoration:none;letter-spacing:-0.4px}.logo em{color:#2563EB;font-style:normal}' +
    '.nav{display:flex;gap:6px;justify-self:center}.nav a{background:#2563EB;border:1.5px solid #2563EB;padding:7px 16px;border-radius:8px;font-size:13.5px;font-weight:600;color:#fff;text-decoration:none;white-space:nowrap}.nav a:hover{background:#1D4ED8}' +
    '.tag{font-size:12px;color:#0F172A;border:1.5px solid #E2E8F0;border-radius:20px;padding:4px 12px;font-weight:500;background:#F8FAFC;justify-self:end;white-space:nowrap}' +
    '.wrap{max-width:860px;margin:0 auto;padding:44px 24px 80px}' +
    'h1{font-size:30px;font-weight:800;letter-spacing:-0.6px;line-height:1.2;margin-bottom:12px}' +
    '.lead{font-size:15px;color:#475569;margin-bottom:32px;line-height:1.7}' +
    '.orig{background:#fff;border:2px solid #BFDBFE;border-radius:14px;padding:20px 24px;margin-bottom:28px;display:flex;gap:20px;align-items:center}' +
    '.orig-icon{font-size:44px}.orig-info{flex:1}' +
    '.orig-label{font-size:11px;font-weight:700;color:#2563EB;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}' +
    '.orig-name{font-size:17px;font-weight:700;margin-bottom:6px}' +
    '.orig-price{font-size:26px;font-weight:800;margin-bottom:8px}' +
    '.btn-az{display:inline-block;background:#FF9900;color:#0F172A;padding:11px 22px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none}.btn-az:hover{background:#E88A00}' +
    '.alts-label{font-size:12px;font-weight:700;color:#0F172A;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:14px;padding-bottom:10px;border-bottom:1.5px solid #E2E8F0}' +
    '.disc{background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:10px;padding:12px 16px;font-size:12px;color:#475569;margin-top:24px}' +
    '.ftr{background:#F8FAFC;border-top:1.5px solid #E2E8F0;padding:24px 28px;margin-top:40px}' +
    '.ftr-in{max-width:860px;margin:0 auto;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:13px;color:#0F172A;align-items:center}' +
    '.ftr-in a{color:#0F172A;text-decoration:none;font-weight:500}.ftr-in a:hover{color:#2563EB}' +
    '@media(max-width:640px){.hdr{display:flex;flex-direction:column;height:auto;padding:10px 16px;gap:8px;align-items:center}.tag{display:none}.nav{justify-content:center}.nav a{font-size:12px;padding:6px 12px}.orig{flex-direction:column}.wrap{padding:28px 16px 60px}h1{font-size:22px}}' +
    '</style></head><body>\n' +
    '<header class="hdr"><a href="/" class="logo">Cheapest<em>Alt</em></a>' +
    '<nav class="nav"><a href="/">Find Alternatives</a><a href="https://cheapestalt.com/compare">Compare</a></nav>' +
    '<div class="tag">Free &middot; No signup needed</div></header>\n' +
    '<main class="wrap">' +
    '<h1>' + esc(title) + '</h1>' +
    '<p class="lead">Compare the best cheaper alternatives to ' + esc(o.name||product) + ' on Amazon &mdash; with real value analysis and direct deal links.</p>' +
    '<div class="orig"><div class="orig-icon">' + esc(o.icon||"ðŸ“¦") + '</div>' +
    '<div class="orig-info"><div class="orig-label">Original product</div>' +
    '<div class="orig-name">' + esc(o.name||product) + '</div>' +
    '<div class="orig-price">$' + Number(o.price||0).toLocaleString() + '</div>' +
    '<a href="' + amz(o.name||product) + '" target="_blank" rel="noopener" class="btn-az">Check price on Amazon &#8594;</a>' +
    '</div></div>' +
    '<div class="alts-label">Cheaper alternatives &mdash; click to check price on Amazon</div>' +
    altCards +
    '<div style="margin-top:28px;display:flex;gap:10px;flex-wrap:wrap">' +
    '<a href="/find?slug=best-' + pSlug + '-alternatives" style="background:#F8FAFC;border:1.5px solid #E2E8F0;padding:8px 16px;border-radius:20px;font-size:13px;font-weight:600;color:#0F172A;text-decoration:none">Best ' + esc(o.name||product) + ' alternatives</a>' +
    '<a href="/find?slug=cheap-' + pSlug + '-alternatives" style="background:#F8FAFC;border:1.5px solid #E2E8F0;padding:8px 16px;border-radius:20px;font-size:13px;font-weight:600;color:#0F172A;text-decoration:none">Cheapest ' + esc(o.name||product) + ' alternatives</a>' +
    '</div>' +
    '<div class="disc"><strong>Affiliate disclosure:</strong> Links are Amazon affiliate links (tag: ' + TAG + '). We earn a small commission at no extra cost to you.</div>' +
    '</main>\n' +
    '<footer class="ftr"><div class="ftr-in">' +
    '<span>&copy; 2026 CheapestAlt</span>' +
    '<div style="display:flex;gap:16px;flex-wrap:wrap"><a href="/">Home</a><a href="/#about">About</a><a href="mailto:Support@cheapestalt.com">Contact</a></div>' +
    '</div></footer>\n</body></html>';

  return html;
}

// â”€â”€ BUILD COMPARE PAGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildCmpHTML(d, rawSlug) {
  const A = d.productA, B = d.productB;
  if (!A || !B) return null;
  const title = A.name + " vs " + B.name + " â€” Which is Better Value in 2026?";
  const desc  = "Side-by-side comparison of " + A.name + " and " + B.name + ". Price, features, pros, cons and verdict.";

  const tRows = (d.comparison || []).map(r =>
    '<tr><td class="feat">' + esc(r.feature) + '</td>' +
    '<td class="' + (r.winner === "a" ? "win" : "") + '">' + esc(r.a) + '</td>' +
    '<td class="' + (r.winner === "b" ? "win" : "") + '">' + esc(r.b) + '</td></tr>'
  ).join("");

  const mkList = (items, type) => (items || []).map(x => pcItem(x, type)).join("");

  const sA = mkSlug(A.name), sB = mkSlug(B.name);
  const faqHtml = (d.faqs || []).map(f =>
    '<div style="padding:12px 0;border-bottom:1px solid #F1F5F9">' +
    '<div class="faq-q">' + esc(f.q) + '</div>' +
    '<div class="faq-a">' + esc(f.a) + '</div></div>'
  ).join("");

  const body =
    '<div class="badge">Product comparison</div>' +
    '<h1>' + esc(title) + '</h1>' +
    (d.intro ? '<p class="lead">' + esc(d.intro) + '</p>' : '') +
    sec("1 â€” Feature comparison",
      '<div style="overflow-x:auto"><table class="cmp-tbl"><thead><tr><th>Feature</th><th>' + esc(A.name) + '</th><th>' + esc(B.name) + '</th></tr></thead><tbody>' + tRows + '</tbody></table></div>',
      true) +
    sec("2 â€” Pros & Cons",
      '<div class="cmp-cols">' +
      '<div class="cmp-col"><h3>' + esc(A.name) + '</h3>' +
        '<div class="cmp-price">$' + Number(A.price || 0).toLocaleString() + '</div>' +
        mkList(A.pros, "pro") + mkList(A.cons, "con") + btnAz(A.name) + '</div>' +
      '<div class="cmp-col"><h3>' + esc(B.name) + '</h3>' +
        '<div class="cmp-price">$' + Number(B.price || 0).toLocaleString() + '</div>' +
        mkList(B.pros, "pro") + mkList(B.cons, "con") + btnAz(B.name) + '</div>' +
      '</div>', true) +
    (d.verdict ? sec("3 â€” Verdict & Recommendation",
      '<div class="verdict"><strong>Verdict: </strong>' + esc(d.verdict) +
      (d.winnerReason ? '<br><br><strong>Winner: ' + esc(d.winner || "") + '</strong> &mdash; ' + esc(d.winnerReason) : '') +
      '</div>') : '') +
    (faqHtml ? sec("4 â€” Frequently asked questions", faqHtml) : '') +
    sec("5 â€” Related pages",
      '<div class="rel">' +
      '<a href="/find?slug=' + sA + '-alternatives">Alternatives to ' + esc(A.name) + '</a>' +
      '<a href="/find?slug=' + sB + '-alternatives">Alternatives to ' + esc(B.name) + '</a>' +
      '<a href="/">Search more &#8594;</a></div>') +
    '<div class="disc"><strong>Affiliate disclosure:</strong> Links are Amazon affiliate links (tag: ' + TAG + '). We earn a small commission at no extra cost to you.</div>';

  return shell(title, desc, rawSlug, body);
}

// â”€â”€ Supabase save (non-blocking) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function dbSave(hasDB, row, isCompare) {
  if (!hasDB) return;
  const saveFn = isCompare ? db.saveCmp : db.saveAlt;
  const updFn  = isCompare ? db.updCmp  : db.updAlt;
  try {
    const r = await saveFn(row);
    if (r.error) {
      console.error("DB INSERT err:", JSON.stringify(r.error).slice(0, 200));
      const u = await updFn(row.slug, { content: row.content, html: row.html, last_generated: row.last_generated || new Date().toISOString() });
      if (u.error) console.error("DB UPD err:", JSON.stringify(u.error).slice(0, 100));
      else console.log("DB UPDATED:", isCompare ? "[cmp]" : "[alt]", row.slug);
    } else {
      console.log("DB SAVED:", isCompare ? "[cmp]" : "[alt]", row.slug);
    }
  } catch(e) { console.error("DB catch:", e.message); }
}

// â”€â”€ Background: auto-generate + save all 3 alt URL variants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function bgAllVariants(apiKey, product, hasDB) {
  const pSlug    = mkSlug(product);
  const variants = [
    { slug: pSlug + "-alternatives",        angle: "general" },
    { slug: "best-" + pSlug + "-alternatives",  angle: "best"    },
    { slug: "cheap-" + pSlug + "-alternatives", angle: "cheap"   },
  ];
  variants.forEach(v => {
    if (mGet(v.slug)) return; // already in memory, skip
    callClaude(apiKey, HAIKU, ALT_SYS,
      'Find 4 cheaper alternatives for: "' + product + '". No apostrophes. Return JSON only.', 900)
    .then(cr => {
      if (cr.status !== 200) return;
      let cb; try { cb = JSON.parse(cr.raw); } catch { return; }
      const txt = cb && cb.content && cb.content[0] && cb.content[0].text;
      if (!txt) return;
      let data; try { data = xJSON(txt); } catch { return; }
      if (!data || !data.original || !data.original.name) return;
      const html = buildAltHTML(data, product, v.angle, v.slug);
      mSet(v.slug, html);
      const now = new Date().toISOString();
      dbSave(hasDB, { slug: v.slug, type: "alternative", keyword: product,
        title: product + " â€” " + (v.angle === "best" ? "Best" : v.angle === "cheap" ? "Cheapest" : "Top") + " Alternatives",
        content: data, html, created_at: now, last_generated: now }, false);
    }).catch(() => {});
  });
}

// â”€â”€ Error page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function errPage(msg) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Error | CheapestAlt</title>' +
    '<link rel="icon" type="image/svg+xml" href="' + FAV + '"/>' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet"/>' +
    '<style>' + CSS + '</style></head><body>' + HDR +
    '<main><div style="text-align:center;padding:80px 24px"><div style="font-size:40px;margin-bottom:16px">âš ï¸</div>' +
    '<h1 style="font-size:22px;margin-bottom:10px">Unable to load page</h1>' +
    '<p style="color:#475569;margin-bottom:20px">' + esc(msg) + '</p>' +
    '<a href="/" style="display:inline-block;background:#2563EB;color:#fff;padding:11px 24px;border-radius:8px;text-decoration:none;font-weight:600">Go back home</a>' +
    '</div></main>' + FTR + '</body></html>';
}

// â”€â”€ MAIN HANDLER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
module.exports = async function handler(req, res) {
  res.setHeader(“Access-Control-Allow-Origin”, “*”);
  if (req.method === “OPTIONS”) return res.status(204).end();

  const rawSlug = ((req.query && req.query.slug) || “”).trim().toLowerCase();
  if (!rawSlug) return res.status(400).send(errPage(“No page specified.”));

  const hasDB = !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
  console.log("DEBUG hasDB:", hasDB, "CLAUDE_API_KEY exists:", !!process.env.CLAUDE_API_KEY, "SUPABASE_URL:", process.env.SUPABASE_URL ? "set" : "missing");

  // 1. Memory cache (instant)
  const cached = mGet(rawSlug);
  if (cached) {
    res.setHeader(“Content-Type”, “text/html; charset=utf-8”);
    return res.status(200).send(cached);
  }

  // 2. Supabase pages table — serves any stored page including custom product pages
  if (hasDB) {
    const { data: rows, error: dbErr } = await db.getAlt(rawSlug);
    if (dbErr) console.error(“DB GET err:”, JSON.stringify(dbErr).slice(0, 150));
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row && row.html) {
      mSet(rawSlug, row.html);
      res.setHeader(“Content-Type”, “text/html; charset=utf-8”);
      return res.status(200).send(row.html);
    }
  }

  // 3. Parse slug — only needed for dynamic Claude generation
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return res.status(500).send(errPage(“Server configuration error.”));

  const parsed = parseSlug(rawSlug);
  if (!parsed) return res.status(404).send(errPage(“Page not found. Try searching on the home page.”));

  // 4. For compare pages: check comparisons table + slug variants
  if (hasDB && parsed.type === “compare”) {
    const { data: rows, error: dbErr } = await db.getCmp(rawSlug);
    if (dbErr) console.error(“DB GET err:”, JSON.stringify(dbErr).slice(0, 150));
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row && row.html) {
      mSet(rawSlug, row.html);
      res.setHeader(“Content-Type”, “text/html; charset=utf-8”);
      return res.status(200).send(row.html);
    }

    // Try slug variants that compare.js may have saved
    const slugs = [mkSlug(parsed.a), mkSlug(parsed.b)].sort();
    const sortedSlug = slugs[0] + “-vs-” + slugs[1];
    const reversedSlug = mkSlug(parsed.b) + “-vs-” + mkSlug(parsed.a);
    const toTry = [...new Set([sortedSlug, reversedSlug])].filter(s => s !== rawSlug);
    for (const altSlug of toTry) {
      const { data: rows2 } = await db.getCmp(altSlug);
      const row2 = Array.isArray(rows2) ? rows2[0] : rows2;
      if (row2 && row2.html) {
        mSet(rawSlug, row2.html);
        await db.saveCmp({ slug: rawSlug, type: “comparison”,
          product_a: parsed.a, product_b: parsed.b,
          title: parsed.a + “ vs “ + parsed.b,
          content: row2.content || {}, html: row2.html,
          created_at: new Date().toISOString(), last_generated: new Date().toISOString() });
        res.setHeader(“Content-Type”, “text/html; charset=utf-8”);
        return res.status(200).send(row2.html);
      }
    }
  }

  // 5. Generate with Claude
  const now = new Date().toISOString();
  let cr, cb, rawText, data, html;

  // â”€â”€ ALTERNATIVE PAGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (parsed.type === "search") {
    try {
      cr = await callClaude(apiKey, HAIKU, ALT_SYS,
        'Find 4 cheaper alternatives for: "' + parsed.product + '". No apostrophes. Return JSON only.', 900);
    } catch (e) {
      return res.status(502).send(errPage("Could not reach AI. Please try again in a few seconds."));
    }

    try { cb = JSON.parse(cr.raw); }
    catch { return res.status(502).send(errPage("Please try again.")); }

    if (cr.status !== 200) {
      console.error("Claude err:", cr.status, cr.raw.slice(0, 300));
      return res.status(502).send(errPage("AI service unavailable. Please try again."));
    }

    rawText = cb && cb.content && cb.content[0] && cb.content[0].text;
    if (!rawText) return res.status(502).send(errPage("Empty AI response. Please try again."));

    try { data = xJSON(rawText); }
    catch (e) {
      console.error("ALT JSON err:", e.message, "\n", rawText.slice(0, 400));
      return res.status(502).send(errPage("Please try again in a few seconds."));
    }

    if (!data || !data.original || !data.original.name) {
      console.error("ALT bad shape:", JSON.stringify(data || {}).slice(0, 200));
      return res.status(502).send(errPage("Please try again with a different product name."));
    }
    if (!Array.isArray(data.alternatives)) data.alternatives = [];

    html = buildAltHTML(data, parsed.product, parsed.angle, rawSlug);
    mSet(rawSlug, html);

    await dbSave(hasDB, {
      slug: rawSlug, type: "alternative", keyword: parsed.product,
      title: parsed.product + " â€” Cheaper Alternatives on Amazon",
      content: data, html, created_at: now, last_generated: now
    }, false);

    // Auto-generate all 3 URL variants in background
    setTimeout(() => bgAllVariants(apiKey, parsed.product, hasDB), 300);
  }

  // â”€â”€ COMPARE PAGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  else if (parsed.type === "compare") {
    try {
      cr = await callClaude(apiKey, SONNET, CMP_SYS,
        'Compare: Product A is "' + parsed.a + '" and Product B is "' + parsed.b + '". 6 comparison rows, 3 FAQs, no apostrophes. Return JSON only.', 1400);
    } catch (e) {
      return res.status(502).send(errPage("Could not reach AI. Please try again."));
    }

    try { cb = JSON.parse(cr.raw); }
    catch { return res.status(502).send(errPage("Please try again.")); }

    if (cr.status !== 200) {
      console.error("Claude err:", cr.status, cr.raw.slice(0, 300));
      return res.status(502).send(errPage("AI service unavailable. Please try again."));
    }

    rawText = cb && cb.content && cb.content[0] && cb.content[0].text;
    if (!rawText) return res.status(502).send(errPage("Empty AI response. Please try again."));

    try { data = xJSON(rawText); }
    catch (e) {
      console.error("CMP JSON err:", e.message, "\n", rawText.slice(0, 400));
      return res.status(502).send(errPage("Please try again in a few seconds."));
    }

    if (!data || !data.productA || !data.productB) {
      console.error("CMP bad shape:", JSON.stringify(data || {}).slice(0, 200));
      return res.status(502).send(errPage("Please try again."));
    }

    // Normalise winner field
    data.comparison = (data.comparison || []).map(r => {
      const w = String(r.winner || "tie").toLowerCase().trim();
      return { feature: r.feature, a: r.a, b: r.b, winner: (w === "a" || w === "b") ? w : "tie" };
    });

    html = buildCmpHTML(data, rawSlug);
    if (!html) return res.status(502).send(errPage("Please try again."));
    mSet(rawSlug, html);

    await dbSave(hasDB, {
      slug: rawSlug, type: "comparison", product_a: parsed.a, product_b: parsed.b,
      title: parsed.a + " vs " + parsed.b,
      content: data, html, created_at: now, last_generated: now
    }, true);
  }

  else {
    return res.status(400).send(errPage("Page type not recognised."));
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
};
