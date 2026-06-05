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
  return '<a href="' + p.url + '" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:12px;background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:14px;padding:14px 16px;margin-bottom:10px;text-decoration:none;color:inherit;">'
    + '<img src="' + (p.image || '') + '" alt="' + p.title.slice(0,40) + '" style="width:48px;height:48px;object-fit:contain;border-radius:8px;flex-shrink:0;background:#fff;border:1px solid #E2E8F0;"/>'
    + '<div style="flex:1;min-width:0;">'
    + '<div style="font-size:14px;font-weight:700;color:#0F172A;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + p.title.slice(0,60) + '</div>'
    + (p.price ? '<div style="font-size:15px;font-weight:800;color:#2563EB;margin-top:2px;">' + p.price + '</div>' : '')
    + (p.rating ? '<div style="font-size:11px;color:#F59E0B;margin-top:1px;">★ ' + p.rating + (p.reviews ? ' (' + p.reviews + ')' : '') + '</div>' : '')
    + '</div>'
    + '<div style="background:#FF9900;color:#0F172A;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:700;white-space:nowrap;flex-shrink:0;">Check price</div>'
    + '</a>';
}

function productGrid(products) {
  if (!products || !products.length) return "";
  return '<div style="display:flex;flex-direction:column;margin:16px 0;">'
    + products.map(p => productCard(p)).join("")
    + '</div>';
}

module.exports = { searchProducts, productCard, productGrid };
