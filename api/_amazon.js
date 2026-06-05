"use strict";
// api/amazon.js — Amazon Creators API client

const https = require("https");
let _cache = { token: null, exp: 0 };

function post(host, path, headers, body) {
  return new Promise(resolve => {
    const pl = Buffer.from(JSON.stringify(body));
    const req = https.request({
      hostname: host, path, method: "POST",
      headers: { ...headers, "Content-Length": pl.length }
    }, r => {
      let d = ""; r.on("data", c => d += c);
      r.on("end", () => { let p = null; try { p = JSON.parse(d); } catch {} resolve({ status: r.statusCode, data: p }); });
    });
    req.on("error", e => resolve({ status: 0, data: { error: e.message } }));
    req.setTimeout(12000, () => { req.destroy(); resolve({ status: 0, data: { error: "timeout" } }); });
    req.write(pl); req.end();
  });
}

async function getToken() {
  if (_cache.token && _cache.exp > Date.now() + 60000) return _cache.token;
  const ID = process.env.AMAZON_CLIENT_ID;
  const SC = process.env.AMAZON_CLIENT_SECRET;
  if (!ID || !SC) throw new Error("Amazon credentials not set");
  const r = await post("api.amazon.com", "/auth/o2/token",
    { "Content-Type": "application/json" },
    { grant_type: "client_credentials", client_id: ID, client_secret: SC, scope: "creatorsapi::default" }
  );
  if (!r.data || !r.data.access_token) throw new Error("Token failed: " + r.status);
  _cache = { token: r.data.access_token, exp: Date.now() + (r.data.expires_in || 3600) * 1000 };
  return _cache.token;
}

async function searchProducts(keyword, count) {
  const TAG = process.env.AMAZON_PARTNER_TAG || "cheapestalt-20";
  const token = await getToken();
  const r = await post("creatorsapi.amazon", "/catalog/v1/searchItems",
    { "Content-Type": "application/json", "Authorization": "Bearer " + token, "x-marketplace": "www.amazon.com" },
    { keywords: keyword, resources: ["itemInfo.title", "offersV2.listings.price", "images.primary.medium", "customerReviews.starRating", "customerReviews.count"],
      partnerTag: TAG, partnerType: "Associates", marketplace: "www.amazon.com", itemCount: count || 4 }
  );
  if (r.status === 403) throw new Error("API_NOT_ELIGIBLE");
  if (r.status !== 200) throw new Error("Search failed: " + r.status);
  return (r.data?.searchResult?.items || []).map(item => ({
    asin:    item.asin,
    title:   item.itemInfo?.title?.displayValue || keyword,
    price:   item.offersV2?.listings?.[0]?.price?.displayAmount || null,
    image:   item.images?.primary?.medium?.url || null,
    rating:  item.customerReviews?.starRating?.displayValue || null,
    reviews: item.customerReviews?.count?.displayValue || null,
    url:     "https://www.amazon.com/dp/" + item.asin + "?tag=" + TAG,
  }));
}

function productCard(p) {
  return '<div style="border:1.5px solid #E2E8F0;border-radius:12px;padding:16px;background:#fff;display:flex;flex-direction:column;gap:10px;">'
    + (p.image ? '<img src="' + p.image + '" alt="' + p.title.slice(0,60) + '" style="width:100%;max-height:160px;object-fit:contain;border-radius:8px;"/>' : '')
    + '<div style="font-size:13px;font-weight:700;color:#0F172A;line-height:1.4;">' + p.title.slice(0,100) + '</div>'
    + (p.price ? '<div style="font-size:20px;font-weight:800;color:#2563EB;">' + p.price + '</div>' : '')
    + (p.rating ? '<div style="font-size:12px;color:#F59E0B;">★ ' + p.rating + (p.reviews ? ' (' + p.reviews + ' reviews)' : '') + '</div>' : '')
    + '<a href="' + p.url + '" target="_blank" rel="noopener" style="display:block;text-align:center;background:#FF9900;color:#0F172A;padding:10px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;">🛒 Check Price on Amazon</a>'
    + '</div>';
}

function productGrid(products) {
  if (!products || !products.length) return "";
  return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin:24px 0;">'
    + products.map(p => productCard(p)).join("") + '</div>';
}

module.exports = { searchProducts, productCard, productGrid };
