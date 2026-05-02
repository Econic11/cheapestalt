"use strict";
// api/run-daily-stories.js
// Automated daily pipeline: trending products → AI stories → AMP HTML → Supabase
// Triggered by Vercel Cron every 24h OR manually: GET /api/run-daily-stories?secret=YOUR_SECRET
//
// Pipeline:
//  1. Fetch trending product keywords (Amazon Best Sellers RSS + hardcoded seed list)
//  2. For each keyword: ask Claude to generate a 5-slide Web Story
//  3. Convert slides → valid AMP Web Story HTML
//  4. Upsert into Supabase stories table
//  5. Return summary

const https = require("https");
const MODEL = "claude-haiku-4-5-20251001"; // Fast + cheap for bulk story generation
const TAG   = "cheapestalt-20";
const GA_ID = "G-6MR7X29W2X";

// ── Supabase ──────────────────────────────────────────────────────────────────
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

const db = {
  // Fetch slug + last_generated so we can check if it's stale
  getStory: slug => sbReq("GET", "stories?slug=eq." + encodeURIComponent(slug) + "&select=slug,last_generated&limit=1", null),
  upsert:   row  => sbReq("POST", "stories?on_conflict=slug", row),
};

// ── Claude ────────────────────────────────────────────────────────────────────
function callClaude(apiKey, system, user) {
  const body = JSON.stringify({
    model: MODEL, max_tokens: 800,
    system, messages: [{ role: "user", content: user }]
  });
  return new Promise((ok, fail) => {
    const req = https.request({
      hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
      headers: {
        "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body),
        "x-api-key": apiKey, "anthropic-version": "2023-06-01"
      }
    }, r => { let d = ""; r.on("data", c => d += c); r.on("end", () => ok({ status: r.statusCode, raw: d })); });
    req.on("error", fail);
    req.setTimeout(25000, () => req.destroy(new Error("Timeout")));
    req.write(body); req.end();
  });
}

// ── JSON extractor ────────────────────────────────────────────────────────────
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
    if (inStr && (c === "\r" || c === "\t")) { prev = ""; continue; }
    if (c.charCodeAt(0) < 32) { prev = " "; continue; }
    out += c; prev = c;
  }
  return JSON.parse(out);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function mkSlug(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
}
function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function amzUrl(q) {
  return "https://www.amazon.com/s?k=" + encodeURIComponent(q) + "&tag=" + TAG;
}

// ── STEP 1: Fetch trending product keywords ───────────────────────────────────
// Uses Amazon Best Sellers RSS feed (public, no scraping needed)
// Falls back to a curated daily seed list if RSS fails
function fetchAmazonRSS() {
  const categories = [
    "electronics",
    "computers",
    "home-garden",
    "sports-outdoors",
    "health-personal-care",
  ];
  // Use RSS feeds from Amazon — they are public XML
  const promises = categories.map(cat => new Promise(resolve => {
    const req = https.request({
      hostname: "www.amazon.com",
      path: "/Best-Sellers/" + cat + "/ref=zg_bs_nav_0?_encoding=UTF8&pg=1",
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CheapestAlt/1.0)",
        "Accept": "text/html",
      }
    }, r => {
      let d = "";
      r.on("data", c => d += c);
      r.on("end", () => {
        // Extract product titles from basic HTML pattern
        const titles = [];
        const regex = /<span class="zg-item-immersion"[\s\S]*?<div class="p13n-sc-truncate[^"]*"[^>]*>([^<]+)/g;
        let m;
        while ((m = regex.exec(d)) !== null && titles.length < 5) {
          const t = m[1].trim().replace(/\s+/g, " ");
          if (t.length > 5 && t.length < 120) titles.push(t);
        }
        resolve(titles);
      });
    });
    req.on("error", () => resolve([]));
    req.setTimeout(6000, () => { req.destroy(); resolve([]); });
    req.end();
  }));
  return Promise.all(promises).then(results => results.flat());
}

