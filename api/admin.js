"use strict";
const https  = require("https");
const crypto = require("crypto");

const ADMIN_SECRET = process.env.ADMIN_SECRET      || "cheapestalt-admin-2026";
const SUPABASE_URL = process.env.SUPABASE_URL      || "";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "";
const BUCKET       = "stories";
const TAG          = "cheapestalt-20";
const PROD_MODEL   = "claude-sonnet-4-6";
const PROD_SITE    = "https://cheapestalt.com";

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function parseCookies(req){
  return Object.fromEntries((req.headers.cookie||"").split(";").map(c=>{
    const[k,...v]=c.trim().split("=");return[k,v.join("=")];
  }).filter(([k])=>k));
}
function isAuthed(req){
  const t=parseCookies(req)["admin_token"]||"";
  return crypto.createHash("sha256").update(ADMIN_SECRET).digest("hex")===t;
}
function readBody(req){
  return new Promise((res,rej)=>{const c=[];req.on("data",d=>c.push(d));req.on("end",()=>res(Buffer.concat(c)));req.on("error",rej);});
}

// ── Detect if this request is for add-product ─────────────────────────────────
// Vercel rewrites /admin/add-product → /api/admin
// We detect it via the Referer, x-matched-path, x-vercel-rewrite-for, or a cookie flag
function detectPage(req){
  const allHeaders = JSON.stringify(req.headers).toLowerCase();
  const url = (req.url||"").toLowerCase();
  
  // Check every possible header Vercel might send
  const rewriteFor = req.headers["x-vercel-rewrite-for"] || "";
  const matchedPath = req.headers["x-matched-path"] || "";
  const forwarded = req.headers["x-forwarded-host"] || "";
  const referer = req.headers["referer"] || "";
  
  if(
    rewriteFor.includes("add-product") ||
    matchedPath.includes("add-product") ||
    url.includes("add-product") ||
    url.includes("action=addproduct") ||
    referer.includes("add-product") ||
    parseCookies(req)["admin_page"] === "add-product"
  ){
    return "add-product";
  }
  return "dashboard";
}

// ── Upload image to Supabase Storage ──────────────────────────────────────────
function uploadToStorage(filename, contentType, data){
  if(!SUPABASE_URL||!SUPABASE_KEY) return Promise.resolve({url:null,error:"no-config"});
  const host = SUPABASE_URL.replace(/^https?:\/\//,"");
  return new Promise(resolve=>{
    const req = https.request({
      hostname:host, path:"/storage/v1/object/"+BUCKET+"/"+filename,
      method:"POST",
      headers:{
        "apikey":SUPABASE_KEY,"Authorization":"Bearer "+SUPABASE_KEY,
        "Content-Type":contentType,"Content-Length":data.length,"x-upsert":"true"
      }
    },r=>{
      let d="";r.on("data",c=>d+=c);
      r.on("end",()=>{
        if(r.statusCode<300){
          resolve({url:SUPABASE_URL+"/storage/v1/object/public/"+BUCKET+"/"+filename,error:null});
        }else{
          resolve({url:null,error:"HTTP "+r.statusCode+": "+d.slice(0,150)});
        }
      });
    });
    req.on("error",e=>resolve({url:null,error:e.message}));
    req.setTimeout(30000,()=>{req.destroy();resolve({url:null,error:"timeout"});});
    req.write(data);req.end();
  });
}

// ── Parse multipart ───────────────────────────────────────────────────────────
function parseMultipart(body, boundary){
  const parts=[];
  const sep=Buffer.from("--"+boundary);
  let pos=0;
  while(pos<body.length){
    const s=body.indexOf(sep,pos);if(s===-1)break;
    const hs=s+sep.length+2;
    const he=body.indexOf(Buffer.from("\r\n\r\n"),hs);if(he===-1)break;
    const headers=body.slice(hs,he).toString();
    const ds=he+4;
    const de=body.indexOf(Buffer.from("\r\n--"+boundary),ds);if(de===-1)break;
    const data=body.slice(ds,de);
    const nm=headers.match(/name="([^"]+)"/);
    const fn=headers.match(/filename="([^"]+)"/);
    const ct=headers.match(/Content-Type:\s*([^\r\n]+)/i);
    parts.push({name:nm?nm[1]:"",filename:fn?fn[1]:null,contentType:ct?ct[1].trim():"application/octet-stream",data});
    pos=de+2;
  }
  return parts;
}

