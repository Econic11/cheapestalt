"use strict";
// api/run-trending.js
// Automated pipeline: Google Trends â†’ AI article generation â†’ Supabase
// Runs every 6 hours via Vercel Cron
// Manual trigger: GET /api/run-trending?secret=cheapestalt-stories-2026
//
// Per run: fetches 5 trending keywords â†’ generates 3 articles each at different angles
// = up to 15 new SEO articles per run, 60 per day

const https = require("https");
const MODEL = "claude-haiku-4-5-20251001";
const TAG   = "cheapestalt-20";
const SITE  = "https://www.cheapestalt.com";

// â”€â”€ Supabase â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function sbReq(method, path, body) {
  const base = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return Promise.resolve({ data: null, error: "no-config" });
  const host = base.replace(/^https?:\/\//, "");
  const pl   = body ? JSON.stringify(body) : null;
  return new Promise(resolve => {
    const h = {
      "apikey": key, "Authorization": "Bearer " + key,
      "Content-Type": "application/json",
    };
    if (method === "POST") h["Prefer"] = "resolution=merge-duplicates";
    if (pl) h["Content-Length"] = Buffer.byteLength(pl);
    const req = https.request(
      { hostname: host, path: "/rest/v1/" + path, method, headers: h },
      r => {
        let d = ""; r.on("data", c => d += c);
        r.on("end", () => {
          let p = null; try { p = JSON.parse(d); } catch {}
          resolve(r.statusCode >= 400
            ? { data: null, error: p || d.slice(0, 300) }
            : { data: p, error: null });
        });
      }
    );
    req.on("error", e => resolve({ data: null, error: e.message }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ data: null, error: "timeout" }); });
    if (pl) req.write(pl);
    req.end();
  });
}

// â”€â”€ Claude API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function callClaude(apiKey, system, user, maxTokens) {
  const body = JSON.stringify({
    model: MODEL, max_tokens: maxTokens || 2000,
    system, messages: [{ role: "user", content: user }]
  });
  return new Promise((ok, fail) => {
    const req = https.request({
      hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      }
    }, r => {
      let d = ""; r.on("data", c => d += c);
      r.on("end", () => ok({ status: r.statusCode, raw: d }));
    });
    req.on("error", fail);
    req.setTimeout(55000, () => req.destroy(new Error("Claude timeout")));
    req.write(body); req.end();
  });
}

function xJSON(text) {
  let s = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a !== -1 && b !== -1) s = s.slice(a, b + 1);
  s = s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
       .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(s);
}

