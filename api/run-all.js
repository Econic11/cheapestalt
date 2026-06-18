"use strict";
// api/run-all.js
// Calls run-trending logic DIRECTLY (no HTTP self-call — that causes Vercel deadlock)
// Triggered by: cron-job.org OR GET /api/run-all?secret=cheapestalt-stories-2026

const trendingHandler = require("../lib/run-trending");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  const secret = process.env.STORIES_SECRET || "cheapestalt-stories-2026";
  const given  = (req.query && req.query.secret) || "";
  const isCron = req.headers["x-vercel-cron"] === "1";

  if (!isCron && given !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  console.log("=== run-all START ===", new Date().toISOString());

  // Call run-trending handler directly — no HTTP, no deadlock
  return trendingHandler(req, res);
};
