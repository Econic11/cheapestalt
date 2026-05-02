"use strict";
// api/admin.js — Private admin dashboard for creating Web Stories manually
// Images upload via /admin/upload-image (server-side to Supabase — no CORS issues)

const https  = require("https");
const crypto = require("crypto");

const ADMIN_SECRET = process.env.ADMIN_SECRET      || "cheapestalt-admin-2026";
const SUPABASE_URL = process.env.SUPABASE_URL      || "";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "";
const BUCKET       = "stories";
const TAG          = "cheapestalt-20";

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
async function parseJSON(req){
  try{return JSON.parse((await readBody(req)).toString());}catch{return null;}
}

// ── Upload image buffer to Supabase Storage (server-side, no CORS) ────────────
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
          const url=SUPABASE_URL+"/storage/v1/object/public/"+BUCKET+"/"+filename;
          console.log("Upload OK:",filename,"->",url);
          resolve({url,error:null});
        }else{
          console.error("Upload FAILED:",r.statusCode,d.slice(0,200));
          resolve({url:null,error:"HTTP "+r.statusCode+": "+d.slice(0,150)});
        }
      });
    });
    req.on("error",e=>resolve({url:null,error:e.message}));
    req.setTimeout(30000,()=>{req.destroy();resolve({url:null,error:"timeout"});});
    req.write(data);req.end();
  });
}

// ── Parse multipart form data ─────────────────────────────────────────────────
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

// ── AMP boilerplate ───────────────────────────────────────────────────────────
const AMP_BP='<style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style><noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>';

// ── Build AMP HTML ────────────────────────────────────────────────────────────
function buildAMPStory(title,slug,keyword,coverImage,slides){
  const pageUrl="https://www.cheapestalt.com/stories/"+slug;
  const logoUrl="https://www.cheapestalt.com/logo.png";
  const amzLink="https://www.amazon.com/s?k="+encodeURIComponent(keyword||title)+"&tag="+TAG;
  const poster=coverImage||(slides[0]&&slides[0].image)||"";
  const BG=["#1a1a2e","#16213e","#0f3460","#533483","#e94560","#0d1117"];

  const pages=slides.map((slide,i)=>{
    const bg=BG[i%BG.length],isLast=i===slides.length-1;
    const imgUrl=slide.image||"",txt=esc(slide.text||""),ctaUrl=slide.cta||amzLink;
    const imgTag=imgUrl
      ?'<amp-img src="'+esc(imgUrl)+'" width="800" height="1200" layout="fill" alt="'+txt+'"></amp-img>'
      :'<div style="width:100%;height:100%;background:'+bg+';"></div>';
    return '  <amp-story-page id="slide-'+(i+1)+'" auto-advance-after="5s">\n'
      +'    <amp-story-grid-layer template="fill">\n      '+imgTag+'\n    </amp-story-grid-layer>\n'
      +'    <amp-story-grid-layer template="fill"><div style="width:100%;height:100%;background:linear-gradient(to bottom,'+bg+'88 0%,'+bg+'dd 55%,'+bg+'f5 100%);"></div></amp-story-grid-layer>\n'
      +'    <amp-story-grid-layer template="vertical"><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;gap:18px;padding:28px;">\n'
      +'      <h2 style="font-family:Georgia,serif;font-size:30px;font-weight:700;color:#fff;line-height:1.25;text-shadow:0 2px 20px rgba(0,0,0,.95);margin:0;">'+txt+'</h2>\n'
      +'      <p style="font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,.4);margin:0;">'+(i+1)+' / '+slides.length+'</p>\n'
      +'    </div></amp-story-grid-layer>\n'
      +(isLast?'    <amp-story-cta-layer>\n      <a href="'+esc(ctaUrl)+'" target="_blank" rel="noopener"\n        style="display:inline-block;background:#FF9900;color:#0F172A;padding:14px 32px;border-radius:50px;font-size:16px;font-weight:800;text-decoration:none;font-family:Arial,sans-serif;box-shadow:0 4px 20px rgba(255,153,0,.5);">\n        See Best Price on Amazon &#x2192;\n      </a>\n    </amp-story-cta-layer>\n':'')
      +(isLast?'    <amp-story-page-outlink layout="nodisplay"><a href="'+esc(ctaUrl)+'">See Best Price on Amazon</a></amp-story-page-outlink>\n':'')
      +'  </amp-story-page>';
  }).join("\n");

  const sd=JSON.stringify({"@context":"https://schema.org","@type":"Article","headline":title,"url":pageUrl,
    "author":{"@type":"Organization","name":"CheapestAlt","url":"https://www.cheapestalt.com"},
    "publisher":{"@type":"Organization","name":"CheapestAlt","logo":{"@type":"ImageObject","url":logoUrl}},
    "datePublished":new Date().toISOString().split("T")[0]});

  return '<!doctype html>\n<html amp lang="en">\n<head>\n<meta charset="utf-8"/>\n'
    +'<meta name="viewport" content="width=device-width,initial-scale=1,minimum-scale=1"/>\n'
    +'<title>'+esc(title)+' | CheapestAlt</title>\n'
    +'<meta name="description" content="Discover the best '+esc(keyword||title)+' deals on Amazon."/>\n'
    +'<link rel="canonical" href="'+pageUrl+'"/>\n'
    +AMP_BP+'\n<style amp-custom>amp-story-page{background:#0f172a}</style>\n'
    +'<script async src="https://cdn.ampproject.org/v0.js"></script>\n'
    +'<script async custom-element="amp-story" src="https://cdn.ampproject.org/v0/amp-story-1.0.js"></script>\n'
    +'<script type="application/ld+json">'+sd+'</script>\n'
    +'</head>\n<body>\n'
    +'<amp-story standalone title="'+esc(title)+'" publisher="CheapestAlt"\n'
    +'  publisher-logo-src="'+logoUrl+'"\n'
    +(poster?'  poster-portrait-src="'+esc(poster)+'"\n  poster-square-src="'+esc(poster)+'"\n':'')
    +'  supports-landscape>\n'+pages+'\n</amp-story>\n</body>\n</html>';
}