// ── Supabase DB insert ────────────────────────────────────────────────────────
function dbInsert(table,row){
  if(!SUPABASE_URL||!SUPABASE_KEY) return Promise.resolve({error:"no-config"});
  const host=SUPABASE_URL.replace(/^https?:\/\//,"");
  const body=Buffer.from(JSON.stringify(row));
  return new Promise(resolve=>{
    const req=https.request({
      hostname:host,path:"/rest/v1/"+table+"?on_conflict=slug",method:"POST",
      headers:{"apikey":SUPABASE_KEY,"Authorization":"Bearer "+SUPABASE_KEY,
        "Content-Type":"application/json","Content-Length":body.length,"Prefer":"resolution=merge-duplicates"}
    },r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>resolve(r.statusCode<300?{error:null}:{error:d.slice(0,300)}));});
    req.on("error",e=>resolve({error:e.message}));
    req.write(body);req.end();
  });
}

// ── Claude API ────────────────────────────────────────────────────────────────
function callClaude(apiKey,sys,usr){
  const b=JSON.stringify({model:PROD_MODEL,max_tokens:4000,system:sys,messages:[{role:"user",content:usr}]});
  return new Promise((ok,fail)=>{
    const req=https.request({hostname:"api.anthropic.com",path:"/v1/messages",method:"POST",
      headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(b),"x-api-key":apiKey,"anthropic-version":"2023-06-01"}
    },r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>ok({status:r.statusCode,raw:d}));});
    req.on("error",fail);req.setTimeout(55000,()=>req.destroy(new Error("Claude timeout")));
    req.write(b);req.end();
  });
}
function xJSON(text){
  let s=text.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim();
  const a=s.indexOf("{"),b=s.lastIndexOf("}");if(a!==-1&&b!==-1)s=s.slice(a,b+1);
  s=s.replace(/['']/g,"'").replace(/[""]/g,'"').replace(/,(\s*[}\]])/g,"$1");
  return JSON.parse(s);
}
function mkProdSlug(s){return String(s||"").toLowerCase().replace(/[^a-z0-9\s-]/g,"").replace(/\s+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,80);}

// ── Build article HTML body ───────────────────────────────────────────────────
function buildProdBody(data,affLink){
  const cS='display:inline-block;background:#1A56DB;color:#fff;padding:14px 28px;border-radius:10px;font-weight:700;text-decoration:none;font-size:16px;';
  const cBtn=label=>'<a href="'+esc(affLink)+'" target="_blank" rel="noopener sponsored" style="'+cS+'">'+esc(label)+' &#x2192;</a>';
  const H2=t=>'<h2 style="font-family:Syne,system-ui,sans-serif;font-size:26px;font-weight:700;color:#111827;margin-bottom:20px;">'+t+'</h2>';
  const pR=(Array.isArray(data.pros)?data.pros:[]).map(p=>'<li style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;"><span style="color:#16A34A;font-size:18px;line-height:1.3;flex-shrink:0;">&#10003;</span><span>'+esc(p)+'</span></li>').join('');
  const cR=(Array.isArray(data.cons)?data.cons:[]).map(c=>'<li style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;"><span style="color:#DC2626;font-size:18px;line-height:1.3;flex-shrink:0;">&#10007;</span><span>'+esc(c)+'</span></li>').join('');
  const fR=(Array.isArray(data.faq)?data.faq:[]).map(f=>'<details style="border:1px solid #E5E7EB;border-radius:8px;margin-bottom:10px;overflow:hidden;"><summary style="padding:16px;cursor:pointer;font-weight:600;font-size:15px;color:#111827;list-style:none;display:flex;justify-content:space-between;align-items:center;">'+esc(f.question||f.q||'')+'<span style="font-size:20px;color:#6B7280;margin-left:12px;flex-shrink:0;">+</span></summary><div style="padding:0 16px 16px;font-size:15px;color:#374151;line-height:1.7;">'+esc(f.answer||f.a||'')+'</div></details>').join('');
  return '<section id="description" style="margin-bottom:48px;">\n'+H2('Why '+esc(data.seo_title||'')+' Is Worth It')+'\n'+(data.description_html||'<p>No description available.</p>')+'\n<p style="margin-top:24px;">'+cBtn('Check Price on Amazon')+'</p>\n</section>\n'
    +'<section id="pros-cons" style="margin-bottom:48px;">\n'+H2('Pros &amp; Cons')+'\n<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">\n'
    +'<div style="background:#F0FDF4;border:1.5px solid #BBF7D0;border-radius:12px;padding:24px;"><h3 style="font-family:Syne,system-ui,sans-serif;font-size:16px;font-weight:700;color:#166534;margin-bottom:14px;">Pros</h3><ul style="list-style:none;padding:0;margin:0;">'+pR+'</ul></div>\n'
    +'<div style="background:#FEF2F2;border:1.5px solid #FECACA;border-radius:12px;padding:24px;"><h3 style="font-family:Syne,system-ui,sans-serif;font-size:16px;font-weight:700;color:#991B1B;margin-bottom:14px;">Cons</h3><ul style="list-style:none;padding:0;margin:0;">'+cR+'</ul></div>\n'
    +'</div>\n</section>\n'
    +'<section id="faq" style="margin-bottom:48px;">\n'+H2('Frequently Asked Questions')+'\n'+fR+'\n</section>\n';
}

