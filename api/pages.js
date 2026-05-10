// api/pages.js
// Serves static content pages for footer links
// Pages: about, how-it-works, affiliate-disclosure, privacy-policy, contact

module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  const { page } = req.query || {};
  const pageId = page || (req.url || '').split('/').pop().split('?')[0];
  const pages = {
    "about": pageAbout(),
    "how-it-works": pageHowItWorks(),
    "affiliate-disclosure": pageAffiliate(),
    "privacy-policy": pagePrivacy(),
    "contact": pageContact(),
  };

  const content = pages[pageId || page];
  if (!content) return res.status(404).json({ error: "Page not found" });

  res.setHeader("Content-Type", "text/html");
  return res.status(200).send(wrapPage(content.title, content.html));
};

// â”€â”€â”€ Page wrapper with full CheapestAlt header/footer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function wrapPage(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title} â€” CheapestAlt</title>
  <meta name="description" content="${title} â€” CheapestAlt helps you find cheaper product alternatives."/>
    <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-6MR7X29W2X"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-6MR7X29W2X');
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2032%2032%22%3E%3Crect%20width%3D%2232%22%20height%3D%2232%22%20rx%3D%227%22%20fill%3D%22%232563EB%22/%3E%3Ctext%20x%3D%2216%22%20y%3D%2222%22%20font-family%3D%22Inter%2Csystem-ui%2Csans-serif%22%20font-size%3D%2213%22%20font-weight%3D%22800%22%20fill%3D%22white%22%20text-anchor%3D%22middle%22%20letter-spacing%3D%22-0.5%22%3ECA%3C/text%3E%3C/svg%3E"/>
  <meta name="theme-color" content="#2563EB"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',system-ui,sans-serif;color:#0F172A;background:#fff;font-size:15px;line-height:1.7;-webkit-font-smoothing:antialiased}
    .hdr{background:#fff;border-bottom:1.5px solid #E2E8F0;display:flex;align-items:center;justify-content:space-between;padding:0 28px;height:58px}
    .logo{font-size:18px;font-weight:800;color:#0F172A;text-decoration:none;letter-spacing:-0.4px}
    .logo em{color:#2563EB;font-style:normal}
    .hdr-nav{display:flex;gap:16px}
    .hdr-nav a{font-size:13.5px;font-weight:600;color:#0F172A;text-decoration:none}
    .hdr-nav a:hover{color:#2563EB}
    .main{max-width:760px;margin:0 auto;padding:56px 24px 80px}
    .main h1{font-size:36px;font-weight:800;letter-spacing:-0.8px;margin-bottom:12px;color:#0F172A}
    .main .lead{font-size:17px;color:#475569;margin-bottom:36px;line-height:1.65}
    .main h2{font-size:20px;font-weight:700;margin:32px 0 10px;color:#0F172A}
    .main p{margin-bottom:14px;color:#0F172A}
    .main ul{margin:10px 0 18px 20px;color:#0F172A}
    .main ul li{margin-bottom:8px}
    .main a{color:#2563EB;text-decoration:none}
    .main a:hover{text-decoration:underline}
    .main .card{background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:12px;padding:20px 24px;margin-bottom:16px}
    .main .card h3{font-size:15px;font-weight:700;margin-bottom:6px}
    .main .badge{display:inline-block;background:#EFF6FF;color:#2563EB;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;border:1px solid #BFDBFE;margin-bottom:20px}
    .contact-link{display:inline-flex;align-items:center;gap:8px;background:#2563EB;color:#fff;padding:13px 24px;border-radius:10px;font-weight:700;text-decoration:none;margin-top:8px}
    .contact-link:hover{background:#1D4ED8;text-decoration:none}
    .ftr{background:#F8FAFC;border-top:1.5px solid #E2E8F0;padding:32px 28px;margin-top:auto}
    .ftr-inner{max-width:960px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
    .ftr p{font-size:13px;color:#0F172A}
    .ftr-links{display:flex;gap:16px;flex-wrap:wrap}
    .ftr-links a{font-size:13px;color:#0F172A;text-decoration:none}
    .ftr-links a:hover{color:#2563EB}
    @media(max-width:640px){.main h1{font-size:26px}.hdr-nav{display:none}}
  </style>
</head>
<body>
<header style="background:#fff;border-bottom:1.5px solid #E2E8F0;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 28px;height:58px;position:sticky;top:0;z-index:200;font-family:Inter,system-ui,sans-serif">
  <a href="/" style="font-size:18px;font-weight:800;color:#0F172A;text-decoration:none;letter-spacing:-0.4px;justify-self:start">Cheapest<em style="color:#2563EB;font-style:normal">Alt</em></a>
  <nav style="display:flex;gap:6px;justify-self:center">
    <a href="/" style="background:#2563EB;border:1.5px solid #2563EB;padding:7px 16px;border-radius:8px;font-size:13.5px;font-weight:600;color:#fff;text-decoration:none;white-space:nowrap;transition:background .15s" onmouseover="this.style.background='#1D4ED8'" onmouseout="this.style.background='#2563EB'">Find Alternatives</a>
    <a href="https://cheapestalt.com/compare" style="background:#2563EB;border:1.5px solid #2563EB;padding:7px 16px;border-radius:8px;font-size:13.5px;font-weight:600;color:#fff;text-decoration:none;white-space:nowrap;transition:background .15s" onmouseover="this.style.background='#1D4ED8'" onmouseout="this.style.background='#2563EB'">Compare Products</a>
  </nav>
  <div style="font-size:12px;color:#0F172A;border:1.5px solid #E2E8F0;border-radius:20px;padding:4px 12px;font-weight:500;background:#F8FAFC;justify-self:end;white-space:nowrap">Free Â· No signup needed</div>
</header>
<style>
@media(max-width:640px){
  header{display:flex!important;flex-direction:column;height:auto!important;padding:12px 16px!important;gap:10px;align-items:center!important}
  header nav{justify-content:center;width:100%;display:flex;gap:6px}
  header a[href="/"]{font-size:18px}
  header div[style*="No signup"]{display:none!important}
  header nav a{flex:1;text-align:center;font-size:13px!important;padding:9px 12px!important}
}
</style>
<main class="main">
${bodyHtml}
</main>
<footer style="background:#F8FAFC;border-top:1.5px solid #E2E8F0;padding:24px 28px;margin-top:40px;font-family:Inter,system-ui,sans-serif">
  <div style="max-width:760px;margin:0 auto;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:13px;color:#0F172A;align-items:center">
    <span>Â© 2026 CheapestAlt. All rights reserved.</span>
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      <a href="/" style="color:#0F172A;text-decoration:none;font-weight:500">Home</a>
      <a href="/" style="color:#0F172A;text-decoration:none;font-weight:500">About</a>
      <a href="/" style="color:#0F172A;text-decoration:none;font-weight:500">Affiliate Disclosure</a>
      <a href="/" style="color:#0F172A;text-decoration:none;font-weight:500">Privacy Policy</a>
      <a href="mailto:Support@cheapestalt.com" style="color:#2563EB;text-decoration:none;font-weight:500">Contact</a>
    </div>
  </div>
</footer>
</body>
</html>`;
}

// â”€â”€â”€ PAGE CONTENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function pageAbout() {
  return {
    title: "About CheapestAlt",
    html: `
    <div class="badge">About us</div>
    <h1>About CheapestAlt</h1>
    <p class="lead">We help smart shoppers discover cheaper alternatives to any product â€” saving thousands of dollars a year without sacrificing quality.</p>

    <h2>Our mission</h2>
    <p>CheapestAlt was built on a simple idea: you shouldn't have to pay a premium price for premium-quality products. Across every product category â€” electronics, appliances, fashion, fitness â€” there are always better-value alternatives that most people never find.</p>
    <p>We use AI to do the research for you. Type in any product, and our system instantly finds real alternatives available on Amazon, Walmart, and eBay â€” with honest prices, real ratings, and straight-to-the-point value comparisons.</p>

    <h2>How we're different</h2>
    <div class="card"><h3>ðŸ¤– AI-powered, not sponsored</h3><p>Our results come from Claude AI analyzing real product data â€” not paid placements. We never accept money to rank a product higher.</p></div>
    <div class="card"><h3>ðŸ’° Genuinely cheaper alternatives</h3><p>We only show alternatives that are meaningfully cheaper. We calculate real savings percentages and explain exactly why each alternative is worth considering.</p></div>
    <div class="card"><h3>âš¡ Built for speed</h3><p>Results in seconds. No accounts, no sign-up, no spam. Just search and save.</p></div>

    <h2>Contact us</h2>
    <p>Questions, feedback, or partnership inquiries? We'd love to hear from you.</p>
    <a href="/" class="contact-link">Get in touch</a>
    `,
  };
}

function pageHowItWorks() {
  return {
    title: "How CheapestAlt Works",
    html: `
    <div class="badge">How it works</div>
    <h1>How CheapestAlt works</h1>
    <p class="lead">Three steps to finding the best cheaper alternative to any product â€” powered by AI.</p>

    <div class="card"><h3>1. Search any product</h3><p>Type the name of any product you're considering â€” a specific model, a brand, or a general category. Our search bar accepts anything.</p></div>
    <div class="card"><h3>2. AI does the research</h3><p>Our system sends your query to Claude AI (by Anthropic), which analyzes thousands of products and identifies the best cheaper alternatives that offer similar or better value. We use Claude Haiku for fast searches, and Claude Sonnet for deeper product comparisons.</p></div>
    <div class="card"><h3>3. Compare and save</h3><p>We show you the original product side-by-side with cheaper alternatives â€” with real prices, real ratings, savings percentages, and direct links to buy on Amazon, Walmart, or eBay.</p></div>

    <h2>The comparison tool</h2>
    <p>Want to compare two specific products directly? Use our <a href="/">Compare Products</a> feature. Enter two product names and get a detailed feature-by-feature breakdown â€” including pros, cons, and a clear verdict on which offers the best value.</p>

    <h2>Are the prices accurate?</h2>
    <p>Prices are AI-estimated based on real market data and may vary. Always check the retailer's current price before purchasing. We link directly to Amazon, Walmart, and eBay for the most up-to-date pricing.</p>

    <h2>Affiliate links</h2>
    <p>Our links to Amazon, Walmart, and eBay are affiliate links. We earn a small commission if you purchase â€” at no extra cost to you. See our <a href="/">affiliate disclosure</a> for full details.</p>
    `,
  };
}

function pageAffiliate() {
  return {
    title: "Affiliate Disclosure",
    html: `
    <div class="badge">Legal</div>
    <h1>Affiliate disclosure</h1>
    <p class="lead">Transparency is important to us. Here's exactly how CheapestAlt makes money.</p>

    <h2>How we earn revenue</h2>
    <p>CheapestAlt participates in affiliate marketing programs. This means that when you click on links to Amazon, Walmart, or eBay on our site and make a purchase, we may earn a small commission at no additional cost to you.</p>

    <h2>Our affiliate partners</h2>
    <ul>
      <li><strong>Amazon Associates</strong> â€” We participate in the Amazon Services LLC Associates Program, an affiliate advertising program designed to provide a means for sites to earn advertising fees by advertising and linking to amazon.com.</li>
      <li><strong>Walmart Affiliate Program</strong> â€” We may earn commissions from purchases made through Walmart links.</li>
      <li><strong>eBay Partner Network</strong> â€” We may earn commissions from purchases made through eBay links.</li>
    </ul>

    <h2>How this affects our recommendations</h2>
    <p>Our product recommendations are generated by Claude AI based on price, ratings, and value â€” not based on affiliate commission rates. We never accept payment to promote a specific product, and our rankings are never influenced by affiliate relationships.</p>
    <p>All three platforms (Amazon, Walmart, eBay) are shown equally for every product. We do not prioritize one platform over another based on commission rates.</p>

    <h2>FTC compliance</h2>
    <p>In accordance with the Federal Trade Commission's guidelines, we disclose that links on CheapestAlt may be affiliate links. This disclosure applies site-wide.</p>

    <h2>Questions?</h2>
    <p>Contact us at <a href="mailto:Support@cheapestalt.com">Support@cheapestalt.com</a> with any questions about our affiliate relationships.</p>
    `,
  };
}

function pagePrivacy() {
  return {
    title: "Privacy Policy",
    html: `
    <div class="badge">Legal</div>
    <h1>Privacy policy</h1>
    <p class="lead">Last updated: January 2025. We keep this simple â€” we collect very little data and never sell it.</p>

    <h2>What data we collect</h2>
    <p>CheapestAlt is designed to be privacy-friendly. Here's what we may collect:</p>
    <ul>
      <li><strong>Search queries</strong> â€” When you search for a product, that query is sent to our AI system to generate results. We may cache results to improve performance and reduce costs.</li>
      <li><strong>Usage analytics</strong> â€” Basic anonymized analytics (page views, search volume) via Vercel's built-in analytics. No personal data is collected.</li>
      <li><strong>Contact information</strong> â€” If you contact us via email, we store your email address only to respond to your inquiry.</li>
    </ul>

    <h2>What we do NOT collect</h2>
    <ul>
      <li>We do not require account creation or login</li>
      <li>We do not collect names, addresses, or payment information</li>
      <li>We do not track you across other websites</li>
      <li>We do not sell any data to third parties</li>
    </ul>

    <h2>Third-party services</h2>
    <ul>
      <li><strong>Anthropic (Claude AI)</strong> â€” Your search queries are sent to Anthropic's API to generate product alternatives. See <a href="https://www.anthropic.com/privacy" target="_blank">Anthropic's Privacy Policy</a>.</li>
      <li><strong>Vercel</strong> â€” Our hosting provider. See <a href="https://vercel.com/legal/privacy-policy" target="_blank">Vercel's Privacy Policy</a>.</li>
      <li><strong>Amazon, Walmart, eBay</strong> â€” Affiliate links direct you to these retailers, who have their own privacy policies.</li>
    </ul>

    <h2>Cookies</h2>
    <p>CheapestAlt does not use tracking cookies. Vercel may set functional cookies required for site operation.</p>

    <h2>Your rights</h2>
    <p>You have the right to request deletion of any data associated with you. Contact us at <a href="mailto:Support@cheapestalt.com">Support@cheapestalt.com</a>.</p>

    <h2>Changes to this policy</h2>
    <p>We may update this policy from time to time. Changes will be posted on this page with an updated date.</p>

    <h2>Contact</h2>
    <p>Privacy questions: <a href="mailto:Support@cheapestalt.com">Support@cheapestalt.com</a></p>
    `,
  };
}

function pageContact() {
  return {
    title: "Contact CheapestAlt",
    html: `
    <div class="badge">Contact</div>
    <h1>Get in touch</h1>
    <p class="lead">We're a small team and we read every message. Expect a reply within 24â€“48 hours.</p>

    <div class="card">
      <h3>ðŸ“§ Email support</h3>
      <p>For general questions, feedback, bug reports, or partnership inquiries:</p>
      <a href="mailto:Support@cheapestalt.com" class="contact-link" style="margin-top:12px">Support@cheapestalt.com</a>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>ðŸ› Found a bug?</h3>
      <p>If a search returned wrong results, a link is broken, or something doesn't look right â€” please email us with the product name you searched and what you expected to see. This helps us improve the AI results.</p>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>ðŸ¤ Partnership & affiliate inquiries</h3>
      <p>Interested in partnering with CheapestAlt or discussing our affiliate program? Reach out at <a href="mailto:Support@cheapestalt.com">Support@cheapestalt.com</a> with the subject line "Partnership".</p>
    </div>

    <h2>Frequently asked questions</h2>
    <p><strong>How are product prices determined?</strong><br>Prices are AI-estimated based on real market data and updated regularly. Always check the retailer for the current price before buying.</p>
    <p><strong>Can I request a specific product comparison?</strong><br>Use our <a href="/">Compare Products</a> tool to compare any two products instantly â€” no need to request it manually.</p>
    <p><strong>How do I remove a product from your site?</strong><br>We display publicly available product information. If you believe a listing is inaccurate, email us and we'll review it.</p>
    `,
  };
}
