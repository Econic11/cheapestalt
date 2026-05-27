"use strict";
// Referral redirect handler.
// Reads the ca_ref cookie → looks up the partner's amazonTag in Supabase →
// rewrites the Amazon URL's tag= parameter → redirects the user.
// Also increments the partner's click stat for today (best effort).
//
// NOTE: The Partner and Stat tables must be readable by the Supabase key used here.
// If you have RLS enabled on those tables, add a policy allowing anon reads,
// or set SUPABASE_SERVICE_KEY in your Vercel environment variables.

const https  = require("https");
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL      || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || "";
const FALLBACK_TAG = "cheapestalt-20"; // used when no partner cookie is found

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "").split(";").map(c => {
      const [k, ...v] = c.trim().split("=");
      return [k.trim(), v.join("=").trim()];
    }).filter(([k]) => k)
  );
}

function sbReq(method, path, body, prefer) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return Promise.resolve(null);
  const host = SUPABASE_URL.replace(/^https?:\/\//, "");
  const buf  = body ? Buffer.from(JSON.stringify(body)) : null;
  const headers = {
    "apikey":        SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Content-Type":  "application/json",
  };
  if (buf)    headers["Content-Length"] = buf.length;
  if (prefer) headers["Prefer"] = prefer;

  return new Promise(resolve => {
    const req = https.request(
      { hostname: host, path: "/rest/v1/" + path, method, headers },
      r => {
        let d = "";
        r.on("data", c => d += c);
        r.on("end", () => {
          try { resolve(JSON.parse(d)); } catch { resolve(null); }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
    if (buf) req.write(buf);
    req.end();
  });
}

// Replace or add the Amazon affiliate tag in a URL.
// Only works for amazon.com URLs — amzn.to short links cannot be rewritten.
function injectTag(urlStr, tag) {
  try {
    const u = new URL(urlStr);
    if (u.hostname.includes("amazon.com")) {
      u.searchParams.set("tag", tag);
      return u.toString();
    }
    return urlStr; // amzn.to or other — return as-is
  } catch { return urlStr; }
}

async function incrementClicks(partnerId) {
  try {
    const now      = new Date();
    const todayISO = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    const nextISO  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

    // Try to find an existing stat row for today
    const rows = await sbReq(
      "GET",
      `Stat?partnerId=eq.${encodeURIComponent(partnerId)}&date=gte.${encodeURIComponent(todayISO)}&date=lt.${encodeURIComponent(nextISO)}&select=id,clicks&limit=1`
    );

    if (Array.isArray(rows) && rows[0]) {
      // Increment existing clicks
      await sbReq(
        "PATCH",
        `Stat?id=eq.${encodeURIComponent(rows[0].id)}`,
        { clicks: rows[0].clicks + 1 },
        "return=minimal"
      );
    } else {
      // Create a new stat row for today
      await sbReq(
        "POST",
        "Stat",
        { id: crypto.randomUUID(), partnerId, date: todayISO, clicks: 1, orders: 0, revenue: 0 },
        "return=minimal"
      );
    }
  } catch { /* non-critical — ignore */ }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  const to = (req.query && req.query.to) || "";
  let decoded = "";
  try { decoded = decodeURIComponent(to); } catch { decoded = to; }
  if (!decoded || !decoded.startsWith("http")) {
    res.setHeader("Location", "https://cheapestalt.com");
    return res.status(302).end();
  }

  let amazonTag  = FALLBACK_TAG;
  let partnerId  = null;

  // Look up partner by referral cookie
  const cookies     = parseCookies(req);
  const refUsername = cookies.ca_ref || "";

  if (refUsername && SUPABASE_URL && SUPABASE_KEY) {
    try {
      const rows = await sbReq(
        "GET",
        `Partner?username=eq.${encodeURIComponent(refUsername)}&select=id,amazonTag&limit=1`
      );
      if (Array.isArray(rows) && rows[0] && rows[0].amazonTag) {
        amazonTag = rows[0].amazonTag;
        partnerId = rows[0].id;
      }
    } catch { /* fall through to default tag */ }
  }

  // Track the click (awaited so it completes before Vercel terminates the function)
  if (partnerId) await incrementClicks(partnerId);

  const dest = injectTag(decoded, amazonTag);
  res.setHeader("Location", dest);
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  return res.status(302).end();
};
