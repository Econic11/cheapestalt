// api/compare.js
// Model: claude-sonnet-4-5
// Storage: Supabase permanent lifetime + in-memory cache

"use strict";
const https = require("https");
let amz; try { amz = require("./_amazon"); } catch(e) { amz = null; }
const MODEL = "claude-haiku-4-5-20251001";
const TAG   = "cheapestalt-20";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

// -- Supabase client ------------------------------------------------------------
function sbReq(method, path, body, authKey) {
  const base = process.env.SUPABASE_URL;
  const key  = authKey || process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return Promise.resolve({ data: null, error: "no-config" });
  const host    = base.replace(/^https?:\/\//, "");
  const payload = body ? JSON.stringify(body) : null;
  return new Promise(res => {
    const hdrs = { "apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json" };
    if (method === "POST")  hdrs["Prefer"] = "return=minimal,resolution=merge-duplicates";
    if (method === "PATCH") hdrs["Prefer"] = "return=minimal";
    if (payload) hdrs["Content-Length"] = Buffer.byteLength(payload);
    const req = https.request({ hostname: host, path: "/rest/v1/" + path, method, headers: hdrs }, r => {
      let d = ""; r.on("data", c => d += c);
      r.on("end", () => {
        let p = null; try { p = JSON.parse(d); } catch {}
        res(r.statusCode >= 400 ? { data: null, error: p || d.slice(0, 200) } : { data: p, error: null });
      });
    });
    req.on("error", e => res({ data: null, error: e.message }));
    req.setTimeout(8000, () => { req.destroy(); res({ data: null, error: "timeout" }); });
    if (payload) req.write(payload);
    req.end();
  });
}

const db = {
  get:    slug      => sbReq("GET",   "comparisons?slug=eq." + encodeURIComponent(slug) + "&select=*&limit=1", null),
  insert: row       => sbReq("POST",  "comparisons?on_conflict=slug", row, SUPABASE_SERVICE_KEY),
  update: (slug, r) => sbReq("PATCH", "comparisons?slug=eq." + encodeURIComponent(slug), r, SUPABASE_SERVICE_KEY),
};

// -- Memory cache ----------------------------------------------------------------
const mem = new Map();
const MEM_TTL = 1000 * 60 * 60 * 6;
function mGet(k) { const e = mem.get(k); if (!e || Date.now() - e.t > MEM_TTL) { mem.delete(k); return null; } return e.v; }
function mSet(k, v) { if (mem.size > 300) mem.delete(mem.keys().next().value); mem.set(k, { v, t: Date.now() }); }

// -- Helpers ---------------------------------------------------------------------
function mkSlug(s) { return s.toLowerCase().replace(/[^a-z0-9\s-]/g,"").replace(/\s+/g,"-").replace(/-+/g,"-").trim(); }
function cmpSlug(a, b) { const s = [mkSlug(a), mkSlug(b)].sort(); return s[0] + "-vs-" + s[1]; }
function amzUrl(n) { return "https://www.amazon.com/s?k=" + encodeURIComponent(n) + "&tag=" + TAG; }
function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

// -- Claude call -----------------------------------------------------------------
function claude(apiKey, system, user, maxTok) {
  const body = JSON.stringify({ model: MODEL, max_tokens: maxTok, system, messages: [{ role:"user", content:user }] });
  return new Promise((ok, fail) => {
    const req = https.request({
      hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
      headers: { "Content-Type":"application/json","Content-Length":Buffer.byteLength(body),"x-api-key":apiKey,"anthropic-version":"2023-06-01" }
    }, r => { let d=""; r.on("data",c=>d+=c); r.on("end",()=>ok({status:r.statusCode,raw:d})); });
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

// -- Full article HTML — same structure as find.js buildCmpHTML -----------------
const FAV2 = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%232563EB'/%3E%3Ctext x='16' y='22' font-family='Inter' font-size='13' font-weight='800' fill='white' text-anchor='middle'%3ECA%3C/text%3E%3C/svg%3E";
const GA2  = "G-6MR7X29W2X";
const CSS2 = `*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,system-ui,sans-serif;color:#0F172A;background:#fff;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;min-height:100vh}
main{flex:1}.wrap{max-width:880px;margin:0 auto;padding:44px 24px 80px}
.hdr{background:#fff;border-bottom:1.5px solid #E2E8F0;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 28px;height:58px;position:sticky;top:0;z-index:200}
.logo{font-size:18px;font-weight:800;color:#0F172A;text-decoration:none;letter-spacing:-0.4px;justify-self:start}.logo em{color:#2563EB;font-style:normal}
.nav{display:flex;gap:6px;justify-self:center}
.nav a{background:#2563EB;padding:7px 16px;border-radius:8px;font-size:13.5px;font-weight:600;color:#fff;text-decoration:none;white-space:nowrap}.nav a:hover{background:#1D4ED8}
.tag{font-size:12px;color:#0F172A;border:1.5px solid #E2E8F0;border-radius:20px;padding:4px 12px;font-weight:500;background:#F8FAFC;justify-self:end;white-space:nowrap}
h1{font-size:28px;font-weight:800;letter-spacing:-0.6px;line-height:1.2;margin-bottom:12px}
.lead{font-size:15px;color:#475569;margin-bottom:28px;line-height:1.7}
.badge{display:inline-block;background:#EFF6FF;color:#2563EB;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;border:1px solid #BFDBFE;margin-bottom:16px}
.sec{border:1.5px solid #E2E8F0;border-radius:12px;margin-bottom:12px;overflow:hidden}
.sec-h{background:#F8FAFC;padding:12px 18px;font-size:14px;font-weight:700;cursor:pointer;display:flex;justify-content:space-between;align-items:center;user-select:none}
.sec-h:hover{background:#F1F5F9}
.sec-b{display:none;padding:16px 18px;border-top:1px solid #E2E8F0}
.sec.open .sec-b{display:block}
.sec-ico{font-size:11px;transition:transform .2s;flex-shrink:0}
.sec.open .sec-ico{transform:rotate(180deg)}
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
.btn-az{display:inline-block;background:#FF9900;color:#0F172A;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;margin-top:10px}.btn-az:hover{background:#E88A00}
.rel{display:flex;gap:8px;flex-wrap:wrap}
.rel a{background:#F8FAFC;border:1.5px solid #E2E8F0;padding:7px 14px;border-radius:20px;font-size:13px;font-weight:600;color:#0F172A;text-decoration:none}.rel a:hover{border-color:#2563EB;color:#2563EB}
.disc{background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:10px;padding:12px 16px;font-size:12px;color:#475569;margin-top:24px}
.ftr{background:#F8FAFC;border-top:1.5px solid #E2E8F0;padding:24px 28px}
.ftr-in{max-width:880px;margin:0 auto;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:13px;color:#0F172A;align-items:center}
.ftr-in a{color:#0F172A;text-decoration:none;font-weight:500}.ftr-in a:hover{color:#2563EB}
.ftr-links{display:flex;gap:16px;flex-wrap:wrap}
@media(max-width:640px){.hdr{display:flex;flex-direction:column;height:auto;padding:12px 16px;gap:10px;align-items:center;text-align:center}.logo{justify-self:unset}.tag{display:none}.nav{justify-content:center;flex-wrap:wrap;gap:6px;width:100%}.nav a{font-size:12px;padding:6px 10px;white-space:nowrap}.cmp-cols{grid-template-columns:1fr}.wrap{padding:28px 16px 60px}h1{font-size:22px}}`;

const HDR2 = '<header class="hdr"><a href="/" class="logo">Cheapest<em>Alt</em></a>' +
  '<nav class="nav"><a href="/">Find Alternatives</a><a href="https://cheapestalt.com/compare">Compare Products</a></nav>' +
  '<div class="tag">Free &middot; No signup needed</div></header>';

const FTR2 = '<footer class="ftr"><div class="ftr-in"><span>&copy; 2026 CheapestAlt. All rights reserved.</span>' +
  '<div class="ftr-links"><a href="/">Home</a><a href="/#about">About</a>' +
  '<a href="/#how-it-works">How it works</a><a href="/#disclosure">Affiliate Disclosure</a>' +
  '<a href="mailto:Support@cheapestalt.com">Contact</a></div></div></footer>';

function shell2(title, desc, slug, body, amazonSection) {
  return '<!DOCTYPE html><html lang="en"><head>\n' +
    '<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>\n' +
    '<title>' + esc(title) + ' | CheapestAlt</title>\n' +
    '<meta name="description" content="' + esc(desc) + '"/>\n' +
    '<meta property="og:title" content="' + esc(title) + '"/>\n' +
    '<meta property="og:description" content="' + esc(desc) + '"/>\n' +
    '<link rel="canonical" href="https://www.cheapestalt.com/find?slug=' + esc(slug) + '"/>\n' +
    '<link rel="icon" type="image/svg+xml" href="' + FAV2 + '"/>\n' +
    '<meta name="theme-color" content="#2563EB"/>\n' +
    '<script async src="https://www.googletagmanager.com/gtag/js?id=' + GA2 + '"></script>\n' +
    '<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","' + GA2 + '");</script>\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"/>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>\n' +
    '<style>' + CSS2 + '</style></head><body>\n' +
    HDR2 + '\n<main class="wrap">' + body + '</main>\n' +
    (amazonSection || '') +
    FTR2 + '\n' +
    '<script>function tog(el){el.classList.toggle("open")}</script>\n' +
    '</body></html>';
}

function sec2(title, content, open) {
  return '<div class="sec' + (open ? ' open' : '') + '" onclick="tog(this)">' +
    '<div class="sec-h">' + esc(title) + '<span class="sec-ico">&#9662;</span></div>' +
    '<div class="sec-b">' + content + '</div></div>';
}

function pcItem2(text, type) {
  return '<div class="pc"><span class="pc-dot" style="background:' +
    (type === "pro" ? "#F0FDF4;color:#16A34A" : "#FEF2F2;color:#DC2626") + '">' +
    (type === "pro" ? "&#10003;" : "&#10007;") + '</span>' + esc(text) + '</div>';
}

function btnAz2(name) {
  return '<a href="' + amzUrl(name) + '" target="_blank" rel="noopener" class="btn-az">View deal on Amazon &#8594;</a>';
}

function renderHTML(data, slug, amazonSection) {
  const A = data.productA, B = data.productB;
  if (!A || !B) return '';
  const title = A.name + " vs " + B.name + " — Which is Better Value in 2026?";
  const desc  = "Side-by-side comparison of " + A.name + " and " + B.name + ". Price, features, pros, cons and verdict.";

  const tRows = (data.comparison || []).map(r =>
    '<tr><td class="feat">' + esc(r.feature) + '</td>' +
    '<td class="' + (r.winner === "a" ? "win" : "") + '">' + esc(r.a) + '</td>' +
    '<td class="' + (r.winner === "b" ? "win" : "") + '">' + esc(r.b) + '</td></tr>'
  ).join("");

  const mkList = (items, type) => (items || []).map(x => pcItem2(x, type)).join("");

  const sA = mkSlug(A.name), sB = mkSlug(B.name);

  const faqHtml = (data.faqs || []).map(f =>
    '<div style="padding:12px 0;border-bottom:1px solid #F1F5F9">' +
    '<div class="faq-q">' + esc(f.q) + '</div>' +
    '<div class="faq-a">' + esc(f.a) + '</div></div>'
  ).join("");

  const body =
    '<div class="badge">Product comparison</div>' +
    '<h1>' + esc(title) + '</h1>' +
    (data.intro ? '<p class="lead">' + esc(data.intro) + '</p>' : '') +
    sec2("1 — Feature comparison",
      '<div style="overflow-x:auto"><table class="cmp-tbl"><thead><tr><th>Feature</th><th>' + esc(A.name) + '</th><th>' + esc(B.name) + '</th></tr></thead><tbody>' + tRows + '</tbody></table></div>',
      true) +
    sec2("2 — Pros & Cons",
      '<div class="cmp-cols">' +
      '<div class="cmp-col">' +
        (A.image ? '<img src="' + A.image + '" alt="' + esc(A.name) + '" style="width:56px;height:56px;object-fit:contain;border-radius:8px;margin-bottom:10px;background:#fff;border:1px solid #E2E8F0;display:block;"/>' : '') +
        '<h3>' + esc(A.name) + '</h3>' +
        '<div class="cmp-price">$' + Number(A.price || 0).toLocaleString() + '</div>' +
        mkList(A.pros, "pro") + mkList(A.cons, "con") + btnAz2(A.name) + '</div>' +
      '<div class="cmp-col">' +
        (B.image ? '<img src="' + B.image + '" alt="' + esc(B.name) + '" style="width:56px;height:56px;object-fit:contain;border-radius:8px;margin-bottom:10px;background:#fff;border:1px solid #E2E8F0;display:block;"/>' : '') +
        '<h3>' + esc(B.name) + '</h3>' +
        '<div class="cmp-price">$' + Number(B.price || 0).toLocaleString() + '</div>' +
        mkList(B.pros, "pro") + mkList(B.cons, "con") + btnAz2(B.name) + '</div>' +
      '</div>', true) +
    (data.verdict ? sec2("3 — Verdict & Recommendation",
      '<div class="verdict"><strong>Verdict: </strong>' + esc(data.verdict) +
      (data.winnerReason ? '<br><br><strong>Winner: ' + esc(data.winner || "") + '</strong> &mdash; ' + esc(data.winnerReason) : '') +
      '</div>') : '') +
    (faqHtml ? sec2("4 — Frequently asked questions", faqHtml) : '') +
    sec2("5 — Related pages",
      '<div class="rel">' +
      '<a href="/find?slug=' + sA + '-alternatives">Alternatives to ' + esc(A.name) + '</a>' +
      '<a href="/find?slug=' + sB + '-alternatives">Alternatives to ' + esc(B.name) + '</a>' +
      '<a href="/">Search more &#8594;</a></div>') +
    '<div class="disc"><strong>Affiliate disclosure:</strong> Links are Amazon affiliate links (tag: ' + TAG + '). We earn a small commission at no extra cost to you.</div>';

  return shell2(title, desc, slug, body, amazonSection);
}


// -- Prompt ----------------------------------------------------------------------
const SYS = 'Return ONLY valid JSON. No markdown. No apostrophes. ' +
  'Schema: {"productA":{"name":"str","price":0,"rating":0.0,"reviews":0,"pros":["str"],"cons":["str"]},' +
  '"productB":{"name":"str","price":0,"rating":0.0,"reviews":0,"pros":["str"],"cons":["str"]},' +
  '"comparison":[{"feature":"str","a":"str","b":"str","winner":"a"}],' +
  '"intro":"str","verdict":"str","winner":"str","winnerReason":"str",' +
  '"faqs":[{"q":"str","a":"str"},{"q":"str","a":"str"},{"q":"str","a":"str"},{"q":"str","a":"str"}]}. ' +
  'Rules: 6 to 8 comparison rows, winner must be exactly a or b or tie, 3 to 4 pros and cons each, 4 FAQs specific to these two products, no apostrophes.';

// -- Main handler ----------------------------------------------------------------
function comparePageHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Compare Two Products &ndash; CheapestAlt</title>
<meta name="description" content="Side-by-side comparison of any two products. Features, pricing, and value verdict &mdash; before you buy."/>
<link rel="canonical" href="https://www.cheapestalt.com/compare"/>
<link rel="icon" type="image/svg+xml" href="/favicon.svg"/>
<meta name="theme-color" content="#2563EB"/>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-6MR7X29W2X"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-6MR7X29W2X');</script>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,sans-serif;color:#0F172A;background:#fff;font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;min-height:100vh}
.hdr{background:#fff;border-bottom:1.5px solid #E2E8F0;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 28px;height:58px;position:sticky;top:0;z-index:200}
.logo{font-size:18px;font-weight:800;color:#0F172A;text-decoration:none;letter-spacing:-0.4px;justify-self:start}
.logo em{color:#2563EB;font-style:normal}
.nav{display:flex;gap:4px;justify-self:center}
.nb{background:#F8FAFC;border:1.5px solid #CBD5E1;padding:7px 16px;border-radius:8px;font-size:13.5px;font-weight:600;color:#0F172A;text-decoration:none;white-space:nowrap;transition:all .18s}
.nb:hover{background:#EFF6FF;border-color:#2563EB;color:#2563EB}
.nb.on{background:#2563EB!important;border-color:#2563EB!important;color:#fff!important}
.hdr-tag{font-size:12px;color:#0F172A;border:1.5px solid #E2E8F0;border-radius:20px;padding:4px 12px;font-weight:500;background:#F8FAFC;justify-self:end;white-space:nowrap}
@media(max-width:640px){.hdr{display:flex;flex-direction:column;height:auto;padding:12px 16px;gap:10px;align-items:center}.hdr-tag{display:none}.nav{justify-content:center;width:100%}.nb{font-size:13px;padding:9px 16px;flex:1;text-align:center}}
main{flex:1}
.cmp-hero{text-align:center;padding:56px 24px 36px}
.cmp-hero h1{font-size:34px;font-weight:800;letter-spacing:-0.7px;margin-bottom:10px;color:#0F172A}
.cmp-hero p{font-size:16px;color:#475569;margin-bottom:36px}
.cmp-form{max-width:700px;margin:0 auto;padding:0 24px 32px}
.cmp-inputs{display:grid;grid-template-columns:1fr 44px 1fr;gap:12px;align-items:center;margin-bottom:20px}
.cmp-inputs input{padding:13px 16px;border:2px solid #E2E8F0;border-radius:10px;font-size:14px;font-family:'Inter',sans-serif;color:#0F172A;background:#fff;outline:none;width:100%;transition:border-color .18s,box-shadow .18s;font-weight:500}
.cmp-inputs input::placeholder{color:#94A3B8;font-weight:400}
.cmp-inputs input:focus{border-color:#2563EB;box-shadow:0 0 0 3px rgba(37,99,235,0.10)}
.vs{width:44px;height:44px;background:#F8FAFC;border:2px solid #E2E8F0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#0F172A}
.cmp-go{display:flex;justify-content:center}
.btn-primary{background:#2563EB;color:#fff;border:2px solid #2563EB;padding:13px 36px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;transition:all .15s;box-shadow:0 2px 8px rgba(37,99,235,0.28)}
.btn-primary:hover{background:#1D4ED8;border-color:#1D4ED8}
.btn-primary:disabled{background:#93C5FD;border-color:#93C5FD;cursor:not-allowed}
@media(max-width:640px){.cmp-inputs{grid-template-columns:1fr;gap:10px}.vs{display:none}}
.cmp-res{max-width:960px;margin:0 auto;padding:0 24px 72px}
.cmp-res h2{font-size:24px;font-weight:800;color:#0F172A;letter-spacing:-0.5px;margin-bottom:16px}
.intro-box{background:#EFF6FF;border:1.5px solid #BFDBFE;border-radius:10px;padding:16px 20px;margin-bottom:20px;font-size:14px;line-height:1.75;color:#1E3A6E}
.tbl-wrap{background:#fff;border:1.5px solid #E2E8F0;border-radius:14px;overflow:hidden;margin-bottom:20px}
table{width:100%;border-collapse:collapse}
th{background:#F8FAFC;padding:11px 16px;text-align:left;font-size:12px;font-weight:700;color:#0F172A;border-bottom:1.5px solid #E2E8F0;letter-spacing:0.5px;text-transform:uppercase}
td{padding:11px 16px;border-bottom:1px solid #E2E8F0;font-size:13.5px;color:#0F172A}
tr:last-child td{border-bottom:none}
td.win{color:#2563EB;font-weight:700}
.cmp-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
.cmp-col{background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:14px;padding:18px 20px}
.cmp-col h3{font-size:15px;font-weight:700;color:#0F172A;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #E2E8F0}
.pc{display:flex;gap:9px;align-items:flex-start;margin-bottom:8px;font-size:13px;color:#0F172A;line-height:1.5}
.pc-dot{width:18px;height:18px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;margin-top:1px}
.pro .pc-dot{background:#F0FDF4;color:#16A34A}
.con .pc-dot{background:#FEF2F2;color:#DC2626}
.verdict-box{background:#FFFBEB;border:1.5px solid #FDE68A;border-radius:10px;padding:16px 20px;font-size:14px;line-height:1.75;color:#78350F;margin-bottom:20px}
.verdict-box strong{color:#0F172A;font-weight:700}
.cmp-btns{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
.dbtn{padding:11px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;transition:all .15s;text-align:center;display:block;width:100%;border:none}
.dbtn-az{background:#FF9900;color:#0F172A}
.dbtn-az:hover{background:#E88A00}
.colls{max-width:960px;margin:0 auto;padding:0 24px 72px}
.coll{background:#fff;border:1.5px solid #E2E8F0;border-radius:10px;margin-bottom:8px;overflow:hidden}
.coll-h{padding:14px 18px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:14px;color:#0F172A;user-select:none}
.coll-h:hover{background:#F8FAFC}
.coll-ico{width:22px;height:22px;border-radius:50%;background:#F8FAFC;border:1.5px solid #E2E8F0;display:flex;align-items:center;justify-content:center;font-size:11px;transition:transform .2s;flex-shrink:0}
.coll.open .coll-ico{transform:rotate(180deg);background:#EFF6FF;border-color:#BFDBFE;color:#2563EB}
.coll-b{display:none;padding:14px 18px 16px;border-top:1px solid #E2E8F0;font-size:13.5px;color:#0F172A;line-height:1.75}
.coll.open .coll-b{display:block}
.err-box{max-width:960px;margin:0 auto;padding:0 24px}
.err-inner{background:#FEF2F2;border:1.5px solid #FECACA;border-radius:10px;padding:16px 20px;color:#991B1B;font-size:14px;display:flex;align-items:flex-start;gap:12px}
.err-icon{font-size:18px;flex-shrink:0;margin-top:1px}
.err-inner strong{display:block;margin-bottom:4px;font-weight:700;color:#7F1D1D}
.loading{text-align:center;padding:56px 24px}
.spin{width:34px;height:34px;border:3px solid #E2E8F0;border-top-color:#2563EB;border-radius:50%;animation:sp .65s linear infinite;margin:0 auto 14px}
@keyframes sp{to{transform:rotate(360deg)}}
.loading p{color:#0F172A;font-size:14px}
.loading-sub{font-size:12px;color:#94A3B8;margin-top:6px}
.cache-tag{display:inline-block;background:#F0FDF4;color:#16A34A;font-size:11px;font-weight:600;padding:2px 8px;border-radius:6px;border:1px solid #BBF7D0;margin-left:8px;vertical-align:middle}
@media(max-width:640px){.cmp-cols{grid-template-columns:1fr}.cmp-btns{flex-direction:column}}
.ftr{background:#F8FAFC;border-top:1.5px solid #E2E8F0;padding:24px 28px;margin-top:auto}
.ftr-in{max-width:960px;margin:0 auto;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:13px;color:#0F172A;align-items:center}
.ftr-in a{color:#0F172A;text-decoration:none;font-weight:500}.ftr-in a:hover{color:#2563EB}
.ftr-links{display:flex;gap:16px;flex-wrap:wrap}
</style>
</head>
<body>
<header class="hdr">
  <a href="/" class="logo">Cheapest<em>Alt</em></a>
  <nav class="nav">
    <a class="nb" href="/">Find Alternatives</a>
    <a class="nb on" href="/compare">Compare Products</a>
  </nav>
  <div class="hdr-tag">Free &middot; No signup needed</div>
</header>
<main>
  <div class="cmp-hero">
    <h1>Compare Two Products</h1>
    <p>Side-by-side analysis of features, pricing, and value &mdash; before you buy.</p>
  </div>
  <div class="cmp-form">
    <div class="cmp-inputs">
      <input id="pa" type="text" placeholder="Product A  (e.g. AirPods Pro)"/>
      <div class="vs">VS</div>
      <input id="pb" type="text" placeholder="Product B  (e.g. Sony WF-1000XM5)"/>
    </div>
    <div class="cmp-go"><button class="btn-primary" id="cmp-btn" onclick="goCmp()">Compare Now</button></div>
  </div>
  <div id="cr"></div>
</main>
<footer class="ftr">
  <div class="ftr-in">
    <span>&copy; 2026 CheapestAlt. All rights reserved.</span>
    <div class="ftr-links">
      <a href="/">Home</a>
      <a href="/compare">Compare</a>
      <a href="/trending">Articles</a>
      <a href="mailto:Support@cheapestalt.com">Contact</a>
    </div>
  </div>
</footer>
<script>
  let isComparing = false;
  function amzLink(name) { return 'https://www.amazon.com/s?k=' + encodeURIComponent(name) + '&tag=cheapestalt-20'; }
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9\\s-]/g,'').replace(/\\s+/g,'-').replace(/-+/g,'-').trim(); }
  function tog(el) { el.classList.toggle('open'); }

  async function goCmp() {
    const a = document.getElementById('pa').value.trim();
    const b = document.getElementById('pb').value.trim();
    if (!a || !b || isComparing) return;
    isComparing = true;
    const btn = document.getElementById('cmp-btn');
    btn.disabled = true; btn.textContent = 'Analyzing…';
    document.getElementById('cr').innerHTML = '<div class="loading"><div class="spin"></div><p>Comparing <strong>' + esc(a) + '</strong> vs <strong>' + esc(b) + '</strong>…</p><p class="loading-sub">Analyzing features, pricing, and value — this takes a few seconds.</p></div>';
    try {
      const resp = await fetch('/api/compare', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({productA:a,productB:b}) });
      if (!resp.ok) { const err = await resp.json().catch(()=>({})); throw new Error(err.error||'HTTP '+resp.status); }
      renderComparison(await resp.json());
    } catch(err) {
      document.getElementById('cr').innerHTML = '<div class="err-box"><div class="err-inner"><span class="err-icon">&#9888;</span><div><strong>Unable to load comparison</strong><p style="margin-top:6px;font-size:13px;color:#475569;line-height:1.6">Could not generate this comparison. Please try again or use different product names.</p><button onclick="goCmp()" style="margin-top:10px;background:#2563EB;color:#fff;border:none;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">Try again</button></div></div></div>';
    } finally { isComparing=false; btn.disabled=false; btn.textContent='Compare Now'; }
  }

  function renderComparison(data) {
    const {productA,productB,comparison,intro,verdict,winner,winnerReason} = data;
    const cacheLabel = data.fromCache ? '<span class="cache-tag">cached</span>' : '';
    const rows = (comparison||[]).map(r=>'<tr><td><strong>'+esc(r.feature)+'</strong></td><td'+(r.winner==='a'?' class="win"':'')+'>'+esc(r.a)+'</td><td'+(r.winner==='b'?' class="win"':'')+'>'+esc(r.b)+'</td></tr>').join('');
    const prosA = (productA.pros||[]).map(p=>'<div class="pc pro"><span class="pc-dot">&#10003;</span>'+esc(p)+'</div>').join('');
    const consA = (productA.cons||[]).map(c=>'<div class="pc con"><span class="pc-dot">&#10007;</span>'+esc(c)+'</div>').join('');
    const prosB = (productB.pros||[]).map(p=>'<div class="pc pro"><span class="pc-dot">&#10003;</span>'+esc(p)+'</div>').join('');
    const consB = (productB.cons||[]).map(c=>'<div class="pc con"><span class="pc-dot">&#10007;</span>'+esc(c)+'</div>').join('');
    const verdictHtml = verdict ? '<div class="verdict-box"><strong>Verdict: </strong>'+esc(verdict)+(winnerReason?'<br><br><strong>Winner: '+esc(winner)+'</strong> — '+esc(winnerReason):'')+' </div>' : '';
    const slugA = slug(productA.name), slugB = slug(productB.name);
    let html = '<div class="cmp-res">';
    html += '<h2>'+esc(productA.name)+' vs '+esc(productB.name)+' '+cacheLabel+'</h2>';
    if (intro) html += '<div class="intro-box">'+esc(intro)+'</div>';
    html += '<div class="tbl-wrap"><table><thead><tr><th>Feature</th><th>'+esc(productA.name)+'</th><th>'+esc(productB.name)+'</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
    html += '<div class="cmp-cols">';
    html += '<div class="cmp-col">'+(productA.image?'<img src="'+productA.image+'" alt="'+esc(productA.name)+'" style="width:56px;height:56px;object-fit:contain;border-radius:8px;margin-bottom:10px;background:#fff;border:1px solid #E2E8F0;display:block;"/>':'')+'<h3>'+esc(productA.name)+'</h3>'+prosA+consA+'<div style="margin-top:14px"><button class="dbtn dbtn-az" onclick="window.open(\''+amzLink(productA.name)+'\',\'_blank\')">View on Amazon &#8594;</button></div></div>';
    html += '<div class="cmp-col">'+(productB.image?'<img src="'+productB.image+'" alt="'+esc(productB.name)+'" style="width:56px;height:56px;object-fit:contain;border-radius:8px;margin-bottom:10px;background:#fff;border:1px solid #E2E8F0;display:block;"/>':'')+'<h3>'+esc(productB.name)+'</h3>'+prosB+consB+'<div style="margin-top:14px"><button class="dbtn dbtn-az" onclick="window.open(\''+amzLink(productB.name)+'\',\'_blank\')">View on Amazon &#8594;</button></div></div>';
    html += '</div>'+verdictHtml;
    html += '<div class="cmp-btns"><button class="dbtn dbtn-az" style="flex:1" onclick="window.open(\''+amzLink(productA.name)+'\',\'_blank\')">Check '+esc(productA.name)+' on Amazon &#8594;</button><button class="dbtn dbtn-az" style="flex:1" onclick="window.open(\''+amzLink(productB.name)+'\',\'_blank\')">Check '+esc(productB.name)+' on Amazon &#8594;</button></div>';
    html += '</div>';
    html += '<div class="colls">';
    html += '<div class="coll" onclick="tog(this)"><div class="coll-h">Read the full comparison article <span class="coll-ico">&#9662;</span></div><div class="coll-b"><p style="margin-bottom:14px">Get the in-depth analysis of <strong>'+esc(productA.name)+'</strong> vs <strong>'+esc(productB.name)+'</strong>.</p><a href="/find?slug='+(data.slug||slugA+'-vs-'+slugB)+'" target="_blank" style="display:inline-block;background:#2563EB;color:#fff;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">Read Full Comparison &#8594;</a></div></div>';
    html += '<div class="coll" onclick="tog(this)"><div class="coll-h">Find cheaper alternatives <span class="coll-ico">&#9662;</span></div><div class="coll-b"><a href="/find?slug='+slugA+'-alternatives" target="_blank" style="display:flex;justify-content:space-between;background:#F8FAFC;border:1.5px solid #E2E8F0;padding:12px 16px;border-radius:8px;font-size:13px;font-weight:600;color:#0F172A;text-decoration:none;margin-bottom:8px">Alternatives to '+esc(productA.name)+' <span style="color:#2563EB">&#8594;</span></a><a href="/find?slug='+slugB+'-alternatives" target="_blank" style="display:flex;justify-content:space-between;background:#F8FAFC;border:1.5px solid #E2E8F0;padding:12px 16px;border-radius:8px;font-size:13px;font-weight:600;color:#0F172A;text-decoration:none">Alternatives to '+esc(productB.name)+' <span style="color:#2563EB">&#8594;</span></a></div></div>';
    html += '</div>';
    document.getElementById('cr').innerHTML = html;
  }

  document.getElementById('pa').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('pb').focus(); });
  document.getElementById('pb').addEventListener('keydown', e => { if (e.key === 'Enter') goCmp(); });
</script>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    const slug = req.query && req.query.slug;
    if (slug) {
      const { data: rows } = await db.get(slug);
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row || !row.content) {
        res.setHeader("Location", "/compare");
        return res.status(302).end();
      }
      let data;
      try { data = typeof row.content === "string" ? JSON.parse(row.content) : row.content; } catch { data = {}; }
      data.slug = slug;
      let amazonSection = "";
      try {
        if (amz) {
          const kw = ((data.productA && data.productA.name) || "") + " " + ((data.productB && data.productB.name) || "");
          const products = await amz.searchProducts(kw.trim(), 4);
          if (products && products.length > 0) {
            amazonSection = '<div style="max-width:880px;margin:32px auto;padding:0 24px;font-family:Inter,system-ui,sans-serif">'
              + '<h2 style="font-size:20px;font-weight:800;margin-bottom:16px;color:#0F172A;border-left:4px solid #2563EB;padding-left:12px;">Top Picks on Amazon</h2>'
              + amz.productGrid(products)
              + '</div>';
          }
        }
      } catch(e) { console.log("Compare article Amazon fetch skipped:", e.message); }
      const html = renderHTML(data, slug, amazonSection);
      if (!html) { res.setHeader("Location", "/compare"); return res.status(302).end(); }
      return res.status(200).send(html);
    }
    return res.status(200).send(comparePageHTML());
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "CLAUDE_API_KEY not set" });

  const { productA, productB } = req.body || {};
  if (!productA || !productB)
    return res.status(400).json({ error: "productA and productB are required" });

  const a     = String(productA).trim().slice(0, 150);
  const b     = String(productB).trim().slice(0, 150);
  const slug  = cmpSlug(a, b);
  const hasDB = !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);

  // 1. Memory cache
  const hit = mGet(slug);
  if (hit) return res.status(200).json(Object.assign({}, hit, { fromCache: true }));

  // 2. Supabase — permanent lifetime storage
  if (hasDB) {
    const { data: rows } = await db.get(slug);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row && row.content) {
      let result;
      try { result = typeof row.content === "string" ? JSON.parse(row.content) : row.content; } catch { result = {}; }
      if (!result.slug || !result.slug.includes('/compare/')) {
        mSet(slug, result);
        return res.status(200).json(Object.assign({}, result, { fromCache: false, fromDatabase: true }));
      }
    }
  }

  // 3. Generate with Claude Sonnet
  let cr;
  try { cr = await claude(apiKey, SYS, 'Compare A: "' + a + '" vs B: "' + b + '". 6-8 rows, no apostrophes. Return JSON only.', 3000); }
  catch (e) { console.error("E1 network:",e.message); return res.status(502).json({ error: "Network error. Please try again." }); }

  let cb;
  try { cb = JSON.parse(cr.raw); }
  catch(e1) { console.error("E2 cb parse:",e1.message,"raw:",cr.raw.slice(0,200)); return res.status(502).json({ error: "Please try again in a few seconds." }); }

  if (cr.status !== 200) {
    console.error("E3 claude status:",cr.status,"raw:",cr.raw.slice(0,300));
    return res.status(502).json({ error: "AI service unavailable. Please try again." });
  }

  const raw = cb && cb.content && cb.content[0] && cb.content[0].text;
  if (!raw) { console.error("E4 no raw, cb:",JSON.stringify(cb).slice(0,200)); return res.status(502).json({ error: "Empty response. Please try again." }); }

  let data;
  try { data = xJSON(raw); }
  catch(e2) { console.error("E5 xJSON:",e2.message,"raw:",raw.slice(0,300)); return res.status(502).json({ error: "Please try again with different product names." }); }

  if (!data.productA || !data.productB) { console.error("E6 no products, data:",JSON.stringify(data).slice(0,200)); return res.status(502).json({ error: "Please try again in a few seconds." }); }

  // 4. Normalise winner field
  data.comparison = (data.comparison || []).map(r => {
    const w = String(r.winner || "tie").toLowerCase();
    return { feature: r.feature, a: r.a, b: r.b, winner: (w === "a" || w === "b") ? w : "tie" };
  });

  data.productA.links = { amazon: amzUrl(data.productA.name) };
  data.productB.links = { amazon: amzUrl(data.productB.name) };
  data.slug        = slug;
  data.type        = "comparison";
  data.generatedAt = new Date().toISOString();
  data.fromCache   = false;
  data.fromDatabase = false;

  // 4b. Fetch product images from Amazon
  try {
    if (amz) {
      const [imgA, imgB] = await Promise.all([
        amz.searchProducts(data.productA.name, 1).catch(() => []),
        amz.searchProducts(data.productB.name, 1).catch(() => [])
      ]);
      if (imgA && imgA[0]) data.productA.image = imgA[0].image || null;
      if (imgB && imgB[0]) data.productB.image = imgB[0].image || null;
    }
  } catch(e) { console.log("Compare image fetch skipped:", e.message); }

  // 5. Pre-render HTML for instant SEO delivery
  const html = renderHTML(data, slug);

  mSet(slug, data);

  // 6. Save to Supabase – fire and forget so the response is not delayed
  if (hasDB) {
    const doSave = async (s, h) => {
      const row = {
        slug: s, type: "comparison", product_a: a, product_b: b,
        title: data.productA.name + " vs " + data.productB.name,
        content: data, html: h,
        created_at: data.generatedAt, last_generated: data.generatedAt,
      };
      try {
        const r = await db.insert(row);
        if (r.error) {
          const u = await db.update(s, { content: data, html: h, last_generated: data.generatedAt });
          if (!u.error) console.log("CMP UPDATED:", s);
        } else { console.log("CMP SAVED:", s); }
      } catch(e) { console.error("CMP save catch:", e.message); }
    };

    await doSave(slug, html).catch(e => console.error("CMP save error:", e.message));

    const slugUnsorted = mkSlug(a) + "-vs-" + mkSlug(b);
    if (slugUnsorted !== slug) {
      doSave(slugUnsorted, renderHTML(data, slugUnsorted)).catch(e => console.error("CMP save2 error:", e.message));
    }
  }

  return res.status(200).json(data);
};
