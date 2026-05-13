"use strict";
// api/products.js
// GET /products          → published products index page
// GET /products/[slug]   → individual affiliate product article page

const https = require("https");

const SITE = "https://cheapestalt.com";
const GA   = "G-6MR7X29W2X";
const FAV  =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E" +
  "%3Crect width='32' height='32' rx='7' fill='%231A56DB'/%3E" +
  "%3Ctext x='16' y='22' font-family='Inter' font-size='13' font-weight='800' fill='white' text-anchor='middle'%3ECA%3C/text%3E" +
  "%3C/svg%3E";

// ── Supabase helper ───────────────────────────────────────────────────────────
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
          resolve(r.statusCode >= 400 ? { data: null, error: d.slice(0, 200) } : { data: p, error: null });
        });
      }
    );
    req.on("error", e => resolve({ data: null, error: e.message }));
    req.setTimeout(6000, () => { req.destroy(); resolve({ data: null, error: "timeout" }); });
    req.end();
  });
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// GA snippet reused on both pages
const GA_SCRIPT =
  '<script async src="https://www.googletagmanager.com/gtag/js?id=' + GA + '"></script>\n' +
  '<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}' +
  'gtag("js",new Date());gtag("config","' + GA + '");</script>\n';

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com"/>\n' +
  '<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>\n';

// ── Shared header/nav HTML ────────────────────────────────────────────────────
const HEADER =
  '<header style="background:#fff;border-bottom:1.5px solid #E2E8F0;padding:0 24px;height:58px;' +
  'display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;">\n' +
  '<div>' +
  '<a href="/" style="font-size:18px;font-weight:800;color:#111827;text-decoration:none;">' +
  'Cheapest<em style="color:#1A56DB;font-style:normal;">Alt</em></a>' +
  '<span style="font-size:11px;color:#94A3B8;display:block;font-weight:400;">Find cheaper Amazon alternatives</span>' +
  '</div>\n' +
  '<nav style="display:flex;gap:8px;">' +
  '<a href="/" style="color:#64748B;font-size:13px;font-weight:600;text-decoration:none;padding:6px 12px;border:1.5px solid #E2E8F0;border-radius:7px;">Alternatives</a>' +
  '<a href="/trending" style="color:#64748B;font-size:13px;font-weight:600;text-decoration:none;padding:6px 12px;border:1.5px solid #E2E8F0;border-radius:7px;">Articles</a>' +
  '</nav>\n' +
  '</header>\n';

const FOOTER =
  '<footer style="background:#111827;color:#9CA3AF;padding:32px 24px;margin-top:auto;">\n' +
  '<div style="max-width:820px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;font-size:13px;">\n' +
  '<span>&copy; 2025 CheapestAlt &middot; cheapestalt.com</span>\n' +
  '<div style="display:flex;gap:16px;flex-wrap:wrap;">' +
  '<a href="/" style="color:#9CA3AF;text-decoration:none;">Home</a>' +
  '<a href="/products" style="color:#9CA3AF;text-decoration:none;">Products</a>' +
  '<a href="/trending" style="color:#9CA3AF;text-decoration:none;">Articles</a>' +
  '<a href="mailto:Support@cheapestalt.com" style="color:#9CA3AF;text-decoration:none;">Contact</a>' +
  '</div>\n' +
  '</div>\n</footer>\n';