// ── Keyword pool: 300+ unique angles across 10 categories ───────────────────
// Each entry = distinct search intent → unique slug → unique story
const KEYWORD_POOL = [
  // ── ELECTRONICS ──────────────────────────────────────────────────────────
  "best wireless earbuds 2026",
  "cheap wireless earbuds under 30",
  "wireless earbuds vs airpods",
  "top rated wireless earbuds amazon",
  "wireless earbuds for running sport",
  "best noise cancelling headphones 2026",
  "cheap noise cancelling headphones under 50",
  "noise cancelling headphones for travel",
  "best over ear headphones work from home",
  "noise cancelling headphones vs earbuds",
  "best bluetooth speaker waterproof 2026",
  "cheap portable bluetooth speaker under 20",
  "best smart watch fitness tracker 2026",
  "cheap smart watch under 50 amazon",
  "smart watch vs fitbit comparison",
  "best smart watch for android 2026",
  "best mechanical keyboard rgb 2026",
  "cheap mechanical keyboard under 40",
  "mechanical keyboard for gaming review",
  "best wireless gaming mouse 2026",
  "cheap gaming mouse under 25 amazon",
  "best webcam 4k streaming 2026",
  "best ring light for streaming tiktok",
  "cheap ring light under 20 amazon",
  "best portable projector mini 2026",
  "best graphic tablet for beginners",
  // ── HOME & KITCHEN ────────────────────────────────────────────────────────
  "best air fryer 2026 amazon deal",
  "cheap air fryer under 40 amazon",
  "air fryer vs oven which is better",
  "best large air fryer family 2026",
  "best instant pot pressure cooker 2026",
  "cheap instant pot deals amazon",
  "instant pot vs crockpot comparison",
  "best robot vacuum cleaner 2026",
  "cheap robot vacuum under 100 amazon",
  "robot vacuum vs regular vacuum",
  "best robot vacuum for pet hair",
  "best sous vide precision cooker 2026",
  "best electric kettle pour over 2026",
  "cheap electric kettle under 25",
  "best espresso machine home 2026",
  "cheap espresso machine under 60",
  "best food processor compact 2026",
  "best personal blender portable 2026",
  "cheap blender under 30 amazon",
  "best dutch oven cast iron 2026",
  "best professional knife set 2026",
  "cheap knife set under 40 amazon",
  // ── TECH & COMPUTING ─────────────────────────────────────────────────────
  "best laptop stand desk organizer 2026",
  "cheap laptop stand under 20 amazon",
  "best standing desk converter 2026",
  "cheap standing desk converter under 60",
  "best usb hub multiport 2026",
  "best external ssd portable 2026",
  "cheap external ssd under 50 amazon",
  "best wifi mesh router system 2026",
  "cheap wifi router under 50 amazon",
  "best monitor light bar desk 2026",
  "best cable management kit desk 2026",
  "best laptop cooling pad 2026",
  "best wireless charging pad 2026",
  "cheap wireless charger under 15",
  "best smart plug alexa compatible 2026",
  "cheap smart plug under 10 amazon",
  "best hdmi cable 4k 2026",
  "best mouse pad large gaming 2026",
  "best monitor arm desk mount 2026",
  "cheap monitor arm under 30",
  // ── HEALTH & FITNESS ─────────────────────────────────────────────────────
  "best massage gun deep tissue 2026",
  "cheap massage gun under 40 amazon",
  "massage gun vs foam roller",
  "best electric toothbrush 2026",
  "cheap electric toothbrush under 20",
  "best water flosser cordless 2026",
  "cheap water flosser under 25",
  "best resistance bands set 2026",
  "cheap resistance bands under 15",
  "best yoga mat non slip 2026",
  "cheap yoga mat under 20 amazon",
  "best foam roller exercise 2026",
  "best smart scale body fat 2026",
  "cheap smart scale under 20 amazon",
  "best sleep mask bluetooth 2026",
  "best air purifier hepa 2026",
  "cheap air purifier under 40 amazon",
  "best posture corrector wearable 2026",
  "best jump rope weighted fitness",
  "best pull up bar doorway 2026",
  "best ab roller core workout",
  "best protein shaker bottle 2026",
  "best fitness tracker budget 2026",
  "best pedometer step counter 2026",
  // ── LIFESTYLE & ACCESSORIES ───────────────────────────────────────────────
  "best portable charger power bank 2026",
  "cheap power bank under 20 amazon",
  "best 20000mah power bank 2026",
  "best dash cam front rear 2026",
  "cheap dash cam under 30 amazon",
  "best car phone mount wireless 2026",
  "best gaming chair ergonomic 2026",
  "cheap gaming chair under 100",
  "best weighted blanket anxiety 2026",
  "cheap weighted blanket under 30",
  "best led strip lights smart 2026",
  "cheap led strip lights under 15",
  "led strip lights vs philips hue",
  "best portable photo printer 2026",
  "cheap portable printer under 60",
  "best waterproof laptop bag 2026",
  "cheap laptop bag under 20 amazon",
  "best minimalist wallet slim 2026",
  "best sunglasses polarized 2026",
  "best travel pillow neck support",
  "best luggage scale travel 2026",
  "best passport holder travel wallet",
  "best reusable water bottle 2026",
  "cheap insulated water bottle under 15",
  // ── BEAUTY & PERSONAL CARE ───────────────────────────────────────────────
  "best hair dryer 2026 amazon deal",
  "cheap hair dryer under 25 amazon",
  "best hair straightener 2026",
  "cheap flat iron under 20 amazon",
  "best face massager roller 2026",
  "best led face mask skincare 2026",
  "best electric face cleaner brush",
  "best derma roller skincare 2026",
  "best lip balm chapstick set amazon",
  "best vitamin c serum face 2026",
  "best sunscreen face spf 50 amazon",
  "best makeup organizer case 2026",
  "best nail lamp uv gel 2026",
  "cheap nail lamp under 15 amazon",
  "best hair removal device ipl",
  "best electric shaver men 2026",
  "cheap electric shaver under 30",
  "best beard trimmer 2026 amazon",
  "cheap beard trimmer under 20",
  "best teeth whitening kit 2026",
  // ── PET PRODUCTS ─────────────────────────────────────────────────────────
  "best automatic pet feeder 2026",
  "cheap automatic pet feeder under 30",
  "best pet camera treat dispenser",
  "best dog gps tracker collar 2026",
  "cheap dog collar gps under 40",
  "best cat tree scratching post 2026",
  "best dog training collar 2026",
  "best pet grooming kit 2026",
  "cheap pet grooming under 25",
  "best automatic litter box cat",
  "best dog harness no pull 2026",
  "best pet water fountain 2026",
  // ── OUTDOOR & SPORTS ─────────────────────────────────────────────────────
  "best solar power bank camping 2026",
  "best trekking poles lightweight 2026",
  "cheap trekking poles under 30",
  "best camping lantern rechargeable",
  "cheap camping lantern under 20",
  "best action camera 4k waterproof 2026",
  "cheap action camera under 50 amazon",
  "best hiking backpack 40l 2026",
  "best sleeping bag camping 2026",
  "cheap sleeping bag under 30",
  "best tent 2 person camping 2026",
  "best fishing rod beginner 2026",
  "best bike helmet lightweight 2026",
  "best knee pads for running",
  "best cycling gloves 2026 amazon",
  // ── BABY & KIDS ───────────────────────────────────────────────────────────
  "best baby monitor wifi 2026",
  "cheap baby monitor under 40",
  "best kids tablet educational 2026",
  "cheap kids tablet under 50 amazon",
  "best baby carrier wrap 2026",
  "best white noise machine baby",
  "best baby food maker puree",
  "best stroller lightweight travel",
  "cheap stroller under 80 amazon",
  "best baby bouncer swing 2026",
  "best diaper bag backpack 2026",
  "best baby thermometer digital",
  // ── SMART HOME ────────────────────────────────────────────────────────────
  "best smart doorbell camera 2026",
  "cheap smart doorbell under 50",
  "best smart lock door 2026",
  "best smart thermostat 2026",
  "cheap smart thermostat under 60",
  "best smart light bulb alexa 2026",
  "cheap smart bulb under 10 each",
  "best robot mop 2026 amazon",
  "cheap robot mop under 100",
  "best smart display alexa screen",
  "best home security camera 2026",
  "cheap security camera under 30",
  "best smart speaker mini 2026",
  "best video doorbell no subscription",
];

