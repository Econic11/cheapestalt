# CheapestAlt — Vercel Deployment Guide

## Project Structure

```
project/
├── index.html          ← Complete frontend (UI + AI-wired JS)
├── api/
│   ├── search.js       ← Vercel Edge Function: product search via Claude Haiku
│   └── compare.js      ← Vercel Edge Function: comparison via Claude Sonnet
├── vercel.json         ← Vercel configuration
├── package.json
└── .gitignore
```

---

## Step 1 — Prerequisites

- A [Vercel account](https://vercel.com) (free tier works)
- A [GitHub account](https://github.com) (free)
- An [Anthropic API key](https://console.anthropic.com)

---

## Step 2 — Push to GitHub

```bash
cd project
git init
git add .
git commit -m "Initial CheapestAlt deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/cheapestalt.git
git push -u origin main
```

---

## Step 3 — Deploy to Vercel

### Option A: Vercel Dashboard (recommended for beginners)

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **"Import Git Repository"**
3. Select your `cheapestalt` GitHub repo
4. Click **"Deploy"** — Vercel auto-detects the config

### Option B: Vercel CLI

```bash
npm install -g vercel
vercel login
vercel --prod
```

---

## Step 4 — Add Environment Variable (CRITICAL)

Your API key must be set in Vercel — **never put it in code**.

1. Go to your project on [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click **Settings** → **Environment Variables**
3. Add:

| Name | Value | Environment |
|------|-------|-------------|
| `CLAUDE_API_KEY` | `sk-ant-api03-...` | Production, Preview, Development |

4. Click **Save**
5. **Redeploy**: Go to Deployments → click the three dots → **Redeploy**

---

## Step 5 — Test Your Deployment

```bash
# Test search endpoint
curl -X POST https://YOUR-PROJECT.vercel.app/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "AirPods Pro"}'

# Test compare endpoint
curl -X POST https://YOUR-PROJECT.vercel.app/api/compare \
  -H "Content-Type: application/json" \
  -d '{"productA": "AirPods Pro", "productB": "Sony WF-1000XM5"}'
```

Both should return JSON with product data.

---

## Step 6 — Local Development

```bash
# Install Vercel CLI
npm install

# Create local env file
echo "CLAUDE_API_KEY=sk-ant-api03-YOUR_KEY_HERE" > .env.local

# Run locally (simulates Vercel edge functions)
npm run dev
# Opens at http://localhost:3000
```

---

## API Reference

### POST /api/search

**Request:**
```json
{ "query": "AirPods Pro" }
```

**Response:**
```json
{
  "query": "AirPods Pro",
  "seoSlug": "airpods-pro-alternatives",
  "original": {
    "name": "Apple AirPods Pro (2nd Gen)",
    "price": 249,
    "rating": 4.8,
    "reviews": 42000,
    "icon": "🎧",
    "links": {
      "amazon": "https://www.amazon.com/s?k=Apple+AirPods+Pro+...",
      "walmart": "https://www.walmart.com/search?q=...",
      "ebay": "https://www.ebay.com/sch/i.html?_nkw=..."
    }
  },
  "alternatives": [
    {
      "name": "Samsung Galaxy Buds2 Pro",
      "price": 139,
      "rating": 4.5,
      "reviews": 18000,
      "icon": "🎵",
      "save": "Save 44%",
      "reason": "Similar ANC performance at a much lower price.",
      "links": { ... }
    }
  ],
  "generatedAt": "2025-01-15T10:30:00.000Z"
}
```

### POST /api/compare

**Request:**
```json
{ "productA": "AirPods Pro", "productB": "Sony WF-1000XM5" }
```

**Response:**
```json
{
  "seoSlug": "apple-airpods-pro-2nd-gen-vs-sony-wf-1000xm5",
  "productA": { "name": "...", "price": 249, "pros": [...], "cons": [...], "links": {...} },
  "productB": { "name": "...", "price": 198, "pros": [...], "cons": [...], "links": {...} },
  "comparison": [
    { "feature": "Price", "a": "$249", "b": "$198", "winner": "b" }
  ],
  "intro": "...",
  "verdict": "...",
  "winner": "Sony WF-1000XM5",
  "winnerReason": "...",
  "generatedAt": "2025-01-15T10:30:00.000Z"
}
```

---

## SEO Pages (Future)

The API returns `seoSlug` fields for generating pages like:

- `/alternatives/airpods-pro`
- `/airpods-pro-vs-sony-wf-1000xm5`

To implement these, create:
- `app/alternatives/[slug]/page.js` (Next.js) or
- `pages/alternatives/[slug].js` (Next.js Pages Router)

Use `getStaticProps` + `generateStaticParams` with the API to pre-render at build time.

---

## Cost Estimates

| Action | Model | Tokens (est.) | Cost (est.) |
|--------|-------|---------------|-------------|
| Product Search | claude-3-haiku | ~800 in + 600 out | ~$0.0003 |
| Product Compare | claude-3-5-sonnet | ~900 in + 900 out | ~$0.006 |

With caching (Redis/Supabase), repeat searches cost $0.

---

## Affiliate Tag

Update your Amazon affiliate tag in `index.html`:

```js
// Line in affiliateLink() function:
return `https://www.amazon.com/s?k=${q}&tag=YOUR-TAG-HERE`;
```

Replace `cheapestalt-20` with your Amazon Associates tag.