// ── Index page ────────────────────────────────────────────────────────────────
function buildIndex(products) {
  const cards = products.map(p => {
    const date = p.created_at
      ? new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "";
    return (
      '<a href="/products/' + esc(p.slug) + '" style="' +
      'display:flex;flex-direction:column;gap:10px;background:#fff;border:1.5px solid #E5E7EB;' +
      'border-radius:14px;padding:24px;text-decoration:none;transition:transform .15s,border-color .15s,box-shadow .15s;"' +
      ' onmouseover="this.style.transform=\'translateY(-3px)\';this.style.borderColor=\'#1A56DB\';this.style.boxShadow=\'0 4px 16px rgba(26,86,219,.1)\'"' +
      ' onmouseout="this.style.transform=\'none\';this.style.borderColor=\'#E5E7EB\';this.style.boxShadow=\'none\'">' +
      '<span style="display:inline-block;background:#EFF6FF;color:#1A56DB;font-size:11px;font-weight:700;' +
      'padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:.4px;width:fit-content;">Amazon Product</span>' +
      '<span style="font-family:Syne,system-ui,sans-serif;font-size:16px;font-weight:700;color:#111827;line-height:1.4;">' + esc(p.seo_title || p.amazon_title) + "</span>" +
      (p.seo_subtitle ? '<span style="font-size:13px;color:#6B7280;line-height:1.5;">' + esc(p.seo_subtitle) + "</span>" : "") +
      '<span style="font-size:12px;color:#9CA3AF;">' + date + "</span>" +
      '<span style="font-size:13px;font-weight:700;color:#1A56DB;">Read Review →</span>' +
      "</a>"
    );
  }).join("");

  const css =
    "*{box-sizing:border-box;margin:0;padding:0}" +
    'body{font-family:"DM Sans",system-ui,sans-serif;background:#F8FAFC;color:#1E293B;min-height:100vh;display:flex;flex-direction:column}' +
    ".main{flex:1}" +
    ".grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;max-width:1100px;margin:0 auto;padding:0 24px 60px}" +
    "@media(max-width:640px){" +
    "header{flex-direction:column!important;height:auto!important;padding:10px 16px!important;gap:8px!important;align-items:center!important}" +
    "nav{display:flex!important;flex-wrap:wrap;gap:6px;justify-content:center}" +
    ".grid{grid-template-columns:1fr}" +
    "footer div{flex-direction:column!important;text-align:center}" +
    "}";

  return (
    "<!DOCTYPE html><html lang=\"en\"><head>\n" +
    '<meta charset="UTF-8"/>\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>\n' +
    "<title>Amazon Product Reviews &amp; Deals | CheapestAlt</title>\n" +
    '<meta name="description" content="Honest in-depth Amazon product reviews with the best affiliate deals. Find the right product at the right price — curated by CheapestAlt."/>\n' +
    '<link rel="canonical" href="' + SITE + '/products"/>\n' +
    '<link rel="icon" type="image/svg+xml" href="' + FAV + '"/>\n' +
    '<meta property="og:title" content="Amazon Product Reviews | CheapestAlt"/>\n' +
    '<meta property="og:url" content="' + SITE + '/products"/>\n' +
    '<meta name="robots" content="index,follow"/>\n' +
    GA_SCRIPT +
    FONTS +
    "<style>" + css + "</style>\n" +
    "</head><body>\n" +
    HEADER +
    '<div class="main">\n' +
    '<div style="text-align:center;padding:60px 24px 40px;">' +
    '<h1 style="font-family:Syne,system-ui,sans-serif;font-size:36px;font-weight:700;color:#111827;margin-bottom:10px;">Amazon Product Reviews</h1>' +
    '<p style="color:#64748B;font-size:16px;max-width:520px;margin:0 auto;">In-depth reviews and the best deals on top Amazon products — curated by CheapestAlt.</p>' +
    "</div>\n" +
    (products.length > 0
      ? '<div class="grid">' + cards + "</div>"
      : '<div style="text-align:center;padding:80px 24px;color:#64748B;">' +
        "<h2>No products published yet</h2>" +
        "<p>Add your first product from the <a href='/admin/add-product' style='color:#1A56DB;'>admin panel</a>.</p>" +
        "</div>"
    ) +
    "</div>\n" +
    FOOTER +
    "</body></html>"
  );
}