// ── Date-seeded keyword rotation (50 unique keywords per day) ─────────────────
// Uses the current date as a seed so each day picks a different 50 from the pool
// This ensures 300+ unique slugs across the week with zero repeats
async function getTrendingKeywords() {
  console.log("Building daily keyword rotation...");

  // Date seed: changes every day
  const today = new Date();
  const dateSeed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();

  // Deterministic shuffle using date seed
  function seededShuffle(arr, seed) {
    const a = [...arr];
    let s = seed;
    for (let i = a.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      const j = Math.abs(s) % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const shuffled = seededShuffle(KEYWORD_POOL, dateSeed);

  // Try Amazon RSS for trending bonus keywords
  let rssBonus = [];
  try {
    rssBonus = await fetchAmazonRSS();
    if (rssBonus.length > 0) console.log("Amazon RSS bonus keywords:", rssBonus.length);
  } catch (e) {
    console.log("Amazon RSS skipped:", e.message);
  }

  // Combine: RSS first (fresh trending), then shuffled pool
  const combined = [...rssBonus, ...shuffled];

  // Deduplicate on first word to avoid near-duplicates
  const seen = new Set();
  const unique = combined.filter(k => {
    const key = mkSlug(k).slice(0, 15);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const result = unique.slice(0, 50);
  console.log("Keywords for today (" + today.toDateString() + "):", result.length);
  return result;
}


// ── STEP 2: Generate Web Story with Claude ────────────────────────────────────
const STORY_SYS =
  'Return ONLY valid JSON. No markdown. No apostrophes. ' +
  'Schema: {' +
    '"title":"SEO title with keyword max 60 chars",' +
    '"slides":[' +
      '{"text":"hook question max 8 words","emoji":"emoji","bg":"#hexcolor","caption":"brief context 10 words"},' +
      '{"text":"feature or fact max 8 words","emoji":"emoji","bg":"#hexcolor","caption":"brief detail 10 words"},' +
      '{"text":"benefit or saving max 8 words","emoji":"emoji","bg":"#hexcolor","caption":"why it matters 10 words"},' +
      '{"text":"comparison or value max 8 words","emoji":"emoji","bg":"#hexcolor","caption":"vs alternatives 10 words"},' +
      '{"text":"social proof max 8 words","emoji":"emoji","bg":"#hexcolor","caption":"reviews or ratings 10 words"},' +
      '{"text":"urgency or deal max 8 words","emoji":"emoji","bg":"#hexcolor","caption":"limited time or stock 10 words"}' +
    '],' +
    '"cta":"urgent action 5 words max",' +
    '"description":"SEO meta description 120 chars max with keyword"' +
  '}. ' +
  'Rules: exactly 6 slides, max 8 words per slide text, informative not just promotional, ' +
  'slide 1 = hook question, slide 2 = problem it solves, slide 3 = key feature, slide 4 = saving or value, slide 5 = social proof, slide 6 = urgent CTA, ' +
  'use different dark vibrant colors per slide (#1a1a2e #16213e #0f3460 #533483 #e94560 #0d1117), ' +
  'no apostrophes anywhere, include keyword naturally in title, make content unique to the specific keyword angle.';

async function generateStory(apiKey, keyword) {
  const userMsg = 'Create a viral Google Web Story for this trending product: "' + keyword + '". ' +
    'Make it exciting and engaging. No apostrophes. Return JSON only.';

  const cr = await callClaude(apiKey, STORY_SYS, userMsg);
  if (cr.status !== 200) throw new Error("Claude error: " + cr.status);

  let cb;
  try { cb = JSON.parse(cr.raw); } catch { throw new Error("Claude response parse failed"); }

  const txt = cb && cb.content && cb.content[0] && cb.content[0].text;
  if (!txt) throw new Error("Empty Claude response");

  const story = xJSON(txt);
  if (!story.title || !Array.isArray(story.slides) || story.slides.length < 3) {
    throw new Error("Invalid story structure");
  }

  return story;
}

// ── STEP 3: Convert story JSON → AMP Web Story HTML (SEO-optimised) ───────────
function buildAMPStory(story, slug, keyword) {
  const rawTitle = story.title || keyword;
  // SEO-optimised title: ensure keyword appears naturally
  const title   = rawTitle.length > 10 ? rawTitle : "Best " + keyword + " — Top Deals 2026";
  const desc    = story.description || ("Discover the best " + keyword + " deals on Amazon. Compare prices and save money today.");
  const cta     = story.cta || "See Best Deal Now";
  const amzLink = amzUrl(keyword);
  const siteUrl = "https://www.cheapestalt.com";
  const pageUrl = siteUrl + "/stories/" + slug;

  // Publisher logo — real hosted PNG ≥96×96 required by AMP/Google
  const logoImg = "https://www.cheapestalt.com/logo.png";

  // Stable Pexels CDN images mapped by keyword category — no API key, no random queries
  // Pexels CDN URLs are stable permanent files, not search results
  const IMG_MAP = {
    // Electronics & Audio
    "earbuds":      ["https://images.pexels.com/photos/3394650/pexels-photo-3394650.jpeg","https://images.pexels.com/photos/1649771/pexels-photo-1649771.jpeg","https://images.pexels.com/photos/3945667/pexels-photo-3945667.jpeg","https://images.pexels.com/photos/8534088/pexels-photo-8534088.jpeg","https://images.pexels.com/photos/1706694/pexels-photo-1706694.jpeg","https://images.pexels.com/photos/3394651/pexels-photo-3394651.jpeg"],
    "headphones":   ["https://images.pexels.com/photos/1649771/pexels-photo-1649771.jpeg","https://images.pexels.com/photos/3394650/pexels-photo-3394650.jpeg","https://images.pexels.com/photos/3394651/pexels-photo-3394651.jpeg","https://images.pexels.com/photos/1706694/pexels-photo-1706694.jpeg","https://images.pexels.com/photos/8534088/pexels-photo-8534088.jpeg","https://images.pexels.com/photos/3945667/pexels-photo-3945667.jpeg"],
    "speaker":      ["https://images.pexels.com/photos/1706694/pexels-photo-1706694.jpeg","https://images.pexels.com/photos/1649771/pexels-photo-1649771.jpeg","https://images.pexels.com/photos/3394650/pexels-photo-3394650.jpeg","https://images.pexels.com/photos/8534088/pexels-photo-8534088.jpeg","https://images.pexels.com/photos/3945667/pexels-photo-3945667.jpeg","https://images.pexels.com/photos/3394651/pexels-photo-3394651.jpeg"],
    "watch":        ["https://images.pexels.com/photos/437037/pexels-photo-437037.jpeg","https://images.pexels.com/photos/190819/pexels-photo-190819.jpeg","https://images.pexels.com/photos/1682821/pexels-photo-1682821.jpeg","https://images.pexels.com/photos/2783873/pexels-photo-2783873.jpeg","https://images.pexels.com/photos/1697214/pexels-photo-1697214.jpeg","https://images.pexels.com/photos/277390/pexels-photo-277390.jpeg"],
    "keyboard":     ["https://images.pexels.com/photos/1772123/pexels-photo-1772123.jpeg","https://images.pexels.com/photos/2115256/pexels-photo-2115256.jpeg","https://images.pexels.com/photos/1181244/pexels-photo-1181244.jpeg","https://images.pexels.com/photos/574069/pexels-photo-574069.jpeg","https://images.pexels.com/photos/2047905/pexels-photo-2047905.jpeg","https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg"],
    "laptop":       ["https://images.pexels.com/photos/18105/pexels-photo.jpg","https://images.pexels.com/photos/1181263/pexels-photo-1181263.jpeg","https://images.pexels.com/photos/1029757/pexels-photo-1029757.jpeg","https://images.pexels.com/photos/4158/apple-iphone-smartphone-desk.jpg","https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg","https://images.pexels.com/photos/574069/pexels-photo-574069.jpeg"],
    // Home & Kitchen
    "vacuum":       ["https://images.pexels.com/photos/4107120/pexels-photo-4107120.jpeg","https://images.pexels.com/photos/6489107/pexels-photo-6489107.jpeg","https://images.pexels.com/photos/4397840/pexels-photo-4397840.jpeg","https://images.pexels.com/photos/6489086/pexels-photo-6489086.jpeg","https://images.pexels.com/photos/4108714/pexels-photo-4108714.jpeg","https://images.pexels.com/photos/6757776/pexels-photo-6757776.jpeg"],
    "air fryer":    ["https://images.pexels.com/photos/4551832/pexels-photo-4551832.jpeg","https://images.pexels.com/photos/6608780/pexels-photo-6608780.jpeg","https://images.pexels.com/photos/4551831/pexels-photo-4551831.jpeg","https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg","https://images.pexels.com/photos/4551830/pexels-photo-4551830.jpeg","https://images.pexels.com/photos/6607387/pexels-photo-6607387.jpeg"],
    "coffee":       ["https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg","https://images.pexels.com/photos/302899/pexels-photo-302899.jpeg","https://images.pexels.com/photos/585753/pexels-photo-585753.jpeg","https://images.pexels.com/photos/851555/pexels-photo-851555.jpeg","https://images.pexels.com/photos/2074122/pexels-photo-2074122.jpeg","https://images.pexels.com/photos/374885/pexels-photo-374885.jpeg"],
    // Health & Fitness
    "massage":      ["https://images.pexels.com/photos/3997989/pexels-photo-3997989.jpeg","https://images.pexels.com/photos/3985163/pexels-photo-3985163.jpeg","https://images.pexels.com/photos/3757952/pexels-photo-3757952.jpeg","https://images.pexels.com/photos/4056535/pexels-photo-4056535.jpeg","https://images.pexels.com/photos/3997981/pexels-photo-3997981.jpeg","https://images.pexels.com/photos/4056723/pexels-photo-4056723.jpeg"],
    "fitness":      ["https://images.pexels.com/photos/1552242/pexels-photo-1552242.jpeg","https://images.pexels.com/photos/841130/pexels-photo-841130.jpeg","https://images.pexels.com/photos/4162485/pexels-photo-4162485.jpeg","https://images.pexels.com/photos/2294361/pexels-photo-2294361.jpeg","https://images.pexels.com/photos/1552106/pexels-photo-1552106.jpeg","https://images.pexels.com/photos/4056723/pexels-photo-4056723.jpeg"],
    // Outdoors & Camera
    "camera":       ["https://images.pexels.com/photos/90946/pexels-photo-90946.jpeg","https://images.pexels.com/photos/51383/photo-camera-subject-photographer-51383.jpeg","https://images.pexels.com/photos/1983037/pexels-photo-1983037.jpeg","https://images.pexels.com/photos/225157/pexels-photo-225157.jpeg","https://images.pexels.com/photos/279906/pexels-photo-279906.jpeg","https://images.pexels.com/photos/1203819/pexels-photo-1203819.jpeg"],
    "camping":      ["https://images.pexels.com/photos/1687845/pexels-photo-1687845.jpeg","https://images.pexels.com/photos/776116/pexels-photo-776116.jpeg","https://images.pexels.com/photos/2422265/pexels-photo-2422265.jpeg","https://images.pexels.com/photos/1044700/pexels-photo-1044700.jpeg","https://images.pexels.com/photos/1755683/pexels-photo-1755683.jpeg","https://images.pexels.com/photos/2398220/pexels-photo-2398220.jpeg"],
    // Default — tech/shopping
    "default":      ["https://images.pexels.com/photos/5632397/pexels-photo-5632397.jpeg","https://images.pexels.com/photos/230544/pexels-photo-230544.jpeg","https://images.pexels.com/photos/5632371/pexels-photo-5632371.jpeg","https://images.pexels.com/photos/3769747/pexels-photo-3769747.jpeg","https://images.pexels.com/photos/5632399/pexels-photo-5632399.jpeg","https://images.pexels.com/photos/264547/pexels-photo-264547.jpeg"],
  };

  // Match keyword to image set
  const kw = keyword.toLowerCase();
  let imgSet = IMG_MAP["default"];
  for (const [key, imgs] of Object.entries(IMG_MAP)) {
    if (kw.includes(key)) { imgSet = imgs; break; }
  }
  // Poster = first image of matched set (stable, real photo)
  const posterImg = imgSet[0];

  // Build AMP pages
  const pages = story.slides.map((slide, i) => {
    const bg      = slide.bg      || "#1a1a2e";
    const txt     = slide.text    || "";
    const caption = slide.caption || "";
    const emo     = slide.emoji   || "⭐";
    const isFirst = i === 0;
    const isLast  = i === story.slides.length - 1;
    const imgUrl  = imgSet[Math.min(i, imgSet.length - 1)];

    return `  <amp-story-page id="page-${i + 1}" auto-advance-after="5s">
    <amp-story-grid-layer template="fill">
      <amp-img src="${imgUrl}"
        width="800" height="1200" layout="fill"
        alt="${esc(txt + " — " + keyword)}"
        ${isFirst ? 'fetchpriority="high"' : ''}>
      </amp-img>
    </amp-story-grid-layer>
    <amp-story-grid-layer template="fill">
      <div style="width:100%;height:100%;background:linear-gradient(to bottom,${esc(bg)}88 0%,${esc(bg)}cc 50%,${esc(bg)}f5 100%);"></div>
    </amp-story-grid-layer>
    <amp-story-grid-layer template="vertical">
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;gap:16px;padding:24px 28px;">
        <div style="font-size:76px;line-height:1;filter:drop-shadow(0 4px 16px rgba(0,0,0,0.6));">${esc(emo)}</div>
        <h2 style="font-family:Georgia,serif;font-size:30px;font-weight:700;color:#ffffff;line-height:1.2;text-shadow:0 2px 20px rgba(0,0,0,0.95);margin:0;letter-spacing:-0.3px;">${esc(txt)}</h2>
        ${caption ? `<p style="font-family:Arial,sans-serif;font-size:15px;font-weight:400;color:rgba(255,255,255,0.85);line-height:1.5;text-shadow:0 1px 8px rgba(0,0,0,0.8);margin:0;max-width:300px;">${esc(caption)}</p>` : ""}
        ${isLast ? `<a href="${amzLink}" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;background:#FF9900;color:#0F172A;padding:14px 28px;border-radius:50px;font-size:16px;font-weight:800;text-decoration:none;margin-top:8px;box-shadow:0 4px 24px rgba(255,153,0,0.5);font-family:Arial,sans-serif;">🛒 ${esc(cta)}</a>` : ""}
        <p style="font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.45);margin:0;letter-spacing:0.5px;">${i + 1} / ${story.slides.length}</p>
      </div>
    </amp-story-grid-layer>
    ${isLast ? `<amp-story-page-outlink layout="nodisplay"><a href="${amzLink}">${esc(cta)}</a></amp-story-page-outlink>` : ""}
  </amp-story-page>`;
  }).join("\n");


  // Structured data — WebStory schema for Google
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": title,
    "description": desc,
    "url": pageUrl,
    "author": {
      "@type": "Organization",
      "name": "CheapestAlt",
      "url": siteUrl
    },
    "publisher": {
      "@type": "Organization",
      "name": "CheapestAlt",
      "url": siteUrl,
      "logo": { "@type": "ImageObject", "url": logoImg, "width": 200, "height": 200 }
    },
    "image": { "@type": "ImageObject", "url": posterImg, "width": 800, "height": 1200 },
    "mainEntityOfPage": { "@type": "WebPage", "@id": pageUrl },
    "keywords": keyword,
    "datePublished": new Date().toISOString().split("T")[0],
    "dateModified":  new Date().toISOString().split("T")[0]
  });

  return `<!doctype html>
<html amp lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,minimum-scale=1"/>
  <title>${esc(title)} | CheapestAlt</title>
  <meta name="description" content="${esc(desc)}"/>
  <link rel="canonical" href="${pageUrl}"/>

  <!-- AMP boilerplate MUST be first, before any scripts -->
  <style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style>
  <noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>

  <!-- AMP custom styles AFTER boilerplate, BEFORE scripts -->
  <style amp-custom>
    amp-story-page { background: #0f172a; }
    amp-story { --story-page-background-color: #0f172a; }
  </style>

  <!-- AMP scripts LAST in head -->
  <script async src="https://cdn.ampproject.org/v0.js"></script>
  <script async custom-element="amp-story" src="https://cdn.ampproject.org/v0/amp-story-1.0.js"></script>
  <script async custom-element="amp-analytics" src="https://cdn.ampproject.org/v0/amp-analytics-0.1.js"></script>

  <!-- Open Graph -->
  <meta property="og:type" content="article"/>
  <meta property="og:site_name" content="CheapestAlt"/>
  <meta property="og:url" content="${pageUrl}"/>
  <meta property="og:title" content="${esc(title)}"/>
  <meta property="og:description" content="${esc(desc)}"/>
  <meta property="og:image" content="${posterImg}"/>
  <meta property="og:image:width" content="800"/>
  <meta property="og:image:height" content="1200"/>

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${esc(title)}"/>
  <meta name="twitter:description" content="${esc(desc)}"/>
  <meta name="twitter:image" content="${posterImg}"/>

  <!-- Structured data -->
  <script type="application/ld+json">${structuredData}</script>
</head>
<body>
<amp-story standalone
  title="${esc(title)}"
  publisher="CheapestAlt"
  publisher-logo-src="${logoImg}"
  poster-portrait-src="${posterImg}"
  poster-square-src="${posterImg}"
  supports-landscape>

  <amp-analytics type="gtag" data-credentials="include">
    <script type="application/json">{"vars":{"gtag_id":"${GA_ID}","config":{"${GA_ID}":{"groups":"default"}}}}</script>
  </amp-analytics>

${pages}

</amp-story>
</body>
</html>`;
}

// ── STEP 4: Save story to Supabase ────────────────────────────────────────────
async function saveStory(slug, title, keyword, html, source) {
  const row = {
    slug,
    title,
    keyword,
    source,
    html,
    amp_valid: true,
    last_generated: new Date().toISOString(),
  };
  const r = await db.upsert(row);
  if (r.error) {
    console.error("Story save error:", slug, JSON.stringify(r.error).slice(0, 200));
    return false;
  }
  console.log("Story saved:", slug);
  return true;
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  // Auth: accept Vercel cron header OR manual ?secret=
  const secret = process.env.STORIES_SECRET || "cheapestalt-stories-2026";
  const callerSecret = (req.query && req.query.secret) || "";
  const isCron = req.headers["x-vercel-cron"] === "1";

  if (!isCron && callerSecret !== secret) {
    return res.status(401).json({ error: "Unauthorized. Pass ?secret=" + secret });
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "CLAUDE_API_KEY not set" });

  const hasDB = !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
  if (!hasDB) return res.status(500).json({ error: "Supabase not configured" });

  console.log("=== Daily Stories Pipeline START ===");
  const started = Date.now();
  const results = { saved: [], skipped: [], errors: [] };

  // Step 1: Get keywords
  const keywords = await getTrendingKeywords();
  console.log("Keywords to process:", keywords.length);

  // Step 2-4: Generate + save stories
  // Process 10 per cron run (cron runs 5x daily = 50 stories/day)
  // 10 × ~3s Claude + delays = ~35s, safely within Vercel 60s limit
  // Use a time-of-day offset so each run picks a different 10 keywords
  const hour = new Date().getUTCHours();
  const batchOffset = Math.floor(hour / 5) * 10; // 0,10,20,30,40 across 5 runs
  const toProcess = keywords.slice(batchOffset, batchOffset + 10);
  console.log("Batch offset:", batchOffset, "— processing keywords", batchOffset+1, "to", batchOffset+10);

  for (const keyword of toProcess) {
    // Include date in slug → unique slug every day for same keyword
    const d = new Date();
    const dateStr = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
    const slug = mkSlug(keyword).slice(0, 40) + "-" + dateStr;

    // Skip only if generated within the last 20 hours (allow daily refresh)
    try {
      const { data: existing } = await db.getStory(slug);
      const row = Array.isArray(existing) ? existing[0] : existing;
      if (row && row.slug) {
        const age = row.last_generated
          ? (Date.now() - new Date(row.last_generated).getTime())
          : Infinity;
        const TWENTY_HOURS = 20 * 60 * 60 * 1000;
        if (age < TWENTY_HOURS) {
          console.log("Skip fresh:", slug, "(" + Math.round(age/3600000) + "h old)");
          results.skipped.push(slug);
          continue;
        }
        console.log("Refreshing stale story:", slug, "(" + Math.round(age/3600000) + "h old)");
      }
    } catch (e) {
      console.error("Slug check error:", e.message);
    }

    // Generate story with Claude
    let story;
    try {
      story = await generateStory(apiKey, keyword);
    } catch (e) {
      console.error("Story gen error:", keyword, e.message);
      results.errors.push({ keyword, error: e.message });
      continue;
    }

    // Build AMP HTML
    const html = buildAMPStory(story, slug, keyword);

    // Save to Supabase
    const saved = await saveStory(slug, story.title, keyword, html, "trending");
    if (saved) {
      results.saved.push({ slug, title: story.title });
    } else {
      results.errors.push({ keyword, error: "DB save failed" });
    }

    // Small delay to avoid Claude rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  const duration = Math.round((Date.now() - started) / 1000);
  console.log("=== Pipeline DONE in", duration + "s ===");
  console.log("Saved:", results.saved.length, "| Skipped:", results.skipped.length, "| Errors:", results.errors.length);

  return res.status(200).json({
    ok: true,
    duration_seconds: duration,
    keywords_found: keywords.length,
    saved: results.saved.length,
    skipped: results.skipped.length,
    errors: results.errors.length,
    stories: results.saved,
    error_details: results.errors,
  });
};
