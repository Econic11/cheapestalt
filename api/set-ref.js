"use strict";
// Stores the partner referral code in a 30-day first-party cookie.
// Called on page load when ?ref= is present in the URL.
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  const ref = (req.query && req.query.ref) || "";
  if (!ref || !/^[a-zA-Z0-9_-]{1,50}$/.test(ref)) {
    return res.status(400).json({ ok: false, error: "invalid ref" });
  }

  const maxAge = 30 * 24 * 60 * 60; // 30 days
  res.setHeader("Set-Cookie", `ca_ref=${ref}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ ok: true });
};