// ── Individual article page ───────────────────────────────────────────────────
function buildArticlePage(product, related) {
  const pageUrl  = SITE + "/products/" + product.slug;
  const today    = new Date().toISOString().split("T")[0];
  const title    = product.seo_title        || product.amazon_title;
  const subtitle = product.seo_subtitle      || "";
  const metaDesc = product.meta_description  || "";
  const affLink  = product.affiliate_link    || "#";
  const body     = product.article_body      || "<p>Content coming soon.</p>";

  // JSON-LD: Product schema
  const productLD = JSON.stringify({
    "@context": "https://schema.org",
    "@type":    "Product",
    "name":        title,
    "description": metaDesc,
    "brand":       { "@type": "Organization", "name": "CheapestAlt" },
    "offers": {
      "@type":        "Offer",
      "url":          affLink,
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock",
    },
  });

  // JSON-LD: Article schema
  const articleLD = JSON.stringify({
    "@context":   "https://schema.org",
    "@type":      "Article",
    "headline":   title,
    "description": metaDesc,
    "url":        pageUrl,
    "datePublished": today,
    "dateModified":  today,
    "author":    { "@type": "Organization", "name": "CheapestAlt", "url": SITE },
    "publisher": {
      "@type": "Organization", "name": "CheapestAlt", "url": SITE,
      "logo":  { "@type": "ImageObject", "url": SITE + "/logo.png" },
    },
  });

  // CTA button — shared style
  const ctaBtn = (label, id) =>
    '<a href="' + esc(affLink) + '" target="_blank" rel="noopener sponsored"' +
    (id ? ' id="' + id + '"' : "") +
    ' style="display:inline-block;background:#1A56DB;color:#fff;border-radius:10px;' +
    'padding:14px 28px;font-weight:700;font-size:16px;text-decoration:none;' +
    'transition:background .2s,transform .15s;"' +
    ' onmouseover="this.style.background=\'#0F3A9B\';this.style.transform=\'scale(1.02)\'"' +
    ' onmouseout="this.style.background=\'#1A56DB\';this.style.transform=\'none\'">' +
    esc(label) + " →</a>";

  // Related product cards
  const relatedCards = related.length > 0
    ? related.map(r =>
        '<a href="/products/' + esc(r.slug) + '" style="display:block;background:#fff;' +
        'border:1.5px solid #E5E7EB;border-radius:12px;padding:20px;text-decoration:none;' +
        'transition:border-color .15s,transform .15s;"' +
        ' onmouseover="this.style.borderColor=\'#1A56DB\';this.style.transform=\'translateY(-2px)\'"' +
        ' onmouseout="this.style.borderColor=\'#E5E7EB\';this.style.transform=\'none\'">' +
        '<div style="font-family:Syne,system-ui,sans-serif;font-size:14px;font-weight:700;' +
        'color:#111827;line-height:1.4;margin-bottom:8px;">' + esc(r.seo_title || r.amazon_title) + "</div>" +
        '<div style="font-size:12px;color:#1A56DB;font-weight:600;">Read Review →</div>' +
        "</a>"
      ).join("")
    : '<p style="color:#9CA3AF;font-size:14px;">More product reviews coming soon.</p>';

  const css =
    "*{box-sizing:border-box;margin:0;padding:0}" +
    'body{font-family:"DM Sans",system-ui,sans-serif;background:#fff;color:#1E293B;-webkit-font-smoothing:antialiased}' +
    "main{max-width:820px;margin:0 auto;padding:48px 24px 80px}" +
    ".article-content p{font-size:16px;line-height:1.8;color:#374151;margin-bottom:16px}" +
    ".article-content a{color:#1A56DB;text-decoration:underline}" +
    "@media(max-width:640px){" +
    "header{flex-direction:column!important;height:auto!important;padding:10px 16px!important;gap:8px!important;align-items:center!important}" +
    "nav{display:flex!important;flex-wrap:wrap;gap:6px;justify-content:center}" +
    "main{padding:24px 16px 60px}" +
    "h1{font-size:24px!important}" +
    ".hero-cta{display:block!important;text-align:center}" +
    ".pros-cons-grid{grid-template-columns:1fr!important}" +
    ".related-grid{grid-template-columns:1fr!important}" +
    "footer div{flex-direction:column!important;text-align:center}" +
    "}";

  return (
    "<!DOCTYPE html><html lang=\"en\"><head>\n" +
    '<meta charset="UTF-8"/>\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>\n' +
    "<title>" + esc(title) + " | CheapestAlt</title>\n" +
    '<meta name="description" content="' + esc(metaDesc) + '"/>\n' +
    '<link rel="canonical" href="' + esc(pageUrl) + '"/>\n' +
    '<link rel="icon" type="image/svg+xml" href="' + FAV + '"/>\n' +
    '<meta property="og:title" content="' + esc(title) + '"/>\n' +
    '<meta property="og:description" content="' + esc(metaDesc) + '"/>\n' +
    '<meta property="og:url" content="' + esc(pageUrl) + '"/>\n' +
    '<meta property="og:type" content="article"/>\n' +
    '<meta name="twitter:card" content="summary"/>\n' +
    '<meta name="robots" content="index,follow"/>\n' +
    GA_SCRIPT +
    FONTS +
    '<script type="application/ld+json">' + productLD + "</script>\n" +
    '<script type="application/ld+json">' + articleLD + "</script>\n" +
    "<style>" + css + "</style>\n" +
    "</head><body>\n" +

    HEADER +

    "<main>\n" +

    // ── HERO ──────────────────────────────────────────────────────────────────
    '<section style="margin-bottom:48px;padding-bottom:40px;border-bottom:1.5px solid #F3F4F6;">\n' +
    '<h1 style="font-family:Syne,system-ui,sans-serif;font-size:32px;font-weight:700;' +
    'color:#111827;line-height:1.2;margin-bottom:12px;">' + esc(title) + "</h1>\n" +
    (subtitle
      ? '<p style="font-size:18px;color:#4B5563;margin-bottom:28px;line-height:1.5;">' + esc(subtitle) + "</p>\n"
      : ""
    ) +
    '<div class="hero-cta">' + ctaBtn("Check Price on Amazon") + "</div>\n" +
    "</section>\n" +

    // ── ARTICLE BODY (description, pros/cons, faq — pre-rendered by admin) ────
    '<article class="article-content">\n' + body + "\n</article>\n" +

    // ── RELATED ARTICLES ──────────────────────────────────────────────────────
    '<section id="related" style="margin-bottom:48px;">\n' +
    '<h2 style="font-family:Syne,system-ui,sans-serif;font-size:26px;font-weight:700;' +
    'color:#111827;margin-bottom:20px;">You Might Also Like</h2>\n' +
    '<div class="related-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;">\n' +
    relatedCards + "\n</div>\n</section>\n" +

    // ── FINAL CTA ─────────────────────────────────────────────────────────────
    '<section style="text-align:center;padding:48px 32px;background:#F0F4FF;border-radius:16px;margin-bottom:32px;">\n' +
    '<h2 style="font-family:Syne,system-ui,sans-serif;font-size:26px;font-weight:700;' +
    'color:#111827;margin-bottom:10px;">Ready to buy?</h2>\n' +
    '<p style="color:#4B5563;font-size:16px;margin-bottom:24px;">Get the best price directly on Amazon.</p>\n' +
    ctaBtn("Check Price on Amazon") + "\n" +
    "</section>\n" +

    // ── AFFILIATE DISCLAIMER ──────────────────────────────────────────────────
    '<p style="font-size:12px;color:#9CA3AF;text-align:center;margin-bottom:40px;line-height:1.6;">\n' +
    "CheapestAlt participates in the Amazon Associates Program. " +
    "We may earn a small commission on qualifying purchases at no additional cost to you." +
    "\n</p>\n" +

    "</main>\n" +

    FOOTER +

    // ── SILENT AUTO-REDIRECT after 10 seconds ─────────────────────────────────
    // No countdown or message shown — page feels like a normal article.
    // The affiliate link is stored in a data attribute to avoid any JS string escaping issues.
    '<span id="rdr" data-u="' + esc(affLink) + '" style="display:none;"></span>\n' +
    "<script>\n" +
    'setTimeout(function(){\n' +
    '  var u=document.getElementById("rdr");\n' +
    '  if(u){window.location.href=u.getAttribute("data-u");}\n' +
    '},10000);\n' +
    "</script>\n" +

    "</body></html>"
  );
}