// ── Login page ────────────────────────────────────────────────────────────────
function loginPage(err, redirectTo){
  const dest = redirectTo ? '?next='+encodeURIComponent(redirectTo) : '';
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>'
    +'<title>Admin Login — CheapestAlt</title><style>'
    +'*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#0F172A;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}'
    +'.b{background:#1E293B;border:1px solid #334155;border-radius:16px;padding:40px;width:320px}'
    +'.t{font-size:20px;font-weight:800;text-align:center;margin-bottom:24px}em{color:#1A56DB;font-style:normal}'
    +'label{display:block;font-size:13px;font-weight:600;color:#94A3B8;margin-bottom:5px}'
    +'input{width:100%;background:#0F172A;border:1.5px solid #334155;border-radius:8px;padding:10px 14px;color:#fff;font-size:14px;outline:none;margin-bottom:14px}'
    +'input:focus{border-color:#1A56DB}button{width:100%;background:#1A56DB;color:#fff;border:none;border-radius:8px;padding:12px;font-size:15px;font-weight:700;cursor:pointer}'
    +'.e{background:#FEF2F2;color:#DC2626;border-radius:8px;padding:8px 12px;font-size:13px;margin-bottom:12px}'
    +'</style></head><body><div class="b">'
    +'<div class="t">Cheapest<em>Alt</em> Admin</div>'
    +(err?'<div class="e">Wrong password.</div>':'')
    +'<form method="POST" action="/admin/auth'+dest+'">'
    +'<label>Password</label><input type="password" name="password" autofocus required/>'
    +'<button type="submit">Login</button></form></div></body></html>';
}