// ── Login page ────────────────────────────────────────────────────────────────
function loginPage(err){
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>'
    +'<title>Admin Login</title><style>'
    +'*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#0F172A;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}'
    +'.b{background:#1E293B;border:1px solid #334155;border-radius:16px;padding:40px;width:320px}'
    +'.t{font-size:20px;font-weight:800;text-align:center;margin-bottom:24px}em{color:#2563EB;font-style:normal}'
    +'label{display:block;font-size:13px;font-weight:600;color:#94A3B8;margin-bottom:5px}'
    +'input{width:100%;background:#0F172A;border:1.5px solid #334155;border-radius:8px;padding:10px 14px;color:#fff;font-size:14px;outline:none;margin-bottom:14px}'
    +'input:focus{border-color:#2563EB}button{width:100%;background:#2563EB;color:#fff;border:none;border-radius:8px;padding:12px;font-size:15px;font-weight:700;cursor:pointer}'
    +'.e{background:#FEF2F2;color:#DC2626;border-radius:8px;padding:8px 12px;font-size:13px;margin-bottom:12px}'
    +'</style></head><body><div class="b">'
    +'<div class="t">Cheapest<em>Alt</em> Admin</div>'
    +(err?'<div class="e">Wrong password.</div>':'')
    +'<form method="POST" action="/admin/auth">'
    +'<label>Password</label><input type="password" name="password" autofocus required/>'
    +'<button type="submit">Login</button></form></div></body></html>';
}