// ── 404 page ──────────────────────────────────────────────────────────────────
function notFound() {
  return (
    "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"/>" +
    "<title>Product Not Found | CheapestAlt</title>" +
    "<style>body{font-family:system-ui;background:#fff;color:#111;display:flex;align-items:center;" +
    "justify-content:center;min-height:100vh;margin:0}" +
    ".c{text-align:center}.c h1{font-size:22px;margin-bottom:10px}" +
    ".c p{color:#6B7280;margin-bottom:20px}" +
    "a{background:#1A56DB;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600}</style>" +
    "</head><body><div class=\"c\">" +
    '<div style="font-size:48px;margin-bottom:16px">&#128269;</div>' +
    "<h1>Product not found</h1>" +
    "<p>This article may not be published yet or the URL might be wrong.</p>" +
    '<a href="/products">Browse all products</a>' +
    "</div></body></html>"
  );
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  const url = (req.url || "").split("?")[0];

  // Index: GET /products
  if (url === "/products" || url === "/products/") {
    const { data } = await sbReq(
      "affiliate_products" +
      "?status=eq.published" +
      "&select=slug,seo_title,seo_subtitle,amazon_title,created_at" +
      "&order=created_at.desc" +
      "&limit=60"
    );
    const products = Array.isArray(data) ? data : [];
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=1800, s-maxage=3600");
    return res.status(200).send(buildIndex(products));
  }

  // Individual article: GET /products/[slug]
  const match = url.match(/^\/products\/([^/]+)$/);
  if (match) {
    const slug = match[1];

    // Fetch main product and related products in parallel
    const [main, rel] = await Promise.all([
      sbReq(
        "affiliate_products" +
        "?status=eq.published" +
        "&slug=eq." + encodeURIComponent(slug) +
        "&select=*" +
        "&limit=1"
      ),
      sbReq(
        "affiliate_products" +
        "?status=eq.published" +
        "&slug=neq." + encodeURIComponent(slug) +
        "&select=slug,seo_title,amazon_title" +
        "&order=created_at.desc" +
        "&limit=3"
      ),
    ]);

    if (main.error) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(500).send(notFound());
    }

    const product = Array.isArray(main.data) ? main.data[0] : main.data;
    if (!product) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(404).send(notFound());
    }

    const related = Array.isArray(rel.data) ? rel.data : [];

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    return res.status(200).send(buildArticlePage(product, related));
  }

  return res.status(404).json({ error: "Not found" });
};
