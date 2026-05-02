// lib/supabase.js
// Supabase client — used by all API functions for permanent page storage
// Env vars required: SUPABASE_URL, SUPABASE_ANON_KEY

const https = require("https");

// ─── Lightweight Supabase REST client (no npm package needed) ────────────────
// Uses native https — works in any Vercel Node.js function without extra deps

function supabaseRequest(method, table, body, params) {
  const url    = process.env.SUPABASE_URL;
  const apiKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !apiKey) {
    return Promise.reject(new Error("SUPABASE_URL or SUPABASE_ANON_KEY not set"));
  }

  const host    = url.replace("https://", "").replace("http://", "");
  let   path    = `/rest/v1/${table}`;
  if (params)   path += "?" + new URLSearchParams(params).toString();

  const payload = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    const headers = {
      "apikey":        apiKey,
      "Authorization": "Bearer " + apiKey,
      "Content-Type":  "application/json",
      "Prefer":        method === "POST" ? "return=representation" : "return=minimal",
    };
    if (payload) headers["Content-Length"] = Buffer.byteLength(payload);

    const req = https.request(
      { hostname: host, path, method, headers },
      (res) => {
        let raw = "";
        res.on("data", c => raw += c);
        res.on("end", () => {
          let data = null;
          try { data = JSON.parse(raw); } catch {}
          if (res.statusCode >= 400) {
            resolve({ data: null, error: data || { message: raw } });
          } else {
            resolve({ data, error: null });
          }
        });
      }
    );
    req.on("error", err => resolve({ data: null, error: { message: err.message } }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ data: null, error: { message: "Supabase timeout" } }); });
    if (payload) req.write(payload);
    req.end();
  });
}

const supabase = {
  // SELECT — fetch one row by column value
  async select(table, column, value) {
    return supabaseRequest("GET", table, null, {
      [column]: `eq.${value}`,
      select: "*",
      limit: 1,
    });
  },

  // INSERT — save a new row
  async insert(table, row) {
    return supabaseRequest("POST", table, row);
  },

  // UPSERT — insert or update if slug already exists
  async upsert(table, row, onConflict) {
    return supabaseRequest("POST", table, row, onConflict ? { on_conflict: onConflict } : null);
  },
};

module.exports = { supabase };