// ── Dashboard page ────────────────────────────────────────────────────────────
function dashboardPage(){
  const css=''
    +'*{box-sizing:border-box;margin:0;padding:0}'
    +'body{font-family:system-ui,sans-serif;background:#0F172A;color:#fff;min-height:100vh;padding-bottom:60px}'
    +'.hdr{background:#1E293B;border-bottom:2px solid #2563EB;padding:0 20px;height:56px;display:flex;align-items:center;justify-content:space-between}'
    +'.logo{font-size:17px;font-weight:800;color:#fff;text-decoration:none}'
    +'.logo em{color:#2563EB;font-style:normal}'
    +'.out{color:#94A3B8;border:1px solid #334155;padding:5px 12px;border-radius:7px;font-size:13px;font-weight:600;text-decoration:none}'
    +'.w{max-width:700px;margin:0 auto;padding:32px 20px}'
    +'h1{font-size:24px;font-weight:800;margin-bottom:4px}'
    +'.sub{color:#64748B;font-size:13px;margin-bottom:28px}'
    +'.card{background:#1E293B;border:1.5px solid #334155;border-radius:14px;padding:22px;margin-bottom:18px}'
    +'.card h2{font-size:13px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px}'
    +'label{display:block;font-size:13px;font-weight:600;color:#94A3B8;margin-bottom:5px;margin-top:12px}'
    +'label:first-of-type{margin-top:0}'
    +'input[type=text],input[type=url]{width:100%;background:#0F172A;border:1.5px solid #334155;border-radius:7px;padding:9px 12px;color:#fff;font-size:14px;outline:none}'
    +'input[type=text]:focus,input[type=url]:focus{border-color:#2563EB}'
    +'input[type=file]{width:100%;background:#0F172A;border:1.5px dashed #475569;border-radius:7px;padding:9px 12px;color:#64748B;font-size:13px;cursor:pointer;margin-bottom:4px}'
    +'.sc{background:#0F172A;border:1.5px solid #334155;border-radius:10px;padding:16px;margin-bottom:10px;position:relative}'
    +'.sn{font-size:11px;font-weight:700;color:#2563EB;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}'
    +'.rm{position:absolute;top:14px;right:14px;background:#FEF2F2;color:#DC2626;border:none;border-radius:5px;padding:3px 9px;font-size:12px;font-weight:600;cursor:pointer}'
    +'.si{width:100%;height:140px;object-fit:cover;border-radius:7px;margin-top:6px;display:none;border:1.5px solid #334155}'
    +'.msg{font-size:12px;margin-top:5px;padding:5px 9px;border-radius:5px}'
    +'.ok{background:rgba(22,163,74,.15);color:#4ADE80}'
    +'.er{background:rgba(220,38,38,.15);color:#FCA5A5}'
    +'.ld{background:rgba(37,99,235,.15);color:#60A5FA}'
    +'.cn{font-size:12px;color:#FBBF24;margin-top:8px;font-weight:600}'
    +'.ab{width:100%;background:rgba(37,99,235,.1);color:#60A5FA;border:1.5px dashed #2563EB;border-radius:9px;padding:11px;font-size:13px;font-weight:600;cursor:pointer;margin-top:2px}'
    +'.ab:hover{background:rgba(37,99,235,.2)}'
    +'.cb{width:100%;background:#2563EB;color:#fff;border:none;border-radius:9px;padding:15px;font-size:15px;font-weight:800;cursor:pointer;margin-top:6px}'
    +'.cb:hover{background:#1D4ED8}.cb:disabled{background:#334155;color:#64748B;cursor:not-allowed}'
    +'.res{border-radius:9px;padding:12px 16px;font-size:14px;font-weight:600;margin-top:14px}'
    +'.bok{background:rgba(22,163,74,.15);border:1.5px solid #16A34A;color:#4ADE80}'
    +'.ber{background:rgba(220,38,38,.15);border:1.5px solid #DC2626;color:#FCA5A5}'
    +'.pb{height:4px;background:#1E293B;border-radius:4px;margin-top:10px;overflow:hidden}'
    +'.pf{height:100%;background:#2563EB;border-radius:4px;width:0%;transition:width .3s}'
    +'@media(max-width:580px){.w{padding:18px 12px}}';

  // All JavaScript uses DOM APIs (createElement) — no innerHTML string quoting needed
  const js=''
    // State
    +'var slides=[],sc=0,imgs={},covUrl=null;'
    // Auto slug
    +'function autoSlug(){'
    +'var t=document.getElementById("ttl").value;'
    +'document.getElementById("slg").value=t.toLowerCase().replace(/[^a-z0-9 -]/g,"").replace(/ +/g,"-").replace(/-+/g,"-").trim();'
    +'}'
    // Upload via our API endpoint — avoids CORS issues
    +'async function apiUpload(file,prefix){'
    +'var slug=document.getElementById("slg").value||"story";'
    +'var ext=file.name.split(".").pop()||"jpg";'
    +'var fname=prefix+"-"+slug+"-"+Date.now()+"."+ext;'
    +'var fd=new FormData();fd.append("file",file);fd.append("filename",fname);'
    +'var r=await fetch("/admin/upload-image",{method:"POST",body:fd});'
    +'if(!r.ok){var e=await r.text();throw new Error("Upload failed ("+r.status+"): "+e.slice(0,80));}'
    +'var d=await r.json();'
    +'if(!d.url)throw new Error(d.error||"No URL returned");'
    +'return d.url;'
    +'}'
    // Cover upload
    +'async function upCover(inp){'
    +'var f=inp.files[0];if(!f)return;'
    +'var st=document.getElementById("cov-st");'
    +'setMsg(st,"ld","Uploading cover image...");'
    +'try{'
    +'var url=await apiUpload(f,"cover");'
    +'covUrl=url;setMsg(st,"ok","Cover uploaded");'
    +'var img=document.getElementById("cov-img");img.src=url;img.style.display="block";'
    +'}catch(e){setMsg(st,"er",e.message);covUrl=null;}'
    +'}'
    // Slide image upload
    +'async function upSlide(inp,id){'
    +'var f=inp.files[0];if(!f)return;'
    +'var st=document.getElementById("ms-"+id);'
    +'setMsg(st,"ld","Uploading...");'
    +'try{'
    +'var url=await apiUpload(f,"slide");'
    +'imgs[id]=url;setMsg(st,"ok","Uploaded");'
    +'var img=document.getElementById("si-"+id);img.src=url;img.style.display="block";'
    +'}catch(e){setMsg(st,"er","Failed: "+e.message);delete imgs[id];}'
    +'}'
    // Set message helper
    +'function setMsg(el,cls,msg){el.className="msg "+cls;el.textContent=msg;el.style.display="block";}'
    // Add slide — uses DOM createElement to avoid quoting hell
    +'function addSlide(){'
    +'var id=++sc;slides.push(id);'
    +'var wrap=document.getElementById("slides");'
    +'var d=document.createElement("div");d.className="sc";d.id="sd-"+id;'
    // slide number
    +'var sn=document.createElement("div");sn.className="sn";d.appendChild(sn);'
    // remove button
    +'var rb=document.createElement("button");rb.className="rm";rb.textContent="Remove";'
    +'rb.onclick=(function(i){return function(){removeSlide(i);};})(id);d.appendChild(rb);'
    // image label
    +'var l1=document.createElement("label");l1.textContent="Image *";d.appendChild(l1);'
    // file input
    +'var fi=document.createElement("input");fi.type="file";fi.accept="image/jpeg,image/png,image/webp,image/gif";'
    +'fi.onchange=(function(i){return function(){upSlide(this,i);};})(id);d.appendChild(fi);'
    // upload status
    +'var ms=document.createElement("div");ms.id="ms-"+id;ms.className="msg";ms.style.display="none";d.appendChild(ms);'
    // image preview
    +'var si=document.createElement("img");si.className="si";si.id="si-"+id;d.appendChild(si);'
    // text label
    +'var l2=document.createElement("label");l2.textContent="Slide Text (max 12 words)";d.appendChild(l2);'
    // text input
    +'var ti=document.createElement("input");ti.type="text";ti.id="tx-"+id;ti.placeholder="Short engaging text...";d.appendChild(ti);'
    // cta container
    +'var ct=document.createElement("div");ct.id="ctbox-"+id;d.appendChild(ct);'
    +'wrap.appendChild(d);renum();updateCTA();'
    +'}'
    // Remove slide
    +'function removeSlide(id){'
    +'if(slides.length<=3){alert("Minimum 3 slides required.");return;}'
    +'slides=slides.filter(function(x){return x!==id;});'
    +'var el=document.getElementById("sd-"+id);if(el)el.remove();'
    +'delete imgs[id];renum();updateCTA();'
    +'}'
    // Renumber slides
    +'function renum(){'
    +'slides.forEach(function(id,i){'
    +'var el=document.querySelector("#sd-"+id+" .sn");'
    +'if(el)el.textContent="SLIDE "+(i+1)+"/"+slides.length;'
    +'});}'
    // Update CTA field — only on last slide
    +'function updateCTA(){}'
    // Create story
    +'async function go(){'
    +'var title=document.getElementById("ttl").value.trim();'
    +'var slug=document.getElementById("slg").value.trim();'
    +'var kw=document.getElementById("kw").value.trim();'
    +'if(!title){showRes("ber","Title is required.");return;}'
    +'if(!slug){showRes("ber","Slug is required.");return;}'
    +'if(slides.length<3){showRes("ber","Minimum 3 slides required.");return;}'
    +'for(var i=0;i<slides.length;i++){'
    +'var id=slides[i];'
    +'if(!imgs[id]){showRes("ber","Slide "+(i+1)+": please wait for image upload to finish.");return;}'
    +'if(!document.getElementById("tx-"+id).value.trim()){showRes("ber","Slide "+(i+1)+": text is required.");return;}'
    +'}'
    +'var btn=document.getElementById("cbtn");btn.disabled=true;btn.textContent="Creating story...";prog(40);'
    +'try{'
    +'var sd=slides.map(function(id,i){'
    +'var raw=document.getElementById("cta-link").value.trim();'
    +'var ctaVal=raw&&raw.indexOf("http")!==0?"https://"+raw:raw;'
    +'return{image:imgs[id],text:document.getElementById("tx-"+id).value.trim(),'
    +'cta:i===slides.length-1?ctaVal:""};});'
    +'prog(70);'
    +'var r=await fetch("/admin/create-story",{method:"POST",'
    +'headers:{"Content-Type":"application/json"},'
    +'body:JSON.stringify({title:title,slug:slug,keyword:kw,coverImageUrl:covUrl,slides:sd})});'
    +'prog(90);var d=await r.json();'
    +'if(d.ok){prog(100);showRes("bok","Story created! Redirecting...");'
    +'setTimeout(function(){window.location.href="/stories/"+slug;},1500);'
    +'}else{showRes("ber","Error: "+(d.error||"Unknown"));btn.disabled=false;btn.textContent="Create Story";}'
    +'}catch(e){showRes("ber","Error: "+e.message);btn.disabled=false;btn.textContent="Create Story";}'
    +'}'
    +'function prog(p){document.getElementById("pf").style.width=p+"%";}'
    +'function showRes(cls,msg){'
    +'var e=document.getElementById("res");e.className="res "+cls;e.textContent=msg;e.style.display="block";'
    +'e.scrollIntoView({behavior:"smooth",block:"nearest"});}'
    +'addSlide();addSlide();addSlide();';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"/>'
    +'<meta name="viewport" content="width=device-width,initial-scale=1"/>'
    +'<title>Create Story | Admin</title>'
    +'<style>'+css+'</style></head><body>'
    +'<header class="hdr">'
    +'<a href="/" class="logo">Cheapest<em>Alt</em></a>'
    +'<a href="/admin/logout" class="out">Logout</a>'
    +'</header>'
    +'<div class="w">'
    +'<h1>Create Web Story</h1>'
    +'<p class="sub">Build a Google Web Story manually and publish it instantly.</p>'
    +'<div class="card"><h2>Story Details</h2>'
    +'<label>Title *</label>'
    +'<input type="text" id="ttl" placeholder="Best Wireless Earbuds 2026" oninput="autoSlug()"/>'
    +'<label>Slug (auto-generated)</label>'
    +'<input type="text" id="slg" placeholder="best-wireless-earbuds-2026"/>'
    +'<label>Keyword (for Amazon link)</label>'
    +'<input type="text" id="kw" placeholder="wireless earbuds"/>'
    +'<label>CTA Link — Amazon or any URL (shown on last slide)</label>'
    +'<input type="url" id="cta-link" placeholder="https://www.amazon.com/s?k=your+product&tag=cheapestalt-20"/>'
    +'<label>Cover Image (optional)</label>'
    +'<input type="file" id="covinp" accept="image/*" onchange="upCover(this)"/>'
    +'<div id="cov-st" class="msg" style="display:none"></div>'
    +'<img id="cov-img" class="si" src=""/>'
    +'</div>'
    +'<div class="card"><h2>Slides (minimum 3)</h2>'
    +'<div id="slides"></div>'
    +'<button class="ab" onclick="addSlide()">+ Add Slide</button>'
    +'</div>'
    +'<button class="cb" id="cbtn" onclick="go()">Create Story</button>'
    +'<div class="pb"><div class="pf" id="pf"></div></div>'
    +'<div class="res" id="res" style="display:none"></div>'
    +'</div>'
    +'<script>'+js+'</script>'
    +'</body></html>';
}


