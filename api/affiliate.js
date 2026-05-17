"use strict";
const https  = require("https");
const crypto = require("crypto");

const ADMIN_SECRET = process.env.ADMIN_SECRET      || "cheapestalt-admin-2026";
const SUPABASE_URL = process.env.SUPABASE_URL      || "";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "";
const PROD_MODEL   = "claude-sonnet-4-6";
const PROD_SITE    = "https://cheapestalt.com";

function esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function parseCookies(req){ return Object.fromEntries((req.headers.cookie||"").split(";").map(c=>{const[k,...v]=c.trim().split("=");return[k,v.join("=")];}).filter(([k])=>k)); }
function isAuthed(req){ const t=parseCookies(req)["admin_token"]||""; return crypto.createHash("sha256").update(ADMIN_SECRET).digest("hex")===t; }
function readBody(req){ return new Promise((res,rej)=>{const c=[];req.on("data",d=>c.push(d));req.on("end",()=>res(Buffer.concat(c)));req.on("error",rej);}); }
function mkSlug(s){return String(s||"").toLowerCase().replace(/[^a-z0-9\s-]/g,"").replace(/\s+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,80);}

function dbInsert(table,row){
  if(!SUPABASE_URL||!SUPABASE_KEY) return Promise.resolve({error:"no-config"});
  const host=SUPABASE_URL.replace(/^https?:\/\//,"");
  const body=Buffer.from(JSON.stringify(row));
  return new Promise(resolve=>{
    const req=https.request({hostname:host,path:"/rest/v1/"+table+"?on_conflict=slug",method:"POST",
      headers:{"apikey":SUPABASE_KEY,"Authorization":"Bearer "+SUPABASE_KEY,"Content-Type":"application/json","Content-Length":body.length,"Prefer":"resolution=merge-duplicates"}
    },r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>resolve(r.statusCode<300?{error:null}:{error:d.slice(0,300)}));});
    req.on("error",e=>resolve({error:e.message}));
    req.write(body);req.end();
  });
}

function callClaude(apiKey,sys,usr){
  const b=JSON.stringify({model:PROD_MODEL,max_tokens:4000,system:sys,messages:[{role:"user",content:usr}]});
  return new Promise((ok,fail)=>{
    const req=https.request({hostname:"api.anthropic.com",path:"/v1/messages",method:"POST",
      headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(b),"x-api-key":apiKey,"anthropic-version":"2023-06-01"}
    },r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>ok({status:r.statusCode,raw:d}));});
    req.on("error",fail);req.setTimeout(55000,()=>req.destroy(new Error("timeout")));
    req.write(b);req.end();
  });
}

function xJSON(text){
  let s=text.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim();
  const a=s.indexOf("{"),b=s.lastIndexOf("}");if(a!==-1&&b!==-1)s=s.slice(a,b+1);
  s=s.replace(/['']/g,"'").replace(/[""]/g,'"').replace(/,(\s*[}\]])/g,"$1");
  return JSON.parse(s);
}