function mkSlug(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-")
          .replace(/-+/g, "-").trim().slice(0, 80);
}
function esc(s) {
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;")
         .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// â”€â”€ STEP 1: Trending keywords â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Google Trends doesn't have a public API. We use:
// 1. Amazon Best Sellers RSS (reliable, product-focused)
// 2. A large rotating seed pool as fallback
// Seeds rotate by date so every run gets a fresh batch

const SEED_POOL = [
  // Electronics
  "wireless earbuds","noise cancelling headphones","mechanical keyboard",
  "smart watch","portable charger","gaming mouse","webcam hd","ring light",
  "bluetooth speaker","laptop stand","usb hub","external ssd","led strip lights",
  "smart plug","wifi router","dash cam","action camera","mini projector",
  // Home
  "air fryer","robot vacuum","instant pot","electric kettle","espresso machine",
  "air purifier","electric toothbrush","water flosser","massage gun","standing desk",
  "weighted blanket","food processor","dutch oven","cast iron skillet",
  // Fitness
  "resistance bands","yoga mat","foam roller","jump rope","pull up bar",
  "ab roller","smart scale","fitness tracker","cycling gloves","knee brace",
  // Beauty
  "hair dryer","flat iron","face roller","led face mask","electric shaver",
  "beard trimmer","teeth whitening","nail lamp","derma roller",
  // Pet
  "automatic pet feeder","pet camera","dog gps tracker","cat tree","robot litter box",
  // Outdoors
  "solar charger","camping lantern","trekking poles","sleeping bag","hiking backpack",
  // Smart home
  "smart doorbell","security camera","smart lock","smart bulb","video baby monitor",
  // Trending 2026
  "ai gadget 2026","portable translator","smart glasses","vr headset budget",
  "electric scooter","ebike accessories","posture corrector","ergonomic chair",
];


// â”€â”€ Google Trends RSS (free, no API key needed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Fetches daily trending searches from Google Trends RSS feed
function fetchGoogleTrends() {
  return new Promise(resolve => {
    const req = https.request({
      hostname: "trends.google.com",
      path: "/trends/trendingsearches/daily/rss?geo=US",
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CheapestAlt/1.0)",
        "Accept": "application/rss+xml,application/xml,text/xml",
      }
    }, r => {
      let d = ""; r.on("data", c => d += c);
      r.on("end", () => {
        // Extract <title> tags from RSS â€” skip the first one (feed title)
        const titles = [];
        const regex  = /<title><!\[CDATA\[([^\]]+)\]\]><\/title>|<title>([^<]+)<\/title>/g;
        let m, count = 0;
        while ((m = regex.exec(d)) !== null) {
          if (count === 0) { count++; continue; } // skip feed title
          const title = (m[1] || m[2] || "").trim();
          // Only keep product-related trends (filter out news/people/events)
          const isProduct = /(buy|price|deal|sale|review|best|cheap|vs|amazon|iphone|samsung|sony|apple|gaming|wireless|smart|robot|air|electric|portable)/i.test(title);
          if (title && title.length > 3 && title.length < 60 && isProduct) {
            titles.push(title.toLowerCase());
          }
          if (titles.length >= 10) break;
        }
        console.log("Google Trends RSS keywords found:", titles.length);
        resolve(titles);
      });
    });
    req.on("error", e => { console.log("Google Trends RSS error:", e.message); resolve([]); });
    req.setTimeout(8000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

// â”€â”€ Fetch custom keywords from Supabase (added manually by you) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function fetchCustomKeywords() {
  const { data, error } = await sbReq("GET",
    "custom_keywords?active=eq.true&order=priority.desc&select=keyword&limit=20",
    null);
  if (error || !Array.isArray(data)) return [];
  const kws = data.map(r => (r.keyword || "").trim().toLowerCase()).filter(Boolean);
  console.log("Custom keywords from Supabase:", kws.length);
  return kws;
}

async function getTrendingKeywords() {
  // Priority order:
  // 1. Your custom keywords (added manually in Supabase)
  // 2. Google Trends RSS (real-time trending in the US)
  // 3. Seed pool fallback (always available)

  const [customKws, trendsKws] = await Promise.all([
    fetchCustomKeywords(),
    fetchGoogleTrends(),
  ]);

  // Rotate seed pool daily for variety
  const d = new Date();
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  const rotated = [...SEED_POOL.slice(dayOfYear % SEED_POOL.length),
                   ...SEED_POOL.slice(0, dayOfYear % SEED_POOL.length)];

  // Merge: custom first, then trends, then seed pool â€” deduplicate
  const all = [...customKws, ...trendsKws, ...rotated];
  const seen = new Set();
  const unique = all.filter(k => {
    const key = k.slice(0, 20);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  console.log("Keyword sources â€” custom:", customKws.length,
    "trends:", trendsKws.length, "seed:", rotated.length,
    "total unique:", unique.length);

  // Return 3 keywords per run, rotating by hour so each run gets a fresh batch
  const hourSlot = d.getUTCHours();
  return [
    unique[hourSlot % unique.length],
    unique[(hourSlot + 1) % unique.length],
    unique[(hourSlot + 2) % unique.length],
  ];
}

// â”€â”€ STEP 2: Article angle variations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// For each keyword we generate 3 articles with different angles
const ANGLES = [
  {
    type:   "alternative",
    prompt: (kw) => `Write a complete SEO article about "Best cheap alternatives to ${kw}". Focus on helping people find cheaper options. Include: hook intro, what the product is, 3-4 cheaper alternatives with pros/cons, comparison table, pricing section, FAQ (4 questions), and conclusion. Use affiliate links for Amazon. Write in simple engaging English. Feel human and helpful, not robotic.`,
    title:  (kw) => `Best Cheap Alternatives to ${titleCase(kw)} in 2026 â€” Save Up to 80%`,
    meta:   (kw) => `Looking for cheaper alternatives to ${kw}? We found the best budget options that deliver the same quality. Compare prices and save money today.`,
  },
  {
    type:   "comparison",
    prompt: (kw) => `Write a complete SEO article titled "${titleCase(kw)} vs Budget Alternatives â€” Which Is Worth It?". Help readers decide between the original and cheaper options. Include: intro with the dilemma, detailed comparison table (price, quality, features), pros and cons of each, our recommendation, FAQ (4 questions), and a strong conclusion. Feel honest and helpful.`,
    title:  (kw) => `${titleCase(kw)} vs Budget Alternatives â€” Which One Is Worth It in 2026?`,
    meta:   (kw) => `Is ${kw} worth the price? We compare it to the best budget alternatives so you can make the smartest buying decision.`,
  },
  {
    type:   "deal",
    prompt: (kw) => `Write a complete SEO article about "Where to find the best deals on ${kw} and alternatives". Help readers find the lowest prices. Include: intro about saving money, where to find deals (Amazon, sales, alternatives), top budget picks with prices, money-saving tips, FAQ (4 questions), and conclusion. Be enthusiastic and helpful.`,
    title:  (kw) => `Where to Find the Best ${titleCase(kw)} Deals â€” Top Budget Picks 2026`,
    meta:   (kw) => `Find the best ${kw} deals and budget alternatives on Amazon. We compare prices so you get maximum value for your money.`,
  },
];

function titleCase(s) {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

// â”€â”€ STEP 3: Generate article HTML with Claude â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ARTICLE_SYS =
  'You are an expert SEO copywriter. Return ONLY valid JSON, no markdown, no extra text. ' +
  'Schema: {"title":"str","meta":"str max 155 chars","intro":"2 sentence hook paragraph","sections":[{"h2":"str","body":"2-3 short paragraphs as plain text"}],"pros":["str"],"cons":["str"],"verdict":"1 paragraph","faq":[{"q":"str","a":"str"},{"q":"str","a":"str"},{"q":"str","a":"str"}]}. ' +
  'Rules: 4-5 sections, 3 pros, 3 cons, 3 FAQ, no apostrophes, keep total response under 1500 words, write in simple engaging English.';

async function generateArticle(apiKey, keyword, angle) {
  const userMsg = angle.prompt(keyword) +
    '\n\nFor CTA buttons use this format: <a href="AMAZON_LINK" class="cta-btn">Check Best Price</a>' +
    '\nReplace AMAZON_LINK with: https://www.amazon.com/s?k=' + encodeURIComponent(keyword) + '&tag=' + TAG;

  const cr = await callClaude(apiKey, ARTICLE_SYS, userMsg, 4000);
  if (cr.status !== 200) throw new Error("Claude error: " + cr.status);

  let cb;
  try { cb = JSON.parse(cr.raw); } catch { throw new Error("Claude response parse failed"); }

  const txt = cb && cb.content && cb.content[0] && cb.content[0].text;
  if (!txt) throw new Error("Empty Claude response");

  const data = xJSON(txt);
  if (!data.intro && !data.sections) throw new Error("No content in Claude response");
  return data;
}

// â”€â”€ STEP 4: Daily background style â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Changes every 24 hours â€” gives articles a fresh look each day
function getDailyStyle() {
  const day = Math.floor(Date.now() / 86400000);
  const styles = [
    { primary: "#2563EB", accent: "#1D4ED8", bg: "#EFF6FF", dark: "#1E3A5F", mode: "blue" },
    { primary: "#7C3AED", accent: "#6D28D9", bg: "#F5F3FF", dark: "#2E1065", mode: "purple" },
    { primary: "#059669", accent: "#047857", bg: "#ECFDF5", dark: "#064E3B", mode: "green" },
    { primary: "#DC2626", accent: "#B91C1C", bg: "#FEF2F2", dark: "#7F1D1D", mode: "red" },
    { primary: "#D97706", accent: "#B45309", bg: "#FFFBEB", dark: "#78350F", mode: "amber" },
    { primary: "#0891B2", accent: "#0E7490", bg: "#ECFEFF", dark: "#164E63", mode: "cyan" },
    { primary: "#0F172A", accent: "#1E293B", bg: "#F8FAFC", dark: "#020617", mode: "slate" },
  ];
  return styles[day % styles.length];
}

// â”€â”€ STEP 5: Build full article page HTML â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildArticlePage(article, slug, keyword, variationType, affiliateLink, style) {
  const pageUrl  = SITE + "/trending/" + slug;
  const amzLink  = affiliateLink || ("https://www.amazon.com/s?k=" + encodeURIComponent(keyword) + "&tag=" + TAG);
  const today    = new Date().toISOString().split("T")[0];

  // Build article HTML from structured sections (no raw HTML from Claude)
  const ctaBtnStyle = 'display:inline-block;background:' + style.primary +
    ';color:#fff;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;margin:12px 0;font-size:15px;';
  const ctaBtn = (text) => '<a href="' + amzLink + '" style="' + ctaBtnStyle + '">' + text + '</a>';

  const sections = (article.sections || []).map((s, i) => {
    const body = '<p>' + (s.body || '').replace(/\n\n/g, '</p><p>') + '</p>';
    // Add CTA after intro section and middle section
    const cta = (i === 0)
      ? ctaBtn('Check Best Price on Amazon')
      : (i === Math.floor((article.sections.length) / 2))
      ? ctaBtn('View Best Deal Now')
      : '';
    return '<h2>' + esc(s.h2 || '') + '</h2>' + body + cta;
  }).join('\n');

  const prosHtml = (article.pros||[]).length
    ? '<h2>Pros</h2><ul>' + (article.pros||[]).map(p => '<li>' + esc(p) + '</li>').join('') + '</ul>'
    : '';
  const consHtml = (article.cons||[]).length
    ? '<h2>Cons</h2><ul>' + (article.cons||[]).map(p => '<li>' + esc(p) + '</li>').join('') + '</ul>'
    : '';
  const verdictHtml = article.verdict
    ? '<h2>Our Verdict</h2><p>' + esc(article.verdict) + '</p>'
    : '';

  const htmlWithCTAs =
    '<p>' + esc(article.intro || '') + '</p>\n' +
    sections + '\n' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:24px 0;">' +
    prosHtml + consHtml + '</div>\n' +
    verdictHtml + '\n' +
    ctaBtn('See Best Alternative Now');

  // FAQ JSON-LD structured data
  const faqSchema = article.faq && article.faq.length ? JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": article.faq.map(f => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": { "@type": "Answer", "text": f.a }
    }))
  }) : null;

  // Article JSON-LD
  const articleSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": article.title || keyword,
    "description": article.meta || "",
    "url": pageUrl,
    "datePublished": today,
    "dateModified": today,
    "author": { "@type": "Organization", "name": "CheapestAlt", "url": SITE },
    "publisher": { "@type": "Organization", "name": "CheapestAlt", "url": SITE,
      "logo": { "@type": "ImageObject", "url": SITE + "/logo.png" } },
  });

  const FAV = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%232563EB'/%3E%3Ctext x='16' y='22' font-family='Inter' font-size='13' font-weight='800' fill='white' text-anchor='middle'%3ECA%3C/text%3E%3C/svg%3E";
  const GA  = "G-6MR7X29W2X";

  const css = [
    "*{box-sizing:border-box;margin:0;padding:0}",
    "body{font-family:Inter,system-ui,sans-serif;color:#0F172A;background:" + style.bg + ";-webkit-font-smoothing:antialiased}",
    ".hdr{background:#fff;border-bottom:1.5px solid #E2E8F0;padding:0 24px;height:58px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}",
    ".logo{font-size:18px;font-weight:800;color:#0F172A;text-decoration:none}",
    ".logo em{color:" + style.primary + ";font-style:normal}",
    ".nav{display:flex;gap:8px}",
    ".nav a{background:" + style.primary + ";color:#fff;padding:7px 16px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none}",
    ".wrap{max-width:820px;margin:0 auto;padding:40px 24px 80px}",
    ".badge{display:inline-block;background:" + style.primary + "22;color:" + style.primary + ";font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;border:1px solid " + style.primary + "44;margin-bottom:14px;text-transform:uppercase;letter-spacing:0.5px}",
    "h1{font-size:30px;font-weight:900;line-height:1.2;margin-bottom:14px;color:" + style.dark + "}",
    ".meta-info{color:#64748B;font-size:13px;margin-bottom:24px;display:flex;gap:16px;flex-wrap:wrap}",
    ".article-content h2{font-size:22px;font-weight:800;margin:32px 0 12px;color:" + style.dark + ";border-left:4px solid " + style.primary + ";padding-left:12px}",
    ".article-content h3{font-size:18px;font-weight:700;margin:24px 0 10px;color:#1E293B}",
    ".article-content p{font-size:16px;line-height:1.8;color:#374151;margin-bottom:16px}",
    ".article-content ul,.article-content ol{margin:0 0 16px 24px;font-size:16px;line-height:1.8;color:#374151}",
    ".article-content li{margin-bottom:6px}",
    ".article-content table{width:100%;border-collapse:collapse;margin:20px 0;font-size:14px}",
    ".article-content th{background:" + style.primary + ";color:#fff;padding:10px 14px;text-align:left;font-weight:700}",
    ".article-content td{padding:10px 14px;border-bottom:1px solid #E2E8F0;vertical-align:top}",
    ".article-content tr:nth-child(even) td{background:rgba(0,0,0,.03)}",
    ".article-content .cta-btn:hover{opacity:.9;transform:translateY(-1px)}",
    ".faq-section{background:#fff;border:1.5px solid #E2E8F0;border-radius:12px;padding:24px;margin:32px 0}",
    ".faq-section h2{border:none;padding:0;margin-bottom:16px}",
    ".faq-item{border-bottom:1px solid #F1F5F9;padding:14px 0}",
    ".faq-item:last-child{border-bottom:none}",
    ".faq-q{font-size:15px;font-weight:700;margin-bottom:6px;color:#0F172A}",
    ".faq-a{font-size:14px;color:#475569;line-height:1.7}",
    ".related{margin-top:40px;padding:24px;background:#fff;border-radius:12px;border:1.5px solid #E2E8F0}",
    ".related h2{font-size:18px;font-weight:700;margin-bottom:14px;border:none;padding:0}",
    ".related-links{display:flex;gap:10px;flex-wrap:wrap}",
    ".related-links a{background:" + style.bg + ";border:1.5px solid " + style.primary + "44;color:" + style.primary + ";padding:8px 16px;border-radius:20px;font-size:13px;font-weight:600;text-decoration:none}",
    ".related-links a:hover{background:" + style.primary + ";color:#fff}",
    ".disc{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:12px 16px;font-size:12px;color:#64748B;margin-top:24px}",
    ".ftr{background:#0F172A;color:#94A3B8;padding:32px 24px;margin-top:60px}",
    ".ftr-in{max-width:820px;margin:0 auto;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:13px;align-items:center}",
    ".ftr-in a{color:#94A3B8;text-decoration:none}.ftr-in a:hover{color:#fff}",
    ".ftr-links{display:flex;gap:16px;flex-wrap:wrap}",
    "@media(max-width:640px){.hdr{flex-direction:column;height:auto;padding:10px 16px;gap:8px;align-items:center}.nav a{font-size:12px;padding:5px 10px}h1{font-size:22px}.wrap{padding:24px 14px 60px}}",
  ].join("");

  return '<!DOCTYPE html><html lang="en"><head>\n' +
    '<meta charset="UTF-8"/>\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>\n' +
    '<title>' + esc(article.title || keyword) + ' | CheapestAlt</title>\n' +
    '<meta name="description" content="' + esc(article.meta || "") + '"/>\n' +
    '<link rel="canonical" href="' + pageUrl + '"/>\n' +
    '<link rel="icon" type="image/svg+xml" href="' + FAV + '"/>\n' +
    '<meta property="og:title" content="' + esc(article.title || keyword) + '"/>\n' +
    '<meta property="og:description" content="' + esc(article.meta || "") + '"/>\n' +
    '<meta property="og:url" content="' + pageUrl + '"/>\n' +
    '<meta name="robots" content="index,follow"/>\n' +
    '<script async src="https://www.googletagmanager.com/gtag/js?id=' + GA + '"></script>\n' +
    '<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","' + GA + '");</script>\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"/>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>\n' +
    '<script type="application/ld+json">' + articleSchema + '</script>\n' +
    (faqSchema ? '<script type="application/ld+json">' + faqSchema + '</script>\n' : '') +
    '<style>' + css + '</style>\n' +
    '</head><body>\n' +
    '<header class="hdr">\n' +
    '<a href="/" class="logo">Cheapest<em>Alt</em></a>\n' +
    '<nav class="nav"><a href="/">Find Alternatives</a><a href="https://cheapestalt.com/compare">Compare</a></nav>\n' +
    '</header>\n' +
    '<main class="wrap">\n' +
    '<div class="badge">' + variationType.replace(/_/g, " ") + '</div>\n' +
    '<h1>' + esc(article.title || keyword) + '</h1>\n' +
    '<div class="meta-info">\n' +
    '<span>By CheapestAlt</span>\n' +
    '<span>' + today + '</span>\n' +
    '<span>5 min read</span>\n' +
    '</div>\n' +
    '<div class="article-content">' + htmlWithCTAs + '</div>\n' +
    (article.faq && article.faq.length ? (
      '<div class="faq-section">\n' +
      '<h2>Frequently Asked Questions</h2>\n' +
      article.faq.map(f =>
        '<div class="faq-item"><div class="faq-q">' + esc(f.q) + '</div><div class="faq-a">' + esc(f.a) + '</div></div>'
      ).join("\n") +
      '\n</div>\n'
    ) : "") +
    '<div class="related">\n' +
    '<h2>Related Articles</h2>\n' +
    '<div class="related-links">\n' +
    '<a href="/trending">All Articles</a>\n' +
    '<a href="/">Find Alternatives</a>\n' +
    '<a href="https://cheapestalt.com/compare">Compare Products</a>\n' +
    '</div></div>\n' +
    '<div class="disc"><strong>Affiliate Disclosure:</strong> Links are Amazon affiliate links (tag: ' + TAG + '). We may earn a small commission at no extra cost to you.</div>\n' +
    '</main>\n' +
    '<footer class="ftr"><div class="ftr-in">\n' +
    '<span>&copy; 2026 CheapestAlt. All rights reserved.</span>\n' +
    '<div class="ftr-links">\n' +
    '<a href="/">Home</a><a href="/trending">Articles</a>\n' +
    '<a href="/stories">Stories</a>\n' +
    '<a href="mailto:Support@cheapestalt.com">Contact</a>\n' +
    '</div></div></footer>\n' +
    '</body></html>';
}

