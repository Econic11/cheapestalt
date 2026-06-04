"use strict";
const https = require("https");

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve) => {
    const pl = JSON.stringify(body);
    const req = https.request({
      hostname, path, method: "POST",
      headers: { ...headers, "Content-Length": Buffer.byteLength(pl) }
    }, r => {
      let d = ""; r.on("data", c => d += c);
      r.on("end", () => {
        let p = null; try { p = JSON.parse(d); } catch {}
        resolve({ status: r.statusCode, data: p || d.slice(0, 300) });
      });
    });
    req.on("error", e => resolve({ status: 0, data: e.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: 0, data: "timeout" }); });
    req.write(pl); req.end();
  });
}

module.exports = async function handler(req, res) {
  const secret = process.env.STORIES_SECRET || "cheapestalt-stories-2026";
  if ((req.query && req.query.secret) !== secret)
    return res.status(401).json({ error: "Unauthorized" });

  const ID     = process.env.AMAZON_CLIENT_ID;
  const SECRET = process.env.AMAZON_CLIENT_SECRET;
  const TAG    = process.env.AMAZON_PARTNER_TAG || "cheapestalt-20";

  if (!ID || !SECRET) {
    return res.status(200).json({
      step: "MISSING_ENV_VARS",
      message: "Add AMAZON_CLIENT_ID and AMAZON_CLIENT_SECRET in Vercel → Settings → Environment Variables"
    });
  }

  const t = await httpsPost("api.amazon.com", "/auth/o2/token",
    { "Content-Type": "application/json" },
    { grant_type: "client_credentials", client_id: ID, client_secret: SECRET, scope: "creatorsapi::default" }
  );

  if (!t.data.access_token) {
    return res.status(200).json({
      step: "TOKEN_FAILED", http_status: t.status, response: t.data,
      diagnosis: t.status === 401 ? "Wrong credentials" : t.status === 400 ? "Bad request" : "Unknown"
    });
  }

  const s = await httpsPost("creatorsapi.amazon", "/catalog/v1/searchItems",
    { "Content-Type": "application/json", "Authorization": "Bearer " + t.data.access_token, "x-marketplace": "www.amazon.com" },
    { keywords: "wireless earbuds", resources: ["itemInfo.title","offersV2.listings.price","images.primary.medium"], partnerTag: TAG, partnerType: "Associates", marketplace: "www.amazon.com", itemCount: 1 }
  );

  if (s.status === 403) return res.status(200).json({
    step: "NOT_ELIGIBLE_YET",
    message: "Token works but account needs 10 qualifying sales in last 30 days",
    token_ok: true
  });

  if (s.status !== 200) return res.status(200).json({
    step: "SEARCH_FAILED", http_status: s.status, response: s.data
  });

  const item = (s.data?.searchResult?.items || [])[0];
  return res.status(200).json({
    step: "SUCCESS",
    token_ok: true,
    search_ok: true,
    product: item ? {
      title: item.itemInfo?.title?.displayValue,
      price: item.offersV2?.listings?.[0]?.price?.displayAmount,
      asin:  item.asin,
      url:   "https://www.amazon.com/dp/" + item.asin + "?tag=" + TAG,
      image: item.images?.primary?.medium?.url
    } : null
  });
};