function buildProdBody(data,affLink){
  const btn='<a href="'+esc(affLink)+'" target="_blank" rel="noopener sponsored" style="display:inline-block;background:#1A56DB;color:#fff;padding:14px 28px;border-radius:10px;font-weight:700;text-decoration:none;font-size:16px;">Check Price on Amazon &#x2192;</a>';
  const H2=t=>'<h2 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 20px;">'+t+'</h2>';
  const pros=(Array.isArray(data.pros)?data.pros:[]).map(p=>'<li style="display:flex;gap:10px;margin-bottom:10px;"><span style="color:#16A34A;font-size:18px;">&#10003;</span><span>'+esc(p)+'</span></li>').join('');
  const cons=(Array.isArray(data.cons)?data.cons:[]).map(c=>'<li style="display:flex;gap:10px;margin-bottom:10px;"><span style="color:#DC2626;font-size:18px;">&#10007;</span><span>'+esc(c)+'</span></li>').join('');
  const faq=(Array.isArray(data.faq)?data.faq:[]).map(f=>'<details style="border:1px solid #E5E7EB;border-radius:8px;margin-bottom:10px;overflow:hidden;"><summary style="padding:16px;cursor:pointer;font-weight:600;font-size:15px;list-style:none;">'+esc(f.question||'')+'</summary><div style="padding:0 16px 16px;color:#374151;line-height:1.7;">'+esc(f.answer||'')+'</div></details>').join('');
  return '<section style="margin-bottom:48px;">'+H2('Why It Is Worth It')+(data.description_html||'')+'<p style="margin-top:24px;">'+btn+'</p></section>'
    +'<section style="margin-bottom:48px;">'+H2('Pros &amp; Cons')+'<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">'
    +'<div style="background:#F0FDF4;border:1.5px solid #BBF7D0;border-radius:12px;padding:24px;"><h3 style="color:#166534;font-weight:700;margin-bottom:14px;">Pros</h3><ul style="list-style:none;padding:0;">'+pros+'</ul></div>'
    +'<div style="background:#FEF2F2;border:1.5px solid #FECACA;border-radius:12px;padding:24px;"><h3 style="color:#991B1B;font-weight:700;margin-bottom:14px;">Cons</h3><ul style="list-style:none;padding:0;">'+cons+'</ul></div>'
    +'</div></section>'
    +'<section style="margin-bottom:48px;">'+H2('Frequently Asked Questions')+faq+'</section>';
}

function loginPage(err){
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Admin Login</title>'
    +'<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#0F172A;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}.b{background:#1E293B;border:1px solid #334155;border-radius:16px;padding:40px;width:320px}.t{font-size:20px;font-weight:800;text-align:center;margin-bottom:24px}em{color:#1A56DB;font-style:normal}label{display:block;font-size:13px;font-weight:600;color:#94A3B8;margin-bottom:5px}input{width:100%;background:#0F172A;border:1.5px solid #334155;border-radius:8px;padding:10px 14px;color:#fff;font-size:14px;outline:none;margin-bottom:14px}input:focus{border-color:#1A56DB}button{width:100%;background:#1A56DB;color:#fff;border:none;border-radius:8px;padding:12px;font-size:15px;font-weight:700;cursor:pointer}.e{background:#FEF2F2;color:#DC2626;border-radius:8px;padding:8px 12px;font-size:13px;margin-bottom:12px}</style>'
    +'</head><body><div class="b"><div class="t">Cheapest<em>Alt</em> Admin</div>'
    +(err?'<div class="e">Wrong password.</div>':'')
    +'<form method="POST" action="/add-product"><label>Password</label><input type="password" name="password" autofocus required/><button type="submit">Login</button></form>'
    +'</div></body></html>';
}