// â”€â”€ STEP 6: Check if slug already generated recently â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function slugIsRecent(slug) {
  const { data } = await sbReq("GET",
    "trending_articles?slug=eq." + encodeURIComponent(slug) +
    "&select=slug,last_generated&limit=1", null);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return false;
  // Skip if generated within last 20 hours
  const age = row.last_generated
    ? Date.now() - new Date(row.last_generated).getTime()
    : Infinity;
  return age < 20 * 3600 * 1000;
}

// â”€â”€ STEP 7: Save to Supabase â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function saveArticle(row) {
  const { error } = await sbReq("POST",
    "trending_articles?on_conflict=slug", row);
  if (error) {
    console.error("DB save error:", row.slug, JSON.stringify(error).slice(0, 200));
    return false;
  }
  console.log("Saved:", row.slug);
  return true;
}

// â”€â”€ MAIN HANDLER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  // Auth
  const secret = process.env.STORIES_SECRET || "cheapestalt-stories-2026";
  const given  = (req.query && req.query.secret) || "";
  const isCron = req.headers["x-vercel-cron"] === "1";
  if (!isCron && given !== secret) {
    return res.status(401).json({ error: "Unauthorized. Pass ?secret=YOUR_SECRET" });
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "CLAUDE_API_KEY not set" });
  if (!process.env.SUPABASE_URL) return res.status(500).json({ error: "Supabase not configured" });

  console.log("=== run-trending START ===", new Date().toISOString());
  const t0 = Date.now();
  const results = { saved: 0, skipped: 0, errors: [] };

  // Get 5 trending keywords for this run
  const keywords = await getTrendingKeywords();
  const style    = getDailyStyle();
  console.log("Keywords:", keywords.join(", "));
  console.log("Style mode:", style.mode);

  // 1 keyword Ã— 1 angle per run = 1 article, safe within 60s
  // Angle rotates by HOUR so each cron run gets a different angle + unique slug
  const runDate  = new Date();
  const runHour  = runDate.getUTCHours();
  const runAngle = ANGLES[runHour % ANGLES.length];

  for (const keyword of keywords) {
    const angle = runAngle;
    {

      const title = angle.title(keyword);
      // Include hour in slug so every cron run produces a unique slug
      const runHourStr = String(runDate.getUTCHours()).padStart(2, "0");
      const slug  = mkSlug(keyword) + "-" + angle.type + "-" +
                    runDate.toISOString().slice(0, 10) + "-h" + runHourStr;

      // Skip if recently generated
      if (await slugIsRecent(slug)) {
        console.log("Skip recent:", slug);
        results.skipped++;
        continue;
      }

      let article;
      try {
        console.log("Generating:", slug);
        article = await generateArticle(apiKey, keyword, angle);
      } catch (e) {
        console.error("Generate error:", keyword, angle.type, e.message);
        results.errors.push({ keyword, angle: angle.type, error: e.message });
        continue;
      }

      const affiliateLink = "https://www.amazon.com/s?k=" + encodeURIComponent(keyword) + "&tag=cheapestalt-20";
      const html = buildArticlePage(article, slug, keyword, angle.type, affiliateLink, style);

      const row = {
        slug,
        title:            article.title || title,
        keyword,
        product_name:     keyword,
        meta_description: article.meta || angle.meta(keyword),
        content:          html,
        variation_type:   angle.type,
        source:           "trending_auto",
        affiliate_link:   affiliateLink,
        background_style: style,
        click_count:      0,
        last_generated:   new Date().toISOString(),
      };

      const saved = await saveArticle(row);
      if (saved) results.saved++;
      else results.errors.push({ keyword, angle: angle.type, error: "DB save failed" });

      // Rate limit between Claude calls
      await new Promise(r => setTimeout(r, 300));
    }
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("=== run-trending DONE in", secs + "s ===",
    "saved:", results.saved, "skipped:", results.skipped, "errors:", results.errors.length);

  return res.status(200).json({
    ok: true,
    duration_seconds: secs,
    keywords,
    saved:   results.saved,
    skipped: results.skipped,
    errors:  results.errors.length,
    error_details: results.errors,
  });
};
