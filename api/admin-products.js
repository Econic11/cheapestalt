"use strict";
// api/admin-products.js
// GET  /admin/add-product  → admin form for generating affiliate product articles
// POST /admin/add-product  → call Claude API, save to Supabase, return JSON

const https = require("https");

const MODEL = "claude-sonnet-4-6";
const SITE  = "https://cheapestalt.com";
const GA    = "G-6MR7X29W2X";

// ── Supabase ──────────────────────────────────────────────────────────────────
function sbReq(method, path, body, extraHeaders) {
  const base = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return Promise.resolve({ data: null, error: "no-config" });
  const host = base.replace(/^https?:\/\//, "");
  const pl   = body ? JSON.stringify(body) : null;
  return new Promise(resolve => {
    const h = {
      "apikey":        key,
      "Authorization": "Bearer " + key,
      "Content-Type":  "application/json",
      "Prefer":        "return=representation,resolution=merge-duplicates",
      ...(extraHeaders || {}),
    };
    if (pl) h["Content-Length"] = Buffer.byteLength(pl);
    const req = https.request(
      { hostname: host, path: "/rest/v1/" + path, method, headers: h },
      r => {
        let d = ""; r.on("data", c => d += c);
        r.on("end", () => {
          let p = null; try { p = JSON.parse(d); } catch {}
          resolve(r.statusCode >= 400 ? { data: null, error: p || d.slice(0, 300) } : { data: p, error: null });
        });
      }
    );
    req.on("error", e => resolve({ data: null, error: e.message }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ data: null, error: "Supabase timeout" }); });
    if (pl) req.write(pl);
    req.end();
  });
}

// ── Claude API ────────────────────────────────────────────────────────────────
function callClaude(apiKey, systemPrompt, userPrompt) {
  const body = JSON.stringify({
    model:      MODEL,
    max_tokens: 4000,
    system:     systemPrompt,
    messages:   [{ role: "user", content: userPrompt }],
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.anthropic.com",
      path:     "/v1/messages",
      method:   "POST",
      headers:  {
        "Content-Type":      "application/json",
        "Content-Length":    Buffer.byteLength(body),
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
    }, r => {
      let d = ""; r.on("data", c => d += c);
      r.on("end", () => resolve({ status: r.statusCode, raw: d }));
    });
    req.on("error", reject);
    req.setTimeout(55000, () => req.destroy(new Error("Claude timeout")));
    req.write(body);
    req.end();
  });
}

// Strip markdown fences and extract JSON from Claude's response text
function extractJSON(text) {
  let s = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a !== -1 && b !== -1) s = s.slice(a, b + 1);
  // Fix common JSON issues from LLMs
  s = s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(s);
}

