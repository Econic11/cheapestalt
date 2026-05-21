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

// -- Index page -----------------------------------------------------------------
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
    '<nav class="nav"><a href="/">Alternatives</a><a href="https://cheapestalt.com/compare">Compare</a><a href="/stories">Stories</a><a href="/trending">Articles</a></nav>' +
    '</header>' +
    '<div class="main-content"><div class="hero">' +
    '<div class="hero-badge">ðŸ”¥ New Deals Published Daily</div>' +
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

// -- 404 page ------------------------------------------------------------------
function notFound() {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Not Found | CheapestAlt</title>' +
    '<style>body{font-family:system-ui;background:#0F172A;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}' +
    '.c{text-align:center}.c h1{font-size:22px;margin-bottom:10px}.c p{color:#94A3B8;margin-bottom:20px}' +
    'a{background:#2563EB;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600}</style></head>' +
    '<body><div class="c"><div style="font-size:48px;margin-bottom:16px">ðŸ“­</div><h1>Article not found</h1>' +
    '<p>This article may still be generating.</p><a href="/trending">Browse all articles</a></div></body></html>';
}

// -- MAIN HANDLER --------------------------------------------------------------
// ── Product pages ─────────────────────────────────────────────────────────────
const PROD_SITE="https://cheapestalt.com";
const PROD_FAV="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%231A56DB'/%3E%3Ctext x='16' y='22' font-family='Inter' font-size='13' font-weight='800' fill='white' text-anchor='middle'%3ECA%3C/text%3E%3C/svg%3E";
const PROD_GA='<script async src="https://www.googletagmanager.com/gtag/js?id='+GA+'"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","'+GA+'");</script>\n';
const PROD_FONTS='<link rel="preconnect" href="https://fonts.googleapis.com"/><link href="https://fonts.googleapis.com/css2?family=Syne:wght@700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>\n';
const PROD_HDR='<header style="background:#fff;border-bottom:1.5px solid #E2E8F0;padding:0 24px;height:58px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;"><div><a href="/" style="font-size:18px;font-weight:800;color:#111827;text-decoration:none;">Cheapest<em style="color:#1A56DB;font-style:normal;">Alt</em></a><span style="font-size:11px;color:#94A3B8;display:block;font-weight:400;">Find cheaper Amazon alternatives</span></div><nav style="display:flex;gap:8px;"><a href="/" style="color:#64748B;font-size:13px;font-weight:600;text-decoration:none;padding:6px 12px;border:1.5px solid #E2E8F0;border-radius:7px;">Alternatives</a><a href="/trending" style="color:#64748B;font-size:13px;font-weight:600;text-decoration:none;padding:6px 12px;border:1.5px solid #E2E8F0;border-radius:7px;">Articles</a></nav></header>\n';
const PROD_FTR='<footer style="background:#111827;color:#9CA3AF;padding:32px 24px;margin-top:auto;"><div style="max-width:820px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;font-size:13px;"><span>&copy; 2025 CheapestAlt &middot; cheapestalt.com</span><div style="display:flex;gap:16px;flex-wrap:wrap;"><a href="/" style="color:#9CA3AF;text-decoration:none;">Home</a><a href="/products" style="color:#9CA3AF;text-decoration:none;">Products</a><a href="/trending" style="color:#9CA3AF;text-decoration:none;">Articles</a><a href="mailto:Support@cheapestalt.com" style="color:#9CA3AF;text-decoration:none;">Contact</a></div></div></footer>\n';