// ── Fix-stories repair logic (accessible at /admin/fix-stories) ────────────




// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res){
  res.setHeader("Access-Control-Allow-Origin","*");
  if(req.method==="OPTIONS") return res.status(204).end();

  const url=(req.url||"").split("?")[0];

  // Logout
  if(url==="/admin/logout"){
    res.setHeader("Set-Cookie","admin_token=; Path=/; Max-Age=0; HttpOnly");
    res.setHeader("Location","/admin");
    return res.status(302).end();
  }

  // Auth
  if(url==="/admin/auth"&&req.method==="POST"){
    const buf=await readBody(req);
    const body=Object.fromEntries(new URLSearchParams(buf.toString()));
    if((body.password||"").trim()===ADMIN_SECRET){
      const token=crypto.createHash("sha256").update(ADMIN_SECRET).digest("hex");
      res.setHeader("Set-Cookie","admin_token="+token+"; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax");
      res.setHeader("Location","/admin/create-story");
      return res.status(302).end();
    }
    res.setHeader("Content-Type","text/html; charset=utf-8");
    return res.status(401).send(loginPage(true));
  }

  // Login page
  if(url==="/admin"||url==="/admin/"){
    if(isAuthed(req)){res.setHeader("Location","/admin/create-story");return res.status(302).end();}
    res.setHeader("Content-Type","text/html; charset=utf-8");
    return res.status(200).send(loginPage(false));
  }

  // Image upload endpoint — receives multipart from browser, uploads to Supabase server-side
  if(url==="/admin/upload-image"&&req.method==="POST"){
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

  // Create story page
  if(url==="/admin/create-story"){
    if(!isAuthed(req)){res.setHeader("Location","/admin");return res.status(302).end();}

    if(req.method==="GET"){
      res.setHeader("Content-Type","text/html; charset=utf-8");
      return res.status(200).send(dashboardPage());
    }

    if(req.method==="POST"){
      const body=await parseJSON(req);
      if(!body) return res.status(400).json({error:"Invalid request"});
      const{title,slug,keyword,coverImageUrl,slides}=body;
      if(!title||!slug||!Array.isArray(slides)||slides.length<3)
        return res.status(400).json({error:"Missing required fields or fewer than 3 slides"});

      const coverUrl=coverImageUrl||null;
      const processedSlides=slides.map(s=>({image:s.image||null,text:s.text,cta:s.cta||undefined}));
      const html=buildAMPStory(title,slug,keyword||title,coverUrl,processedSlides);

      const row={slug,title,keyword:keyword||title,cover_image:coverUrl,
        pages:processedSlides,html,source:"manual",amp_valid:true,
        last_generated:new Date().toISOString()};

      const{error}=await dbInsert("stories",row);
      if(error){console.error("DB error:",error);return res.status(500).json({error:"Database save failed: "+String(error).slice(0,200)});}
      return res.status(200).json({ok:true,slug});
    }
  }

  return res.status(404).json({error:"Not found"});
};
