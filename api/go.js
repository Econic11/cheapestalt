"use strict";
// Referral redirect handler.
// Reads the ca_ref cookie (partner username) → builds tag cheapestalt-{username}-20
// → rewrites the Amazon URL's tag= parameter → redirects the user.
// No database lookup needed — the tag is derived purely from the username.

const FALLBACK_TAG = "cheapestalt-20";

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "").split(";").map(c => {
      const [k, ...v] = c.trim().split("=");
      return [k.trim(), v.join("=").trim()];
    }).filter(([k]) => k)
  );
}

// Build the Amazon tracking tag from the partner's username.
// Amazon tags allow lowercase letters, digits, and hyphens.
function buildTag(username) {
  const safe = username
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 25);
  return safe ? `cheapestalt-${safe}-20` : FALLBACK_TAG;
}

// Inject the affiliate tag into an Amazon URL.
// Non-Amazon URLs (e.g. amzn.to short links) are returned unchanged.
function injectTag(urlStr, tag) {
  try {
    const u = new URL(urlStr);
    if (u.hostname.includes("amazon.com")) {
      u.searchParams.set("tag", tag);
      return u.toString();
    }
    return urlStr;
  } catch { return urlStr; }
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

  const cookies     = parseCookies(req);
  const refUsername = cookies.ca_ref || "";
  const amazonTag   = refUsername ? buildTag(refUsername) : FALLBACK_TAG;

  const dest = injectTag(decoded, amazonTag);
  res.setHeader("Location", dest);
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  return res.status(302).end();
};