function buildProductsIndex(products){
  const cards=products.map(p=>{
    const d=p.created_at?new Date(p.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"";
    return '<a href="/products/'+esc(p.slug)+'" style="display:flex;flex-direction:column;gap:10px;background:#fff;border:1.5px solid #E5E7EB;border-radius:14px;padding:24px;text-decoration:none;transition:transform .15s,border-color .15s;" onmouseover="this.style.transform=\'translateY(-3px)\';this.style.borderColor=\'#1A56DB\'" onmouseout="this.style.transform=\'none\';this.style.borderColor=\'#E5E7EB\'">'
      +'<span style="display:inline-block;background:#EFF6FF;color:#1A56DB;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:.4px;width:fit-content;">Amazon Product</span>'
      +'<span style="font-family:Syne,system-ui,sans-serif;font-size:16px;font-weight:700;color:#111827;line-height:1.4;">'+esc(p.seo_title||p.amazon_title)+'</span>'
      +(p.seo_subtitle?'<span style="font-size:13px;color:#6B7280;line-height:1.5;">'+esc(p.seo_subtitle)+'</span>':'')
      +'<span style="font-size:12px;color:#9CA3AF;">'+d+'</span>'
      +'<span style="font-size:13px;font-weight:700;color:#1A56DB;">Read Review &#x2192;</span>'
      +'</a>';
  }).join('');
  const css='*{box-sizing:border-box;margin:0;padding:0}body{font-family:"DM Sans",system-ui,sans-serif;background:#F8FAFC;color:#1E293B;min-height:100vh;display:flex;flex-direction:column}.main{flex:1}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;max-width:1100px;margin:0 auto;padding:0 24px 60px}@media(max-width:640px){header{flex-direction:column!important;height:auto!important;padding:10px 16px!important;gap:8px!important;align-items:center!important}nav{display:flex!important;flex-wrap:wrap;gap:6px;justify-content:center}.grid{grid-template-columns:1fr}footer div{flex-direction:column!important;text-align:center}}';
  return '<!DOCTYPE html><html lang="en"><head>'
    +'<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>'
    +'<title>Amazon Product Reviews &amp; Deals | CheapestAlt</title>'
    +'<meta name="description" content="Honest in-depth Amazon product reviews with the best affiliate deals."/>'
    +'<link rel="canonical" href="'+PROD_SITE+'/products"/>'
    +'<link rel="icon" type="image/svg+xml" href="'+PROD_FAV+'"/>'
    +'<meta name="robots" content="index,follow"/>'
    +PROD_GA+PROD_FONTS
    +'<style>'+css+'</style></head><body>'
    +PROD_HDR
    +'<div class="main"><div style="text-align:center;padding:60px 24px 40px;">'
    +'<h1 style="font-family:Syne,system-ui,sans-serif;font-size:36px;font-weight:700;color:#111827;margin-bottom:10px;">Amazon Product Reviews</h1>'
    +'<p style="color:#64748B;font-size:16px;max-width:520px;margin:0 auto;">In-depth reviews and the best deals on top Amazon products &#x2014; curated by CheapestAlt.</p>'
    +'</div>'
    +(products.length>0?'<div class="grid">'+cards+'</div>':'<div style="text-align:center;padding:80px 24px;color:#64748B;"><h2>No products published yet</h2><p>Add your first product from the <a href="/admin/add-product" style="color:#1A56DB;">admin panel</a>.</p></div>')
    +'</div>'+PROD_FTR+'</body></html>';
}
function buildProductArticle(product,related){
  const pageUrl=PROD_SITE+"/products/"+product.slug;
  const today=new Date().toISOString().split("T")[0];
  const title=product.seo_title||product.amazon_title,subtitle=product.seo_subtitle||"",metaD=product.meta_description||"",affLink=product.affiliate_link||"#",body=product.article_body||"<p>Content coming soon.</p>";
  const cS="display:inline-block;background:#1A56DB;color:#fff;border-radius:10px;padding:14px 28px;font-weight:700;font-size:16px;text-decoration:none;transition:background .2s,transform .15s;";
  const cBtn=label=>'<a href="'+esc(affLink)+'" target="_blank" rel="noopener sponsored" style="'+cS+'" onmouseover="this.style.background=\'#0F3A9B\';this.style.transform=\'scale(1.02)\'" onmouseout="this.style.background=\'#1A56DB\';this.style.transform=\'none\'">'+esc(label)+' &#x2192;</a>';
  const relCards=related.length>0?related.map(r=>'<a href="/products/'+esc(r.slug)+'" style="display:block;background:#fff;border:1.5px solid #E5E7EB;border-radius:12px;padding:20px;text-decoration:none;transition:border-color .15s,transform .15s;" onmouseover="this.style.borderColor=\'#1A56DB\';this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.borderColor=\'#E5E7EB\';this.style.transform=\'none\'"><div style="font-family:Syne,system-ui,sans-serif;font-size:14px;font-weight:700;color:#111827;line-height:1.4;margin-bottom:8px;">'+esc(r.seo_title||r.amazon_title)+'</div><div style="font-size:12px;color:#1A56DB;font-weight:600;">Read Review &#x2192;</div></a>').join(''):'<p style="color:#9CA3AF;font-size:14px;">More product reviews coming soon.</p>';
  const pLD=JSON.stringify({"@context":"https://schema.org","@type":"Product","name":title,"description":metaD,"brand":{"@type":"Organization","name":"CheapestAlt"},"offers":{"@type":"Offer","url":affLink,"priceCurrency":"USD","availability":"https://schema.org/InStock"}});
  const aLD=JSON.stringify({"@context":"https://schema.org","@type":"Article","headline":title,"description":metaD,"url":pageUrl,"datePublished":today,"dateModified":today,"author":{"@type":"Organization","name":"CheapestAlt","url":PROD_SITE},"publisher":{"@type":"Organization","name":"CheapestAlt","url":PROD_SITE,"logo":{"@type":"ImageObject","url":PROD_SITE+"/logo.png"}}});
  const css='*{box-sizing:border-box;margin:0;padding:0}body{font-family:"DM Sans",system-ui,sans-serif;background:#fff;color:#1E293B;-webkit-font-smoothing:antialiased}main{max-width:820px;margin:0 auto;padding:48px 24px 80px}.article-content p{font-size:16px;line-height:1.8;color:#374151;margin-bottom:16px}.article-content a{color:#1A56DB;text-decoration:underline}@media(max-width:640px){header{flex-direction:column!important;height:auto!important;padding:10px 16px!important;gap:8px!important;align-items:center!important}nav{display:flex!important;flex-wrap:wrap;gap:6px;justify-content:center}main{padding:24px 16px 60px}h1{font-size:24px!important}footer div{flex-direction:column!important;text-align:center}}';
  return '<!DOCTYPE html><html lang="en"><head>\n'
    +'<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>\n'
    +'<title>'+esc(title)+' | CheapestAlt</title>\n'
    +'<meta name="description" content="'+esc(metaD)+'"/>\n'
    +'<link rel="canonical" href="'+esc(pageUrl)+'"/>\n'
    +'<link rel="icon" type="image/svg+xml" href="'+PROD_FAV+'"/>\n'
    +'<meta property="og:title" content="'+esc(title)+'"/>\n'
    +'<meta property="og:description" content="'+esc(metaD)+'"/>\n'
    +'<meta property="og:url" content="'+esc(pageUrl)+'"/>\n'
    +'<meta property="og:type" content="article"/>\n'
    +'<meta name="twitter:card" content="summary"/>\n'
    +'<meta name="robots" content="index,follow"/>\n'
    +PROD_GA+PROD_FONTS
    +'<script type="application/ld+json">'+pLD+'</script>\n'
    +'<script type="application/ld+json">'+aLD+'</script>\n'
    +'<style>'+css+'</style>\n</head><body>\n'
    +PROD_HDR
    +'<main>\n'
    +'<section style="margin-bottom:48px;padding-bottom:40px;border-bottom:1.5px solid #F3F4F6;">\n'
    +'<h1 style="font-family:Syne,system-ui,sans-serif;font-size:32px;font-weight:700;color:#111827;line-height:1.2;margin-bottom:12px;">'+esc(title)+'</h1>\n'
    +(subtitle?'<p style="font-size:18px;color:#4B5563;margin-bottom:28px;line-height:1.5;">'+esc(subtitle)+'</p>\n':'')
    +cBtn("Check Price on Amazon")+'\n</section>\n'
    +'<article class="article-content">\n'+body+'\n</article>\n'
    +'<section id="related" style="margin-bottom:48px;">\n'
    +'<h2 style="font-family:Syne,system-ui,sans-serif;font-size:26px;font-weight:700;color:#111827;margin-bottom:20px;">You Might Also Like</h2>\n'
    +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;">\n'+relCards+'\n</div>\n</section>\n'
    +'<section style="text-align:center;padding:48px 32px;background:#F0F4FF;border-radius:16px;margin-bottom:32px;">\n'
    +'<h2 style="font-family:Syne,system-ui,sans-serif;font-size:26px;font-weight:700;color:#111827;margin-bottom:10px;">Ready to buy?</h2>\n'
    +'<p style="color:#4B5563;font-size:16px;margin-bottom:24px;">Get the best price directly on Amazon.</p>\n'
    +cBtn("Check Price on Amazon")+'\n</section>\n'
    +'<p style="font-size:12px;color:#9CA3AF;text-align:center;margin-bottom:40px;line-height:1.6;">CheapestAlt participates in the Amazon Associates Program. We may earn a small commission on qualifying purchases at no additional cost to you.</p>\n'
    +'</main>\n'
    +PROD_FTR
    +'<span id="rdr" data-u="'+esc(affLink)+'" style="display:none;"></span>\n'
    +'<script>setTimeout(function(){var u=document.getElementById("rdr");if(u){window.location.href=u.getAttribute("data-u");}},2000);</script>\n'
    +'</body></html>';
}
function notFoundProd(){
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Not Found | CheapestAlt</title>'
    +'<style>body{font-family:system-ui;background:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.c{text-align:center}.c h1{font-size:22px;margin-bottom:10px}.c p{color:#6B7280;margin-bottom:20px}a{background:#1A56DB;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600}</style></head>'
    +'<body><div class="c"><div style="font-size:48px;margin-bottom:16px">&#128269;</div><h1>Product not found</h1><p>This article may not be published yet.</p><a href="/products">Browse all products</a></div></body></html>';
}

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

  // Products index
  if(url==="/products"||url==="/products/"){
    const{data}=await sbReq("affiliate_products?status=eq.published&select=slug,seo_title,seo_subtitle,amazon_title,created_at&order=created_at.desc&limit=60");
    const products=Array.isArray(data)?data:[];
    res.setHeader("Content-Type","text/html; charset=utf-8");
    res.setHeader("Cache-Control","public, max-age=1800, s-maxage=3600");
    return res.status(200).send(buildProductsIndex(products));
  }
  // Individual product article
  const mP=url.match(/^\/products\/([^/]+)$/);
  if(mP){
    const slug=mP[1];
    const[{data:rows,error},{data:relRows}]=await Promise.all([
      sbReq("affiliate_products?status=eq.published&slug=eq."+encodeURIComponent(slug)+"&select=*&limit=1"),
      sbReq("affiliate_products?status=eq.published&slug=neq."+encodeURIComponent(slug)+"&select=slug,seo_title,amazon_title&order=created_at.desc&limit=3"),
    ]);
    if(error){res.setHeader("Content-Type","text/html;charset=utf-8");return res.status(500).send(notFoundProd());}
    const product=Array.isArray(rows)?rows[0]:rows;
    if(!product){res.setHeader("Content-Type","text/html;charset=utf-8");return res.status(404).send(notFoundProd());}
    const related=Array.isArray(relRows)?relRows:[];
    res.setHeader("Content-Type","text/html; charset=utf-8");
    res.setHeader("Cache-Control","public, max-age=3600, s-maxage=86400");
    return res.status(200).send(buildProductArticle(product,related));
  }

  return res.status(404).json({ error: "Not found" });
};