function mkSlug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", d => chunks.push(d));
    req.on("end",  () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ── Build article_body HTML from Claude's structured JSON ─────────────────────
// This is the pre-rendered HTML stored in Supabase — products.js renders it verbatim.
function buildArticleBody(data, affiliateLink) {
  const ctaStyle =
    "display:inline-block;background:#1A56DB;color:#fff;padding:14px 28px;" +
    "border-radius:10px;font-weight:700;text-decoration:none;font-size:16px;";
  const ctaBtn = (label) =>
    '<a href="' + esc(affiliateLink) + '" target="_blank" rel="noopener sponsored" style="' + ctaStyle + '">' +
    esc(label) + " →</a>";

  // description_html is Claude-generated HTML (<p> tags) — rendered as-is
  const descHtml = data.description_html || "<p>No description available.</p>";

  // pros — plain text, escaped
  const prosItems = (Array.isArray(data.pros) ? data.pros : []).map(p =>
    '<li style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">' +
    '<span style="color:#16A34A;font-size:18px;line-height:1.3;flex-shrink:0;">&#10003;</span>' +
    "<span>" + esc(p) + "</span></li>"
  ).join("");

  // cons — plain text, escaped
  const consItems = (Array.isArray(data.cons) ? data.cons : []).map(c =>
    '<li style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">' +
    '<span style="color:#DC2626;font-size:18px;line-height:1.3;flex-shrink:0;">&#10007;</span>' +
    "<span>" + esc(c) + "</span></li>"
  ).join("");

  // faq — HTML <details> accordion; supports both {question,answer} and {q,a} keys
  const faqItems = (Array.isArray(data.faq) ? data.faq : []).map(f => {
    const q = f.question || f.q || "";
    const a = f.answer   || f.a || "";
    return (
      '<details style="border:1px solid #E5E7EB;border-radius:8px;margin-bottom:10px;overflow:hidden;">' +
      '<summary style="padding:16px;cursor:pointer;font-weight:600;font-size:15px;color:#111827;' +
      'list-style:none;display:flex;justify-content:space-between;align-items:center;">' +
      esc(q) +
      '<span style="font-size:20px;color:#6B7280;margin-left:12px;flex-shrink:0;">+</span></summary>' +
      '<div style="padding:0 16px 16px;font-size:15px;color:#374151;line-height:1.7;">' + esc(a) + "</div>" +
      "</details>"
    );
  }).join("");

  const H2 = (text) =>
    '<h2 style="font-family:Syne,system-ui,sans-serif;font-size:26px;font-weight:700;' +
    'color:#111827;margin-bottom:20px;">' + esc(text) + "</h2>";

  return (
    // Description
    '<section id="description" style="margin-bottom:48px;">\n' +
    H2("Why " + (data.seo_title || "") + " Is Worth It") + "\n" +
    descHtml + "\n" +
    '<p style="margin-top:24px;">' + ctaBtn("Check Price on Amazon") + "</p>\n" +
    "</section>\n" +

    // Pros & Cons
    '<section id="pros-cons" style="margin-bottom:48px;">\n' +
    H2("Pros &amp; Cons") + "\n" +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">\n' +
    '<div style="background:#F0FDF4;border:1.5px solid #BBF7D0;border-radius:12px;padding:24px;">' +
    '<h3 style="font-family:Syne,system-ui,sans-serif;font-size:16px;font-weight:700;' +
    'color:#166534;margin-bottom:14px;">Pros</h3>' +
    '<ul style="list-style:none;padding:0;margin:0;">' + prosItems + "</ul></div>\n" +
    '<div style="background:#FEF2F2;border:1.5px solid #FECACA;border-radius:12px;padding:24px;">' +
    '<h3 style="font-family:Syne,system-ui,sans-serif;font-size:16px;font-weight:700;' +
    'color:#991B1B;margin-bottom:14px;">Cons</h3>' +
    '<ul style="list-style:none;padding:0;margin:0;">' + consItems + "</ul></div>\n" +
    "</div>\n</section>\n" +

    // FAQ
    '<section id="faq" style="margin-bottom:48px;">\n' +
    H2("Frequently Asked Questions") + "\n" +
    faqItems + "\n" +
    "</section>\n"
  );
}

// ── Admin form HTML ───────────────────────────────────────────────────────────
function buildAdminPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Add Affiliate Product — CheapestAlt Admin</title>
<meta name="robots" content="noindex,nofollow"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"DM Sans",system-ui,sans-serif;background:#F8FAFC;color:#1E293B;min-height:100vh}
.hdr{background:#fff;border-bottom:1.5px solid #E2E8F0;padding:0 24px;height:58px;display:flex;align-items:center;justify-content:space-between}
.logo{font-size:18px;font-weight:800;color:#111827;text-decoration:none}
.logo em{color:#1A56DB;font-style:normal}
.logo-sub{font-size:12px;color:#94A3B8;font-weight:400;margin-left:8px}
.hdr-link{color:#64748B;font-size:13px;text-decoration:none}
.hdr-link:hover{color:#1A56DB}
.wrap{max-width:680px;margin:48px auto;padding:0 24px 80px}
h1{font-size:26px;font-weight:700;color:#111827;margin-bottom:6px}
.sub{color:#64748B;font-size:14px;line-height:1.6;margin-bottom:32px}
.field{margin-bottom:20px}
label{display:block;font-size:14px;font-weight:600;color:#374151;margin-bottom:6px}
.hint{font-size:12px;color:#9CA3AF;margin-top:4px}
textarea,input[type=url]{width:100%;border:1.5px solid #D1D5DB;border-radius:8px;padding:12px 14px;font-family:inherit;font-size:15px;color:#1E293B;outline:none;background:#fff;transition:border-color .2s}
textarea{resize:vertical;min-height:90px}
textarea:focus,input:focus{border-color:#1A56DB;box-shadow:0 0 0 3px rgba(26,86,219,.12)}
.btn{display:block;width:100%;background:#1A56DB;color:#fff;border:none;border-radius:10px;padding:15px 28px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;transition:background .2s,transform .15s;margin-top:8px}
.btn:hover{background:#0F3A9B;transform:scale(1.01)}
.btn:disabled{background:#94A3B8;cursor:not-allowed;transform:none}
.spinner{display:none;text-align:center;padding:24px 0;color:#64748B;font-size:14px}
.spinner-ring{display:inline-block;width:20px;height:20px;border:3px solid #E2E8F0;border-top-color:#1A56DB;border-radius:50%;animation:spin .7s linear infinite;margin-right:10px;vertical-align:middle}
@keyframes spin{to{transform:rotate(360deg)}}
.result{display:none;padding:20px 24px;border-radius:10px;margin-top:24px;font-size:14px;line-height:1.7}
.result.success{background:#DCFCE7;border:1px solid #86EFAC;color:#166534}
.result.error{background:#FEE2E2;border:1px solid #FCA5A5;color:#991B1B}
.result a{color:#1A56DB;font-weight:600;word-break:break-all}
.divider{border:none;border-top:1px solid #E2E8F0;margin:32px 0}
.back{color:#64748B;font-size:13px;text-decoration:none}
.back:hover{color:#1A56DB}
@media(max-width:600px){.wrap{padding:0 16px 60px;margin-top:24px}h1{font-size:22px}}
</style>
</head>
<body>
<header class="hdr">
  <div>
    <a href="/admin" class="logo">Cheapest<em>Alt</em><span class="logo-sub">Admin</span></a>
  </div>
  <a href="/products" class="hdr-link">View Products →</a>
</header>

<main class="wrap">
  <h1>Generate Affiliate Product Article</h1>
  <p class="sub">Paste the Amazon product title and your affiliate link. Claude will write a full SEO article and save it as a <strong>draft</strong>. You then publish it from Supabase.</p>

  <form id="form" autocomplete="off">
    <div class="field">
      <label for="title">Amazon Product Title</label>
      <textarea id="title" name="amazon_title" placeholder="e.g. Govee RGBIC LED Strip Lights, 32.8ft Wi-Fi LED Lights with Music Sync, Color Changing..." required></textarea>
    </div>
    <div class="field">
      <label for="link">Your Affiliate Link</label>
      <input type="url" id="link" name="affiliate_link" placeholder="https://www.amazon.com/dp/XXXXXXXX?tag=cheapestalt-20" required/>
      <p class="hint">Must start with https://</p>
    </div>
    <button type="submit" class="btn" id="btn">Generate Article with Claude ✨</button>
  </form>

  <div class="spinner" id="spinner">
    <span class="spinner-ring"></span>Calling Claude — generating article (20–30 seconds)…
  </div>

  <div class="result" id="result"></div>

  <hr class="divider"/>
  <a href="/admin" class="back">← Back to Admin Dashboard</a>
</main>

<script>
document.getElementById("form").addEventListener("submit", async function(e) {
  e.preventDefault();

  var btn     = document.getElementById("btn");
  var spinner = document.getElementById("spinner");
  var result  = document.getElementById("result");

  var title = document.getElementById("title").value.trim();
  var link  = document.getElementById("link").value.trim();
  if (!title || !link) return;

  btn.disabled    = true;
  btn.textContent = "Generating…";
  spinner.style.display = "block";
  result.style.display  = "none";
  result.className      = "result";

  try {
    var res  = await fetch("/admin/add-product", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ amazon_title: title, affiliate_link: link })
    });
    var data = await res.json();

    spinner.style.display = "none";
    result.style.display  = "block";

    if (data.ok) {
      result.className = "result success";
      result.innerHTML =
        "<strong>✓ Article generated successfully!</strong><br/><br/>" +
        "<strong>Slug:</strong> " + data.slug + "<br/>" +
        "<strong>Draft URL:</strong> <a href='" + data.article_url + "' target='_blank'>" + data.article_url + "</a><br/><br/>" +
        "<em>Status is <strong>draft</strong>. Go to Supabase → affiliate_products → find this row → set status to <strong>published</strong> to make it live.</em>";
      document.getElementById("form").reset();
    } else {
      result.className = "result error";
      result.innerHTML = "<strong>✗ Error:</strong> " + (data.error || "Unknown error. Check Vercel logs.");
    }
  } catch (err) {
    spinner.style.display = "none";
    result.style.display  = "block";
    result.className      = "result error";
    result.innerHTML      = "<strong>✗ Network error:</strong> " + err.message;
  }

  btn.disabled    = false;
  btn.textContent = "Generate Article with Claude ✨";
});
</script>
</body>
</html>`;
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  // GET → serve the admin form
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(buildAdminPage());
  }

  // POST → generate article with Claude, save to Supabase
  if (req.method === "POST") {
    const apiKey    = process.env.CLAUDE_API_KEY;
    const supabaseU = process.env.SUPABASE_URL;
    const supabaseK = process.env.SUPABASE_ANON_KEY;

    if (!apiKey)    return res.status(500).json({ ok: false, error: "CLAUDE_API_KEY environment variable is not set" });
    if (!supabaseU) return res.status(500).json({ ok: false, error: "SUPABASE_URL environment variable is not set" });
    if (!supabaseK) return res.status(500).json({ ok: false, error: "SUPABASE_ANON_KEY environment variable is not set" });

    let body;
    try {
      body = JSON.parse((await readBody(req)).toString());
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }

    const amazonTitle   = (body.amazon_title   || "").trim();
    const affiliateLink = (body.affiliate_link || "").trim();

    if (!amazonTitle)   return res.status(400).json({ ok: false, error: "amazon_title is required" });
    if (!affiliateLink) return res.status(400).json({ ok: false, error: "affiliate_link is required" });

    // ── Step 1: Call Claude ────────────────────────────────────────────────────
    const systemPrompt =
      "You are an expert SEO copywriter and Amazon affiliate marketer. " +
      "Return ONLY a valid JSON object — no markdown, no backticks, no explanation, no text before or after the JSON. " +
      "The JSON must contain exactly these keys with these types:\n" +
      '  "seo_title"       : string  — compelling H1, includes product name + year 2025\n' +
      '  "seo_subtitle"    : string  — one benefit-focused sentence (max 120 chars)\n' +
      '  "meta_description": string  — SEO meta, max 155 chars, include key benefit + product name\n' +
      '  "slug"            : string  — URL-safe: lowercase letters, numbers, hyphens only, no spaces\n' +
      '  "description_html": string  — 3-4 paragraphs of HTML using <p> tags; professional review tone, SEO-friendly, no keyword stuffing\n' +
      '  "pros"            : array of exactly 5 strings — specific, concrete product benefits\n' +
      '  "cons"            : array of 2-3 strings — honest limitations or trade-offs\n' +
      '  "faq"             : array of exactly 5 objects, each with "question" (string) and "answer" (string) keys\n' +
      '  "related_keywords": array of exactly 3 short keyword strings for related Amazon searches\n';

    const userPrompt =
      "Write a full SEO affiliate product article for this Amazon product:\n\n" +
      "Product Title: " + amazonTitle + "\n\n" +
      "Requirements:\n" +
      "- seo_title: strong, compelling, includes the exact product name and the year 2025\n" +
      "- seo_subtitle: one sentence that leads with the biggest user benefit\n" +
      "- meta_description: under 155 characters, mention key benefit and product name\n" +
      "- slug: url-safe slug from the core product name (e.g. govee-led-strip-lights)\n" +
      "- description_html: 3-4 paragraphs in HTML <p> tags covering what the product does, who it is for, key features, and why it is worth buying. Write in a natural, professional review tone.\n" +
      "- pros: exactly 5 specific, concrete benefits a buyer would care about\n" +
      "- cons: 2-3 honest limitations that help the reader make an informed decision\n" +
      "- faq: exactly 5 questions people actually search before buying this type of product, with clear answers\n" +
      "- related_keywords: 3 short keyword phrases for related Amazon product searches\n\n" +
      "Return ONLY valid JSON. Do not include any text before or after the JSON object.";

    let claudeData;
    try {
      const cr = await callClaude(apiKey, systemPrompt, userPrompt);
      if (cr.status !== 200) {
        console.error("Claude HTTP error:", cr.status, cr.raw.slice(0, 300));
        return res.status(502).json({ ok: false, error: "Claude API returned status " + cr.status });
      }
      let parsed;
      try { parsed = JSON.parse(cr.raw); }
      catch { return res.status(502).json({ ok: false, error: "Could not parse Claude API response envelope" }); }

      const txt = parsed && parsed.content && parsed.content[0] && parsed.content[0].text;
      if (!txt) return res.status(502).json({ ok: false, error: "Claude returned an empty response" });

      try { claudeData = extractJSON(txt); }
      catch (e) {
        console.error("JSON extract failed. Raw text:", txt.slice(0, 500));
        return res.status(502).json({ ok: false, error: "Failed to extract JSON from Claude output: " + e.message });
      }
    } catch (e) {
      console.error("Claude call error:", e.message);
      return res.status(502).json({ ok: false, error: "Claude API call failed: " + e.message });
    }

    // ── Step 2: Build slug ─────────────────────────────────────────────────────
    // Prefer Claude's slug (already validated by the prompt), fall back to title
    const slug = mkSlug(claudeData.slug || claudeData.seo_title || amazonTitle);
    if (!slug) {
      return res.status(400).json({ ok: false, error: "Could not generate a URL slug from the product title" });
    }

    const articleUrl = SITE + "/products/" + slug;

    // ── Step 3: Build article_body HTML ───────────────────────────────────────
    const articleBody = buildArticleBody(claudeData, affiliateLink);

    // ── Step 4: Save to Supabase ───────────────────────────────────────────────
    const row = {
      amazon_title:     amazonTitle,
      affiliate_link:   affiliateLink,
      slug,
      seo_title:        claudeData.seo_title        || amazonTitle,
      seo_subtitle:     claudeData.seo_subtitle      || "",
      meta_description: (claudeData.meta_description || "").slice(0, 155),
      article_body:     articleBody,
      article_url:      articleUrl,
      status:           "draft",
    };

    const { error: dbErr } = await sbReq("POST", "affiliate_products?on_conflict=slug", row);
    if (dbErr) {
      console.error("Supabase save error:", JSON.stringify(dbErr).slice(0, 300));
      return res.status(500).json({
        ok:    false,
        error: "Database save failed: " + (typeof dbErr === "string" ? dbErr : JSON.stringify(dbErr)),
      });
    }

    console.log("Affiliate product saved:", slug);
    return res.status(200).json({ ok: true, slug, article_url: articleUrl });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