function formPage(){
  return '<!DOCTYPE html><html lang="en"><head>'
    +'<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>'
    +'<title>Add Product — CheapestAlt</title><meta name="robots" content="noindex,nofollow"/>'
    +'<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet"/>'
    +'<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:"DM Sans",sans-serif;background:#F8FAFC;color:#1E293B;min-height:100vh}.hdr{background:#fff;border-bottom:1.5px solid #E2E8F0;padding:0 24px;height:58px;display:flex;align-items:center;justify-content:space-between}.logo{font-size:18px;font-weight:800;color:#1A56DB;text-decoration:none}.wrap{max-width:660px;margin:48px auto;padding:0 24px 80px}h1{font-size:26px;font-weight:700;color:#111827;margin-bottom:8px}.sub{color:#64748B;font-size:14px;margin-bottom:32px}.field{margin-bottom:20px}label{display:block;font-size:14px;font-weight:600;color:#374151;margin-bottom:6px}textarea,input{width:100%;border:1.5px solid #D1D5DB;border-radius:8px;padding:12px 14px;font-family:inherit;font-size:15px;color:#1E293B;outline:none;background:#fff}textarea{resize:vertical;min-height:90px}textarea:focus,input:focus{border-color:#1A56DB}.btn{display:block;width:100%;background:#1A56DB;color:#fff;border:none;border-radius:10px;padding:15px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:8px}.btn:hover{background:#0F3A9B}.btn:disabled{background:#94A3B8;cursor:not-allowed}.spin{display:none;text-align:center;padding:20px;color:#64748B}.ring{display:inline-block;width:18px;height:18px;border:3px solid #E2E8F0;border-top-color:#1A56DB;border-radius:50%;animation:sp .7s linear infinite;margin-right:8px;vertical-align:middle}@keyframes sp{to{transform:rotate(360deg)}}.result{display:none;padding:18px 20px;border-radius:10px;margin-top:20px;font-size:14px;line-height:1.7}.ok{background:#DCFCE7;border:1px solid #86EFAC;color:#166534}.er{background:#FEE2E2;border:1px solid #FCA5A5;color:#991B1B}.result a{color:#1A56DB;font-weight:600}</style>'
    +'</head><body>'
    +'<header class="hdr"><a href="/" class="logo">CheapestAlt</a><a href="/add-product?logout=1" style="color:#64748B;font-size:13px;text-decoration:none;">Logout</a></header>'
    +'<main class="wrap">'
    +'<h1>Add Affiliate Product</h1>'
    +'<p class="sub">Paste the Amazon title and affiliate link. Claude generates the full SEO article and saves it as a draft in Supabase.</p>'
    +'<div class="field"><label>Amazon Product Title</label><textarea id="ttl" placeholder="e.g. GoveeLife Smart Nugget Ice Maker Pro, 60lbs Daily..." required></textarea></div>'
    +'<div class="field"><label>Your Affiliate Link</label><input type="url" id="lnk" placeholder="https://amzn.to/xxxxxxx" required/></div>'
    +'<button class="btn" id="btn" onclick="go()">Generate Article with Claude ✨</button>'
    +'<div class="spin" id="spin"><span class="ring"></span>Calling Claude — takes 20–30 seconds…</div>'
    +'<div class="result" id="res"></div>'
    +'</main>'
    +'<script>'
    +'async function go(){'
    +'var btn=document.getElementById("btn"),sp=document.getElementById("spin"),rs=document.getElementById("res");'
    +'var t=document.getElementById("ttl").value.trim(),l=document.getElementById("lnk").value.trim();'
    +'if(!t||!l){alert("Please fill both fields.");return;}'
    +'btn.disabled=true;btn.textContent="Generating…";sp.style.display="block";rs.style.display="none";'
    +'try{'
    +'var r=await fetch("/add-product",{method:"POST",headers:{"Content-Type":"application/json","X-Admin-Token":document.cookie},body:JSON.stringify({amazon_title:t,affiliate_link:l})});'
    +'var d=await r.json();sp.style.display="none";rs.style.display="block";'
    +'if(d.ok){rs.className="result ok";rs.innerHTML="<strong>✓ Saved as draft!</strong><br/><br/>URL: <a href=\'"+d.article_url+"\' target=\'_blank\'>"+d.article_url+"</a><br/><br/><em>In Supabase → affiliate_products → set status to <strong>published</strong>.</em>";document.getElementById("ttl").value="";document.getElementById("lnk").value="";}'
    +'else{rs.className="result er";rs.innerHTML="<strong>Error:</strong> "+(d.error||"Unknown");}'
    +'}catch(e){sp.style.display="none";rs.style.display="block";rs.className="result er";rs.innerHTML="<strong>Network error:</strong> "+e.message;}'
    +'btn.disabled=false;btn.textContent="Generate Article with Claude ✨";'
    +'}'
    +'</script>'
    +'</body></html>';
}

