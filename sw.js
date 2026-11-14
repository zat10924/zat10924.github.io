/* sw.js — تسريع التحميل: المكتبات والخطوط من الكاش، وملفات البرنامج من النت أولًا (عشان التحديثات تظهر) */
const V="mas-v3.0.18",LIB="mas-lib";
addEventListener("install",e=>{skipWaiting()});
addEventListener("activate",e=>{e.waitUntil((async()=>{
  for(const k of await caches.keys())if(k!==V&&k!==LIB)await caches.delete(k);
  await clients.claim();
})())});
const timeout=(p,ms)=>new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error("slow")),ms);p.then(v=>{clearTimeout(t);res(v)},e=>{clearTimeout(t);rej(e)})});
addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET")return;
  const u=new URL(r.url);
  if(u.hostname.endsWith("supabase.co"))return;
  if(u.searchParams.has("_chk")||u.pathname.endsWith(".apk"))return; // فحص الإصدار دايمًا من النت // البيانات دايمًا مباشرة
  // مكتبات وخطوط خارجية: من الكاش فورًا وتتحدث في الخلفية
  if(u.origin!==location.origin){
    if(!/jsdelivr|googleapis|gstatic/.test(u.hostname))return;
    e.respondWith(caches.open(LIB).then(async c=>{
      const hit=await c.match(r);
      const net=fetch(r).then(x=>{if(x&&(x.ok||x.type==="opaque"))c.put(r,x.clone());return x}).catch(()=>hit);
      return hit||net;
    }));return;
  }
  // ملفات البرنامج: من الكاش فورًا (تشغيل سريع) وتتحدث في الخلفية. النسخ الجديدة بيلقطها فحص الإصدار في common.js
  e.respondWith(caches.open(V).then(async c=>{
    const hit=await c.match(r,{ignoreSearch:true});
    const net=fetch(r,{cache:"no-cache"}).then(x=>{if(x&&x.ok)c.put(r,x.clone());return x}).catch(()=>null);
    if(hit){e.waitUntil(net);return hit}
    return (await net)||fetch(r);
  }));
});

/* ===== الإشعارات (تشتغل والبرنامج مقفول) ===== */
addEventListener("push",e=>{
  let d={};
  try{d=e.data?e.data.json():{}}catch(x){d={body:e.data?e.data.text():""}}
  e.waitUntil(registration.showNotification(d.title||"إدارة الأقسام",{
    body:d.body||"",icon:"icon-192.png",badge:"icon-192.png",
    tag:d.tag||"mas",renotify:true,dir:"rtl",lang:"ar",
    data:{url:d.url||"index.html"}
  }));
});
/* إشعار حالة الإنترنت: بيظهر وبعد ثواني بيختفي لوحده (الصفحة بتبعتله الرسالة) */
addEventListener("message",e=>{
  const d=e.data||{};
  if(d.type!=="net")return;
  const off=d.kind==="off";
  e.waitUntil((async()=>{
    await registration.showNotification(off?"انقطع الاتصال بالإنترنت":"رجع الاتصال بالإنترنت",{
      body:d.body||"",icon:"icon-192.png",badge:"icon-192.png",
      tag:"net-status",renotify:true,dir:"rtl",lang:"ar",silent:false,
      vibrate:off?[120,80,120]:[200],data:{url:"index.html",kind:d.kind}
    });
    await new Promise(r=>setTimeout(r,off?6000:9000));
    for(const n of await registration.getNotifications({tag:"net-status"}))n.close();
  })());
});
/* ===== رجوع النت والبرنامج مقفول (Background Sync) =====
   الصفحة بتسجّل "net-back" وهي أوفلاين، والمتصفح بيشغّل الحدث ده أول ما الاتصال يرجع حتى لو البرنامج مقفول. */
const metaGet=k=>new Promise(res=>{
  try{
    const q=indexedDB.open("mas-meta",1);
    q.onupgradeneeded=()=>q.result.createObjectStore("k");
    q.onerror=()=>res(null);
    q.onsuccess=()=>{
      try{const g=q.result.transaction("k").objectStore("k").get(k);g.onsuccess=()=>res(g.result===undefined?null:g.result);g.onerror=()=>res(null)}
      catch(e){res(null)}
    };
  }catch(e){res(null)}
});
const pendCount=async()=>+(await metaGet("pend"))||0;
addEventListener("sync",e=>{
  if(e.tag!=="net-back")return;
  e.waitUntil((async()=>{
    if(await metaGet("netnotify")==="0")return; // المستخدم قفل التنبيه من الإعدادات
    await fetch("icon.svg?_chk="+Date.now(),{method:"HEAD",cache:"no-store"}); // لو فشل (مفيش نت فعلي) المتصفح بيعيد المحاولة بعدين
    const cs=await clients.matchAll({type:"window",includeUncontrolled:true});
    if(cs.some(c=>c.visibilityState==="visible"))return; // البرنامج مفتوح قدامك: هو بيعرّفك لوحده
    const ex=await registration.getNotifications({tag:"net-status"});
    if(ex.some(n=>n.data&&n.data.kind==="on"))return;   // الصفحة نبّهت قبل كده
    const n=await pendCount();
    await registration.showNotification("رجع الاتصال بالإنترنت",{
      body:n?n+" تسجيل محفوظ على الجهاز، افتح البرنامج عشان يتبعتوا":"تم الاتصال بالإنترنت من جديد",
      icon:"icon-192.png",badge:"icon-192.png",tag:"net-status",renotify:true,dir:"rtl",lang:"ar",
      vibrate:[200],data:{url:"index.html",kind:"on"}
    });
    if(!n){ // مفيش تسجيلات معلقة: الإشعار يختفي لوحده، ولو فيه تسجيلات بيفضل لحد ما تفتح البرنامج
      await new Promise(r=>setTimeout(r,9000));
      for(const x of await registration.getNotifications({tag:"net-status"}))x.close();
    }
  })());
});
addEventListener("notificationclick",e=>{
  e.notification.close();
  const url=new URL((e.notification.data&&e.notification.data.url)||"index.html",registration.scope).href;
  e.waitUntil((async()=>{
    const cs=await clients.matchAll({type:"window",includeUncontrolled:true});
    for(const c of cs){
      if(c.url.startsWith(registration.scope)){
        try{await c.focus()}catch(x){}
        try{if("navigate" in c)await c.navigate(url)}catch(x){}
        return;
      }
    }
    await clients.openWindow(url);
  })());
});