// ── Add Product page ──────────────────────────────────────────────────────────
function buildAddProductPage(){
  const css='*{box-sizing:border-box;margin:0;padding:0}'
    +'body{font-family:"DM Sans",system-ui,sans-serif;background:#F8FAFC;color:#1E293B;min-height:100vh}'
    +'.hdr{background:#fff;border-bottom:1.5px solid #E2E8F0;padding:0 24px;height:58px;display:flex;align-items:center;justify-content:space-between}'
    +'.logo{font-size:18px;font-weight:800;color:#1A56DB;text-decoration:none}'
    +'.hl{color:#64748B;font-size:13px;text-decoration:none}'
    +'.wrap{max-width:680px;margin:48px auto;padding:0 24px 80px}'
    +'h1{font-size:26px;font-weight:700;color:#111827;margin-bottom:6px}'
    +'.sub{color:#64748B;font-size:14px;line-height:1.6;margin-bottom:32px}'
    +'.field{margin-bottom:20px}'
    +'label{display:block;font-size:14px;font-weight:600;color:#374151;margin-bottom:6px}'
    +'textarea,input[type=url]{width:100%;border:1.5px solid #D1D5DB;border-radius:8px;padding:12px 14px;font-family:inherit;font-size:15px;color:#1E293B;outline:none;background:#fff;transition:border-color .2s}'
    +'textarea{resize:vertical;min-height:90px}'
    +'textarea:focus,input:focus{border-color:#1A56DB;box-shadow:0 0 0 3px rgba(26,86,219,.12)}'
    +'.btn{display:block;width:100%;background:#1A56DB;color:#fff;border:none;border-radius:10px;padding:15px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;transition:background .2s;margin-top:8px}'
    +'.btn:hover{background:#0F3A9B}.btn:disabled{background:#94A3B8;cursor:not-allowed}'
    +'.spin{display:none;text-align:center;padding:24px 0;color:#64748B;font-size:14px}'
    +'.ring{display:inline-block;width:20px;height:20px;border:3px solid #E2E8F0;border-top-color:#1A56DB;border-radius:50%;animation:spin .7s linear infinite;margin-right:10px;vertical-align:middle}'
    +'@keyframes spin{to{transform:rotate(360deg)}}'
    +'.result{display:none;padding:20px 24px;border-radius:10px;margin-top:24px;font-size:14px;line-height:1.7}'
    +'.ok{background:#DCFCE7;border:1px solid #86EFAC;color:#166534}'
    +'.er{background:#FEE2E2;border:1px solid #FCA5A5;color:#991B1B}'
    +'.result a{color:#1A56DB;font-weight:600;word-break:break-all}'
    +'hr{border:none;border-top:1px solid #E2E8F0;margin:32px 0}'
    +'@media(max-width:600px){.wrap{padding:0 16px 60px;margin-top:24px}h1{font-size:22px}}';

  const js='document.getElementById("form").addEventListener("submit",async function(e){'
    +'e.preventDefault();'
    +'var btn=document.getElementById("btn"),sp=document.getElementById("spinner"),rs=document.getElementById("result");'
    +'var t=document.getElementById("ttl").value.trim(),l=document.getElementById("lnk").value.trim();'
    +'if(!t||!l)return;'
    +'btn.disabled=true;btn.textContent="Generating…";sp.style.display="block";rs.style.display="none";rs.className="result";'
    +'try{'
    +'var r=await fetch("/admin/add-product",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({amazon_title:t,affiliate_link:l})});'
    +'var d=await r.json();'
    +'sp.style.display="none";rs.style.display="block";'
    +'if(d.ok){'
    +'rs.className="result ok";'
    +'rs.innerHTML="<strong>✓ Article saved!</strong><br/><br/>URL: <a href=\'"+d.article_url+"\' target=\'_blank\'>"+d.article_url+"</a><br/><br/><em>Go to Supabase → affiliate_products → set status to <strong>published</strong>.</em>";'
    +'document.getElementById("form").reset();'
    +'}else{'
    +'rs.className="result er";rs.innerHTML="<strong>✗ Error:</strong> "+(d.error||"Unknown error");'
    +'}'
    +'}catch(err){'
    +'sp.style.display="none";rs.style.display="block";rs.className="result er";'
    +'rs.innerHTML="<strong>✗ Network error:</strong> "+err.message;'
    +'}'
    +'btn.disabled=false;btn.textContent="Generate Article with Claude ✨";'
    +'});';

  return '<!DOCTYPE html><html lang="en"><head>'
    +'<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>'
    +'<title>Add Affiliate Product — CheapestAlt Admin</title>'
    +'<meta name="robots" content="noindex,nofollow"/>'
    +'<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>'
    +'<style>'+css+'</style></head><body>'
    +'<header class="hdr"><a href="/" class="logo">CheapestAlt</a><a href="/admin/logout" class="hl">Logout →</a></header>'
    +'<main class="wrap">'
    +'<h1>Add Affiliate Product</h1>'
    +'<p class="sub">Paste the Amazon product title and your affiliate link. Claude generates a full SEO article and saves it as a draft.</p>'
    +'<form id="form" autocomplete="off">'
    +'<div class="field"><label>Amazon Product Title</label><textarea id="ttl" placeholder="e.g. GoveeLife Smart Nugget Ice Maker Pro, 60lbs Daily..." required></textarea></div>'
    +'<div class="field"><label>Your Affiliate Link</label><input type="url" id="lnk" placeholder="https://amzn.to/xxxxxxx" required/></div>'
    +'<button type="submit" class="btn" id="btn">Generate Article with Claude ✨</button>'
    +'</form>'
    +'<div class="spin" id="spinner"><span class="ring"></span>Calling Claude — this takes 20–30 seconds…</div>'
    +'<div class="result" id="result"></div>'
    +'<hr/><a href="/" style="color:#64748B;font-size:13px;text-decoration:none">← Back to site</a>'
    +'</main>'
    +'<script>'+js+'</script>'
    +'</body></html>';
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res){
  res.setHeader("Access-Control-Allow-Origin","*");
  if(req.method==="OPTIONS") return res.status(204).end();

  // Read ALL headers to detect the original path before Vercel rewrote it
  const originalPath = (
    req.headers["x-vercel-rewrite-for"] ||
    req.headers["x-matched-path"] ||
    req.headers["x-invoke-path"] ||
    req.url ||
    ""
  ).toLowerCase();

  const cookies = parseCookies(req);
  const adminPage = cookies["admin_page"] || "";

  const isAddProduct = (
    originalPath.includes("add-product") ||
    originalPath.includes("addproduct") ||
    adminPage === "add-product"
  );

  // ── /admin/logout ──────────────────────────────────────────────────────────
  if(originalPath.includes("logout")){
    res.setHeader("Set-Cookie",[
      "admin_token=; Path=/; Max-Age=0; HttpOnly",
      "admin_page=; Path=/; Max-Age=0; HttpOnly"
    ]);
    res.setHeader("Location","/admin");
    return res.status(302).end();
  }

  // ── /admin/auth (login form POST) ─────────────────────────────────────────
  if(originalPath.includes("auth") && req.method==="POST"){
    const buf=await readBody(req);
    const params=new URLSearchParams(buf.toString());
    const password=(params.get("password")||"").trim();
    const next=params.get("next")||"";
    if(password===ADMIN_SECRET){
      const token=crypto.createHash("sha256").update(ADMIN_SECRET).digest("hex");
      const dest = next || "/admin/add-product";
      const pageFlag = dest.includes("add-product") ? "add-product" : "dashboard";
      res.setHeader("Set-Cookie",[
        "admin_token="+token+"; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax",
        "admin_page="+pageFlag+"; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax"
      ]);
      res.setHeader("Location", dest);
      return res.status(302).end();
    }
    res.setHeader("Content-Type","text/html; charset=utf-8");
    return res.status(401).send(loginPage(true));
  }

  // ── /admin/upload-image ────────────────────────────────────────────────────
  if(originalPath.includes("upload-image") && req.method==="POST"){
    if(!isAuthed(req)) return res.status(401).json({error:"Unauthorized"});
    const ct=req.headers["content-type"]||"";
    const bm=ct.match(/boundary=([^\s;]+)/);
    if(!bm) return res.status(400).json({error:"No boundary in multipart"});
    const body=await readBody(req);
    const parts=parseMultipart(body,bm[1]);
    const filePart=parts.find(p=>p.name==="file");
    const namePart=parts.find(p=>p.name==="filename");
    if(!filePart||!filePart.data||!filePart.data.length)
      return res.status(400).json({error:"No file received"});
    const filename=(namePart&&namePart.data.toString())||("upload-"+Date.now()+".jpg");
    const contentType=filePart.contentType||"image/jpeg";
    const {url:publicUrl, error} = await uploadToStorage(filename, contentType, filePart.data);
    if(error) return res.status(500).json({error:"Storage upload failed: "+error});
    return res.status(200).json({url:publicUrl});
  }

  // ── /admin/add-product (GET = show form, POST = generate article) ──────────
  if(isAddProduct){
    if(!isAuthed(req)){
      res.setHeader("Set-Cookie","admin_page=add-product; Path=/; Max-Age=300; HttpOnly; SameSite=Lax");
      res.setHeader("Content-Type","text/html; charset=utf-8");
      return res.status(200).send(loginPage(false, "/admin/add-product"));
    }
    if(req.method==="GET"){
      // Set cookie so subsequent requests know we're on add-product
      res.setHeader("Set-Cookie","admin_page=add-product; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax");
      res.setHeader("Content-Type","text/html; charset=utf-8");
      return res.status(200).send(buildAddProductPage());
    }
    if(req.method==="POST"){
      const apiKey=process.env.CLAUDE_API_KEY;
      if(!apiKey) return res.status(500).json({ok:false,error:"CLAUDE_API_KEY not set in Vercel environment variables"});
      if(!SUPABASE_URL) return res.status(500).json({ok:false,error:"SUPABASE_URL not set"});
      let body;
      try{body=JSON.parse((await readBody(req)).toString());}
      catch{return res.status(400).json({ok:false,error:"Invalid JSON"});}
      const amazonTitle=(body.amazon_title||"").trim();
      const affiliateLink=(body.affiliate_link||"").trim();
      if(!amazonTitle) return res.status(400).json({ok:false,error:"amazon_title required"});
      if(!affiliateLink) return res.status(400).json({ok:false,error:"affiliate_link required"});
      const sys='You are an expert SEO copywriter. Return ONLY valid JSON — no markdown, no backticks, no extra text. Keys: seo_title (string, compelling, includes product name + 2025), seo_subtitle (string, one benefit sentence), meta_description (string, max 155 chars), slug (string, url-safe lowercase hyphens only), description_html (string, 3-4 HTML paragraphs using <p> tags), pros (array of 5 strings), cons (array of 2-3 strings), faq (array of 5 objects each with "question" and "answer" string keys).';
      const usr='Write a full SEO affiliate product article for:\n\nProduct Title: '+amazonTitle+'\n\nReturn ONLY valid JSON. Use <p> tags in description_html. No text before or after the JSON.';
      let claudeData;
      try{
        const cr=await callClaude(apiKey,sys,usr);
        if(cr.status!==200) return res.status(502).json({ok:false,error:"Claude API error HTTP "+cr.status+": "+cr.raw.slice(0,200)});
        let p;
        try{p=JSON.parse(cr.raw);}
        catch{return res.status(502).json({ok:false,error:"Claude parse failed"});}
        const txt=p&&p.content&&p.content[0]&&p.content[0].text;
        if(!txt) return res.status(502).json({ok:false,error:"Empty Claude response"});
        claudeData=xJSON(txt);
      }catch(e){return res.status(502).json({ok:false,error:"Claude failed: "+e.message});}
      const slug=mkProdSlug(claudeData.slug||claudeData.seo_title||amazonTitle);
      if(!slug) return res.status(400).json({ok:false,error:"Could not generate slug"});
      const articleUrl=PROD_SITE+"/products/"+slug;
      const articleBody=buildProdBody(claudeData,affiliateLink);
      const row={
        amazon_title:amazonTitle, affiliate_link:affiliateLink, slug,
        seo_title:claudeData.seo_title||amazonTitle,
        seo_subtitle:claudeData.seo_subtitle||"",
        meta_description:(claudeData.meta_description||"").slice(0,155),
        article_body:articleBody, article_url:articleUrl, status:"draft"
      };
      const{error:dbErr}=await dbInsert("affiliate_products",row);
      if(dbErr) return res.status(500).json({ok:false,error:"DB save failed: "+String(dbErr).slice(0,200)});
      return res.status(200).json({ok:true,slug,article_url:articleUrl});
    }
    return res.status(405).json({error:"Method not allowed"});
  }

  // ── /admin (login page or redirect if already authed) ─────────────────────
  if(!isAuthed(req)){
    res.setHeader("Content-Type","text/html; charset=utf-8");
    return res.status(200).send(loginPage(false));
  }
  // Already logged in → go to add-product
  res.setHeader("Set-Cookie","admin_page=add-product; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax");
  res.setHeader("Location","/admin/add-product");
  return res.status(302).end();
};