module.exports = async function handler(req, res){
  if(req.method==="OPTIONS") return res.status(204).end();

  // Logout
  if((req.url||"").includes("logout=1")){
    res.setHeader("Set-Cookie","admin_token=; Path=/; Max-Age=0; HttpOnly");
    res.setHeader("Location","/add-product");
    return res.status(302).end();
  }

  // POST — either login or generate article
  if(req.method==="POST"){
    const buf = await readBody(req);

    // Check if it's a login form (application/x-www-form-urlencoded)
    const ct = req.headers["content-type"]||"";
    if(ct.includes("application/x-www-form-urlencoded")){
      const params = new URLSearchParams(buf.toString());
      const password = (params.get("password")||"").trim();
      if(password === ADMIN_SECRET){
        const token = crypto.createHash("sha256").update(ADMIN_SECRET).digest("hex");
        res.setHeader("Set-Cookie","admin_token="+token+"; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax");
        res.setHeader("Location","/add-product");
        return res.status(302).end();
      }
      res.setHeader("Content-Type","text/html; charset=utf-8");
      return res.status(401).send(loginPage(true));
    }

    // Otherwise it's the article generation POST (JSON)
    if(!isAuthed(req)) return res.status(401).json({ok:false,error:"Not authenticated"});

    const apiKey = process.env.CLAUDE_API_KEY;
    if(!apiKey) return res.status(500).json({ok:false,error:"CLAUDE_API_KEY not set in Vercel environment variables"});
    if(!SUPABASE_URL) return res.status(500).json({ok:false,error:"SUPABASE_URL not set"});

    let body;
    try{ body=JSON.parse(buf.toString()); }
    catch{ return res.status(400).json({ok:false,error:"Invalid JSON"}); }

    const amazonTitle=(body.amazon_title||"").trim();
    const affiliateLink=(body.affiliate_link||"").trim();
    if(!amazonTitle) return res.status(400).json({ok:false,error:"amazon_title required"});
    if(!affiliateLink) return res.status(400).json({ok:false,error:"affiliate_link required"});

    const sys='You are an expert SEO copywriter for an Amazon affiliate website. Return ONLY valid JSON — no markdown, no backticks, no explanation. Fields required: seo_title (string, compelling, includes product name + 2025), seo_subtitle (string, one benefit sentence under 120 chars), meta_description (string, max 155 chars), slug (string, url-safe lowercase hyphens only, max 60 chars), description_html (string, 3-4 HTML paragraphs using <p> tags, professional review tone), pros (array of exactly 5 strings), cons (array of exactly 3 strings), faq (array of exactly 5 objects each with "question" string and "answer" string).';
    const usr='Write a complete SEO affiliate product article for this Amazon product:\n\n'+amazonTitle+'\n\nReturn ONLY the JSON object. Nothing else.';

    let claudeData;
    try{
      const cr = await callClaude(apiKey,sys,usr);
      if(cr.status!==200) return res.status(502).json({ok:false,error:"Claude API error HTTP "+cr.status});
      const parsed = JSON.parse(cr.raw);
      const txt = parsed&&parsed.content&&parsed.content[0]&&parsed.content[0].text;
      if(!txt) return res.status(502).json({ok:false,error:"Empty Claude response"});
      claudeData = xJSON(txt);
    }catch(e){ return res.status(502).json({ok:false,error:"Claude failed: "+e.message}); }

    const slug = mkSlug(claudeData.slug||claudeData.seo_title||amazonTitle);
    if(!slug) return res.status(400).json({ok:false,error:"Could not generate slug"});

    const articleUrl = PROD_SITE+"/products/"+slug;
    const articleBody = buildProdBody(claudeData,affiliateLink);

    const row={
      amazon_title:amazonTitle, affiliate_link:affiliateLink, slug,
      seo_title:claudeData.seo_title||amazonTitle,
      seo_subtitle:claudeData.seo_subtitle||"",
      meta_description:(claudeData.meta_description||"").slice(0,155),
      article_body:articleBody, article_url:articleUrl, status:"published"
    };

    const{error:dbErr}=await dbInsert("affiliate_products",row);
    if(dbErr) return res.status(500).json({ok:false,error:"DB save failed: "+String(dbErr).slice(0,200)});

    return res.status(200).json({ok:true,slug,article_url:articleUrl});
  }

  // GET — show login or form
  if(!isAuthed(req)){
    res.setHeader("Content-Type","text/html; charset=utf-8");
    return res.status(200).send(loginPage(false));
  }
  res.setHeader("Content-Type","text/html; charset=utf-8");
  return res.status(200).send(formPage());
};
