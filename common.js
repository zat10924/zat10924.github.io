/* ===== إعدادات الجهاز: الخط والحجم والأرقام والطباعة (محفوظة على الجهاز) ===== */
const SET={get(k,d){try{const v=localStorage.getItem("set_"+k);return v===null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem("set_"+k,JSON.stringify(v))}catch(e){}}};
// [اسم الخط, استعلام جوجل, الاسم بالعربي]
const FONTS={tajawal:["Tajawal","Tajawal:wght@400;500;700;800","تجوال"],cairo:["Cairo","Cairo:wght@400;500;600;700;800","القاهرة"],plex:["IBM Plex Sans Arabic","IBM+Plex+Sans+Arabic:wght@400;500;600;700","آي بي إم بلكس"],almarai:["Almarai","Almarai:wght@400;700;800","المراعي"],kufi:["Noto Kufi Arabic","Noto+Kufi+Arabic:wght@400;500;600;700","نوتو كوفي"]};
function loadFont(k){
  const f=FONTS[k];if(!f||document.getElementById("fl-"+k))return;
  const l=document.createElement("link");l.id="fl-"+k;l.rel="stylesheet";l.href="https://fonts.googleapis.com/css2?family="+f[1]+"&display=swap";document.head.appendChild(l);
}
function applyLook(){
  const k=FONTS[SET.get("font","tajawal")]?SET.get("font","tajawal"):"tajawal";
  loadFont(k);const r=document.documentElement;
  r.style.setProperty("--font",'"'+FONTS[k][0]+'"');
  r.style.setProperty("--fs",SET.get("size",100)+"%");
  r.classList.toggle("calm",!!SET.get("calm",matchMedia("(max-width:700px)").matches)); // الافتراضي: تقليل الحركة على الموبايل
  r.classList.toggle("bigbtn",!!SET.get("bigbtn",false));
}
applyLook();
// الأرقام: "latn" = تواريخ بأرقام إنجليزية | "arab" = كله عربي | غير كده الوضع الافتراضي
(function(){
  const fix=l=>(l==="ar-EG"&&SET.get("digits","mix")==="latn")?"ar-EG-u-nu-latn":l;
  ["toLocaleDateString","toLocaleString"].forEach(m=>{const o=Date.prototype[m];Date.prototype[m]=function(l,...a){return o.call(this,fix(l),...a)}});
})();

/* ===== الصوت والاهتزاز (نغمات متولّدة بـ Web Audio — من غير ملفات) ===== */
const Snd=(()=>{
  let ctx=null,last=0;
  const PACKS={soft:{w:"sine",g:1,m:1},classic:{w:"triangle",g:1,m:1},digital:{w:"square",g:.4,m:1.25}};
  const ac=()=>{try{if(!ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;ctx=new C()}if(ctx.state==="suspended")ctx.resume();return ctx}catch(e){return null}};
  function note(f,at,dur,g){
    const c=ac();if(!c)return;
    const p=PACKS[SET.get("pack","soft")]||PACKS.soft,v=Math.pow(SET.get("vol",60)/100,1.6);
    const o=c.createOscillator(),gn=c.createGain(),t=c.currentTime+at;
    o.type=p.w;o.frequency.setValueAtTime(f*p.m,t);
    gn.gain.setValueAtTime(.0001,t);
    gn.gain.exponentialRampToValueAtTime(Math.max(.0002,g*p.g*v),t+.008);
    gn.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(gn);gn.connect(c.destination);o.start(t);o.stop(t+dur+.03);
  }
  // [التردد, التأخير, المدة, الشدة]
  const SEQ={
    tap:[[700,0,.05,.1]],
    open:[[440,0,.08,.1],[660,.05,.1,.1]],
    success:[[523.25,0,.12,.22],[659.25,.09,.12,.22],[783.99,.18,.22,.22]],
    error:[[220,0,.14,.26],[165,.12,.26,.26]],
    warn:[[587,0,.1,.2],[587,.15,.1,.2]],
    login:[[523.25,0,.14,.22],[659.25,.1,.14,.22],[783.99,.2,.14,.22],[1046.5,.3,.32,.2]],
    logout:[[783.99,0,.12,.18],[523.25,.1,.26,.18]]
  };
  const VIB={tap:8,open:6,success:[12,40,12],error:[40,50,40],warn:[20,40,20],login:[15,30,15,30,25]};
  function play(k,force){
    const ui=k==="tap"||k==="open";
    if(SET.get("snd",true)&&(force||!ui||SET.get("sndtap",true)))(SEQ[k]||[]).forEach(a=>note(...a));
    if(SET.get("hap",true)&&navigator.vibrate&&VIB[k]&&!document.hidden&&(!navigator.userActivation||navigator.userActivation.hasBeenActive)){try{navigator.vibrate(VIB[k])}catch(e){}}
  }
  return{play,warm:ac,tap(){const n=performance.now();if(n-last>40){last=n;play("tap")}}};
})();
document.addEventListener("pointerdown",()=>Snd.warm(),{once:true,passive:true,capture:true});
document.addEventListener("pointerdown",e=>{
  const t=e.target.closest&&e.target.closest(".btn,.tile,.chip,.sh,.tabs button,.iconbtn,.avatar,.fopt,.seg button,.tabbar a,.sub a,.umenu a,.umenu button");
  if(!t||t.disabled)return;
  Snd.tap();
  if(t.matches(".btn,.tile,.chip")&&!document.documentElement.classList.contains("calm")){
    const r=t.getBoundingClientRect(),d=Math.max(r.width,r.height)*1.5,x=document.createElement("span");
    x.className="rip";x.style.cssText="width:"+d+"px;height:"+d+"px;left:"+(e.clientX-r.left-d/2)+"px;top:"+(e.clientY-r.top-d/2)+"px";
    t.appendChild(x);setTimeout(()=>x.remove(),600);
  }
},{passive:true,capture:true});

/* ===== الأيقونات (SVG) ===== */
const ICONS={
  checksq:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12.5l3 3 5.5-6.5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  clip:'<rect class="f" width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11v6M9 14h6"/>',
  tag:'<path class="f" d="M20 12l-8 8-9-9V3h8z"/><path d="M7.5 7.5h.01"/>',
  pkg:'<path class="f" d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m7.5 4.27 9 5.15M3.3 7 12 12l8.7-5M12 22V12"/>',
  log:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 8v5l3 2"/>',
  pulse:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  home:'<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path class="f" d="M3 10a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  glaze:'<path class="f" d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/><path d="M9 15a3 3 0 0 0 3 3"/>',
  deco:'<path class="f" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.12a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C21.97 6 17.46 2 12 2z"/><circle cx="13.5" cy="6.5" r=".6"/><circle cx="17.5" cy="10.5" r=".6"/><circle cx="8.5" cy="7.5" r=".6"/><circle cx="6.5" cy="12.5" r=".6"/>',
  spray:'<path d="M3 3h.01M7 5h.01M11 3h.01M3 7h.01M7 9h.01M3 11h.01"/><rect class="f" width="4" height="4" x="15" y="5"/><path class="f" d="m19 9 2 2v10c0 .6-.4 1-1 1h-6c-.6 0-1-.4-1-1V11l2-2"/><path d="m13 14 8-2M13 19l8-2"/>',
  repair:'<path class="f" d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  casting:'<path d="M8 2h8"/><path class="f" d="M9 2v4c0 1.4-4 2.6-4 8a7 7 0 0 0 14 0c0-5.4-4-6.6-4-8V2"/><path d="M5.5 13h13"/>',
  chart:'<path d="M3 3v16a2 2 0 0 0 2 2h16"/><rect class="f" x="7" y="11" width="3" height="6" rx=".6"/><rect class="f" x="12" y="6" width="3" height="11" rx=".6"/><rect class="f" x="17" y="13" width="3" height="4" rx=".6"/>',
  sun:'<circle class="f" cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:'<path class="f" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  refresh:'<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  search:'<circle class="f" cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  cog:'<circle class="f" cx="12" cy="12" r="3"/><path class="f" d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  user:'<circle class="f" cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle class="f" cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  hat:'<path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M14 6a6 6 0 0 1 6 6v3M4 15v-3a6 6 0 0 1 6-6"/><rect class="f" x="2" y="15" width="20" height="4" rx="1"/>',
  shield:'<path class="f" d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  lock:'<rect class="f" width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  brush:'<path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path class="f" d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>',
  finish:'<path class="f" d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M17 5h4M5 17v4M3 19h4"/>',
  sortx:'<path d="M3 6h18M6 12h12M10 18h4"/><circle class="f" cx="19" cy="18" r="2"/>',
  fire:'<path class="f" d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  out:'<path d="M15 3h3a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-3"/><g class="arw"><path d="M10 7l-5 5 5 5"/><path d="M5 12h11"/></g>'
};
const ico=k=>`<svg class="ic ic-${k}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;
/* أيقونات الأزرار والتقارير (خطية، بتاخد لون النص) */
const UIC={
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  hourglass:'<path d="M5 22h14M5 2h14"/><path d="M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22"/><path d="M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2"/>',
  wifioff:'<path d="M2 2l20 20"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5.1A15 15 0 0 1 22 8.8"/><path d="M5 12.9a10 10 0 0 1 5.2-2.7M13.7 10.3A10 10 0 0 1 19 12.9"/><path d="M12 20h.01"/>',
  lock:'<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  check:'<path d="m5 12 5 5L20 7"/>',
  checksq:'<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash:'<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
  print:'<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  sparkles:'<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M17 5h4M5 17v4M3 19h4"/>',
  alert:'<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  checkc:'<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
  bulb:'<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
  download:'<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  db:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'
};
const ui=k=>`<svg class="ui" viewBox="0 0 24 24" aria-hidden="true">${UIC[k]}</svg>`;
const ib=(k,t)=>ui(k)+"<span>"+t+"</span>";
// [الملف, الاسم, الأيقونة, اللون]
const PROD=["production.html","تسجيل الإنتاج","clip","#2e8b57"];
const REPORTS=["reports.html","التقارير","chart","#2a7f9e"];
const ORDERS=["orders.html","الطلبيات","checksq","#7a4f9e"];
const CATALOG=["catalog.html","الأصناف والأكواد","pkg","#8a6d3b"];
const SEARCH=["search.html","بحث شامل","search","#3b6fd0"];
const WORKERS=["workers.html","العمال","hat","#c76a2b"];
const ACTIVITY=["activity.html","سجل النشاط والنسخ","pulse","#5b6b8c"];
const PROFILE=["profile.html","ملفي الشخصي","user","#642631"];
const SETTINGS=["settings.html","الإعدادات","cog","#5b6b8c"];
const USERS=["users.html","المستخدمين والصلاحيات","shield","#7a5ea8"];
const SEC_AR={glaze:"جليز",deco:"زخرفة",spray:"رش",repair:"تصليح",casting:"الصب اليدوي"};
const ROLE_DESC={admin:"صلاحية كاملة: كل الأقسام والتقارير والمستخدمين",manager:"مسؤول عن قسم أو أكتر: يشوف ويدير أقسامه بس",worker:"يسجّل الإنتاج في قسمه بس"};
// صلاحيات تفصيلية: الافتراضي حسب الدور، والمدير يقدر يخصصها لكل مستخدم
const PERM_LBL={view:["عرض صفحة القسم والطلبيات","فتح صفحة القسم ومشاهدة الطلبيات. لو مقفولة يقدر يسجّل إنتاج بس من صفحة «تسجيل الإنتاج»"],edit:["تعديل الطلبيات والسجلات","تعديل بيانات الطلبية واللون والهالك والتصليح"],delete:["الحذف","حذف الطلبيات والألوان وسجلات الإنتاج والهالك"],increase:["زيادة وتأجيل الطلبيات","زيادة الكمية وتأجيل تاريخ التسليم"],reports:["تقارير القسم","فتح تبويب التقارير داخل القسم"],editown:["تعديل إنتاجه في نفس اليوم","يعدّل تسجيلات الإنتاج اللي سجّلها هو بس، وما دام اليوم لسه ما خلصش. بعد انتهاء اليوم التعديل بيتقفل"]};
const PERM_DEF={manager:{view:true,edit:true,delete:false,increase:true,reports:true,editown:true},worker:{view:true,edit:false,delete:false,increase:false,reports:false,editown:true}};
const can=k=>{if(!ME||!ME.role)return false;if(ME.role==="admin")return true;const v=(ME.perms||{})[k];return typeof v==="boolean"?v:!!(PERM_DEF[ME.role]||{})[k]};
const subsOf=f=>(SUBS[f]||[]).filter(x=>x[1]!=="prod"||can("reports"));
// ===== تعديل الإنتاج في نفس اليوم فقط =====
// اليوم بيعتبر منتهي لو تاريخ التسجيل أقدم من تاريخ السيرفر أو من تاريخ الجهاز (الأحدث فيهم) — عشان لو الصفحة فضلت مفتوحة بعد نص الليل.
const localToday=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
const dayClosed=d=>{const t=[today(),localToday()].sort().pop();return !d||String(d).slice(0,10)<t};
// e = تسجيل إنتاج: {date, by}. المدير/اللي معاه صلاحية «تعديل» بيعدّل أي وقت. غيره: تسجيلاته هو بس وفي نفس اليوم.
const canEditEntry=e=>{
  if(!ME||!ME.role||!e)return false;
  if(can("edit"))return true;
  if(!can("editown")||dayClosed(e.date))return false;
  if(e.by&&ME.id&&e.by!==ME.id)return false;
  return true;
};
function applyPerms(){Object.keys(PERM_LBL).forEach(k=>document.body.classList.toggle("np-"+k,!can(k)))}
/* أقسام لسه هتتنشأ (بتظهر للمدير ومسؤول القسم كإعلان، من غير صفحة ولا صلاحيات) */
const SOON=[["البرشر","brush","#A0522D"],["الفنش","finish","#3E7C6B"],["الفرز","sortx","#6B5B95"],["الحريق","fire","#C0502B"]];
const soonSections=()=>canReports()?SOON:[];
const SECTIONS=[["glaze.html","جليز","glaze","#2E6F80"],["decoration.html","زخرفة","deco","#5E5A8C"],["spray.html","رش","spray","#B8862B"],["repair.html","تصليح","repair","#5D6B7A"],["casting.html","الصب اليدوي","casting","#8A5A3C"]];

/* ===== بريد داخلي (للمستخدم بالاسم فقط) + صورة الملف الشخصي ===== */
const NOMAIL=/@(noemail\.mas\.app|example\.com)$/i;
const realEmail=e=>e&&!NOMAIL.test(e)?e:"";
const safeAv=u=>typeof u==="string"&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(u)&&u.length<400000?u:"";
// صورة دائرية: لو فيه صورة تظهر، وإلا الحرف الأول
const avAttr=(u,cls)=>safeAv(u)?`class="${cls} has" style="background-image:url('${safeAv(u)}')"`:`class="${cls}"`;
const avText=(u,t)=>safeAv(u)?"":esc(t);
// تصغير الصورة وقصّها مربع 320px ثم JPEG صغير (بتتخزن في عمود avatar)
function photoToData(file,size=320,q=.82){return new Promise((res,rej)=>{
  if(!file||!/^image\//.test(file.type))return rej(new Error("اختار ملف صورة"));
  const url=URL.createObjectURL(file),im=new Image();
  im.onload=()=>{try{
    const c=document.createElement("canvas");c.width=c.height=size;const x=c.getContext("2d");
    const m=Math.min(im.width,im.height),sx=(im.width-m)/2,sy=(im.height-m)/2;
    x.fillStyle="#fff";x.fillRect(0,0,size,size);x.drawImage(im,sx,sy,m,m,0,0,size,size);
    URL.revokeObjectURL(url);res(c.toDataURL("image/jpeg",q));
  }catch(e){rej(e)}};
  im.onerror=()=>{URL.revokeObjectURL(url);rej(new Error("الصورة غير صالحة"))};
  im.src=url;
})}

/* ===== الجلسة والتنقل ===== */
const KEY={"glaze.html":"glaze","decoration.html":"deco","spray.html":"spray","repair.html":"repair","casting.html":"casting"};
let ME=null,_today=null;
// يجيب دور المستخدم وقسمه + تاريخ السيرفر. لو جدول profiles لسه مش متعمل (قبل تشغيل setup_roles.sql) بيشتغل كمدير عشان البرنامج ما يقفش.
// جلسة الدخول: لو مفيش نت والتوكن منتهي نكمل بآخر جلسة محفوظة بدل ما نرجّع المستخدم لصفحة الدخول
async function getSess(){
  let s=null;try{s=(await db.auth.getSession()).data.session}catch(e){}
  if(s)return s;
  if(!navigator.onLine){try{const o=JSON.parse(localStorage.getItem("sb-bzhxdikcyxkdojwlswhq-auth-token")||"null");if(o&&o.user&&o.user.id)return o}catch(e){}}
  return null;
}
async function loadMe(){
  const session=await getSess();if(!session)return null;
  // لو عمود active لسه مش موجود (قبل تشغيل setup_users.sql) نرجع للاستعلام القديم
  const getP=async()=>{
    let cols=["full_name","role","section","sections","active","perms","avatar","phone","whatsapp"],r;
    for(let i=0;i<8;i++){
      r=await db.from("profiles").select(cols.join(",")).eq("id",session.user.id).maybeSingle();
      const bad=r.error&&["perms","active","avatar","sections","phone","whatsapp"].find(c=>cols.includes(c)&&(r.error.message||"").includes(c));
      if(!bad)break;cols=cols.filter(c=>c!==bad);
    }
    return r};
  const[p,t]=await Promise.all([getP(),db.rpc("server_today")]);
  // آخر ظهور (مرة كل جلسة) — بيتجاهل الخطأ لو العمود لسه مش موجود
  try{if(!p.error&&navigator.onLine&&!sessionStorage.getItem("seen")){sessionStorage.setItem("seen","1");db.from("profiles").update({last_seen:new Date().toISOString()}).eq("id",session.user.id).then(()=>{},()=>{})}}catch(e){}
  if(!t.error&&t.data)_today=String(t.data).slice(0,10);
  let cached=null;try{cached=JSON.parse(localStorage.getItem("me_"+session.user.id))}catch(e){}
  if(p.error&&cached&&(!navigator.onLine||/fetch|network|load failed/i.test(p.error.message||"")))ME=cached;
  else{
    ME=p.error?{id:session.user.id,name:"",email:session.user.email||"",role:"admin",section:null,sections:[],active:true,perms:{},avatar:"",phone:"",whatsapp:"",legacy:true}
      :{id:session.user.id,name:p.data?.full_name||"",email:session.user.email||"",role:p.data?.role||null,section:p.data?.section||null,sections:secList(p.data),active:p.data?.active!==false,perms:p.data?.perms||{},avatar:safeAv(p.data?.avatar),phone:p.data?.phone||"",whatsapp:p.data?.whatsapp||""};
    if(!p.error)try{localStorage.setItem("me_"+session.user.id,JSON.stringify(ME))}catch(e){}
  }
  return ME;
}
// كل الأقسام اللي المستخدم متابعها (القسم الأساسي + الأقسام الإضافية)
const secList=r=>{const a=[];if(r&&Array.isArray(r.sections))r.sections.forEach(x=>{if(SEC_AR[x]&&!a.includes(x))a.push(x)});if(r&&r.section&&SEC_AR[r.section]&&!a.includes(r.section))a.unshift(r.section);return a};
const mySecs=()=>ME?(ME.role==="admin"?Object.keys(SEC_AR):secList(ME)):[];
const secNames=l=>(l||[]).map(k=>SEC_AR[k]).filter(Boolean).join("، ");
const canSee=f=>!!ME&&!!ME.role&&(f==="index.html"||f==="production.html"||f==="profile.html"||f==="settings.html"||ME.role==="admin"||(KEY[f]&&mySecs().includes(KEY[f])&&(f==="repair.html"||f==="casting.html"||can("view"))));
const visibleSections=()=>SECTIONS.filter(s=>canSee(s[0]));
const canReports=()=>!!ME&&ME.role==="admin";
function noAccess(){
  const off=ME&&ME.active===false;
  document.body.innerHTML='<div class="wrap"><div class="card empty" style="margin-top:40px">'+(off?'حسابك موقوف.<br>كلّم المدير لو محتاج تفعّله تاني.':'حسابك لسه مش متفعّل على قسم.<br>كلّم المدير عشان يدّيك صلاحية.')+'<br><button class="btn" id="o" style="margin-top:14px">خروج</button></div></div>';
  document.getElementById("o").onclick=async()=>{Snd.play("logout");await db.auth.signOut();location.href="index.html"};
}
async function requireAuth(file){
  const session=await getSess();
  if(!session){location.href="index.html";return null}
  await loadMe();
  if(!ME.role||ME.active===false){noAccess();return null}
  if(file&&file!=="index.html"&&!((file==="reports.html"||file==="search.html"||file==="orders.html")?canReports():canSee(file))){location.replace("index.html");return null}
  return session;
}
const SUBS={
 "glaze.html":[["الطلبيات المفتوحة","open"],["الطلبيات المكتملة","done"],["الهالك","rep"],["تقارير القسم","prod"]],
 "decoration.html":[["الطلبيات المفتوحة","open"],["الطلبيات المكتملة","done"],["إنتاج العمال","wk"],["تقارير القسم","prod"]],
 "spray.html":[["الطلبيات المفتوحة","open"],["الطلبيات المكتملة","done"],["تقارير القسم","prod"]],
 "repair.html":[["سجل التصليح","log"],["تقارير القسم","prod"]],
 "casting.html":[["سجل الصب","log"],["تقارير القسم","prod"]],
 "orders.html":[["الطلبيات المفتوحة","open"],["الطلبيات المكتملة","done"]],
 "reports.html":[["التقرير اليومي","daily"],["تقرير الطلبيات","orders"],["التقارير العامة","general"]]};
const ROLE_AR={admin:"مدير",manager:"مسؤول قسم",worker:"مسجّل إنتاج"};
const initialOf=()=>((ME&&(ME.name||ME.email))||"?").trim().charAt(0).toUpperCase();
const MENU='<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
function renderNav(active){
  if(active===""||active==="index.html")setTimeout(()=>{try{showWhatsNew()}catch(e){}},1200);
  const cur=SECTIONS.find(s=>s[0]===active)||(active===ORDERS[0]?ORDERS:active===REPORTS[0]?REPORTS:active===PROD[0]?PROD:active===ACTIVITY[0]?ACTIVITY:active===CATALOG[0]?CATALOG:active===WORKERS[0]?WORKERS:active===SEARCH[0]?SEARCH:active===PROFILE[0]?PROFILE:active===USERS[0]?USERS:active===SETTINGS[0]?SETTINGS:null),acc=cur?cur[3]:"var(--pri)";
  document.body.classList.add("hasside");document.body.style.setProperty("--acc",acc);
  const app=typeof APP!=="undefined"?APP:"إدارة الأقسام";
  const h=document.createElement("header");h.className="topbar";
  h.innerHTML=`<button class="iconbtn lbl" id="mn" aria-label="القائمة">${MENU}<span>القائمة</span></button><span class="brand"><img src="icon.svg" alt="MAS"><span class="bt"><b>MAS</b><small>الماس للخزف والصيني</small></span></span><span class="sp"></span><button class="iconbtn lbl" id="rf" aria-label="تحديث">${ico("refresh")}<span>تحديث</span></button><span class="tbw"><button ${avAttr(ME.avatar,"avatar")} id="av" aria-label="حسابي" aria-haspopup="true">${avText(ME.avatar,initialOf())}</button><small>حسابي</small></span>`;
  const sg=s=>`<div class="sg" style="--c:${s[3]}"><a class="sh ${s[0]===active?"on":""}" href="${s[0]}">${ico(s[2])}<span>${s[1]}</span></a></div>`;
  const ddOrders=()=>{
    const on=active===ORDERS[0];
    const links=SUBS["orders.html"].map(x=>`<a href="orders.html#${x[1]}" data-h="${x[1]}">${x[0]}</a>`).join("")+'<a href="reports.html#orders">تقرير الطلبيات</a>';
    return `<div class="sg dd${on?" cur open":""}" style="--c:${ORDERS[3]}"><button type="button" class="sh${on?" on":""} ddt" aria-expanded="${on}">${ico(ORDERS[2])}<span>${ORDERS[1]}</span><svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div class="sub">${links}</div></div>`;
  };
  const NAVG=(()=>{try{return JSON.parse(localStorage.getItem("navg")||"{}")}catch(e){return{}}})();
  const grp=(t,a)=>{
    if(!a.length)return"";
    const body=a.join(""),hasOn=/class="sh on"/.test(body);
    const open=hasOn||(t in NAVG?NAVG[t]:(t==="الإنتاج"||t==="الأقسام"||t==="الطلبيات"));
    return `<div class="sgrp${open?"":" shut"}" data-g="${t}"><button type="button" class="sgt" aria-expanded="${open}"><span>${t}</span><svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div class="sgb">${body}</div></div>`;
  };
  const side=document.createElement("aside");side.className="side";side.id="side";
  side.innerHTML=`<div class="side-head"><img src="icon.svg" alt="MAS"><div><b class="wm">MAS <span>الماس</span></b><em class="wsub">للخزف والصيني · إدارة الأقسام</em><small>${esc(ME.name||"")}${ME.name?" · ":""}${ROLE_AR[ME.role]||""}</small></div></div>
  <nav><a class="sh ${active===""||active==="index.html"?"on":""}" href="index.html" style="--c:var(--pri)">${ico("home")}<span>الرئيسية</span></a>
  ${grp("الإنتاج",[sg(PROD)])}
  ${grp("الطلبيات",canReports()?[sg(ORDERS)]:[])}
  ${grp("الأقسام",[...visibleSections().map(sg),...soonSections().map(x=>`<div class="sg soon" style="--c:${x[2]}"><div class="sh soonitem" aria-disabled="true">${ico(x[1])}<span>${x[0]}<small class="soonn">سوف تُنشأ قريبًا</small></span></div></div>`)])}
  ${grp("التقارير والبحث",canReports()?[sg(REPORTS).replace(">"+REPORTS[1]+"<",">التقارير العامة<"),sg(SEARCH)]:[])}
  ${grp("البيانات الأساسية",canReports()?[sg(CATALOG),sg(WORKERS)]:[])}
  ${grp("إدارة النظام",canReports()?[sg(USERS),sg(ACTIVITY)]:[])}</nav>
  <div class="side-foot"><a class="sh ${active===PROFILE[0]?"on":""}" href="profile.html" style="--c:var(--pri)">${ico("user")}<span>ملفي الشخصي</span></a><a class="sh ${active===SETTINGS[0]?"on":""}" href="settings.html" style="--c:var(--pri)">${ico("cog")}<span>الإعدادات</span></a><button class="sh" id="th"></button><button class="sh" id="out">${ico("out")}<span>تسجيل الخروج</span></button><div class="ver" title="تاريخ الإصدار ${APP_BUILD}">الإصدار ${APP_VERSION}</div></div>`;
  const scrim=document.createElement("div");scrim.className="scrim";scrim.id="scrim";
  document.body.prepend(h);document.body.appendChild(side);document.body.appendChild(scrim);
  const open=v=>{document.body.classList.toggle("sideopen",v);const m=h.querySelector("#mn");m&&m.setAttribute("aria-expanded",v?"true":"false")};
  const mnB=h.querySelector("#mn"),wide=()=>matchMedia("(min-width:1200px)").matches;
  try{if(localStorage.getItem("navhide")==="1")document.body.classList.add("navhide")}catch(e){}
  const syncMn=()=>mnB.setAttribute("aria-expanded",String(wide()?!document.body.classList.contains("navhide"):document.body.classList.contains("sideopen")));
  mnB.setAttribute("aria-controls","side");syncMn();
  /* الكمبيوتر: القائمة بتظهر وتختفي بالضغط على زر القائمة (ومحفوظة). التابلت والموبايل: بتنزلق فوق الصفحة وتقفل لوحدها */
  mnB.onclick=()=>{if(wide()){const v=document.body.classList.toggle("navhide");try{localStorage.setItem("navhide",v?"1":"0")}catch(e){}syncMn()}else open(true)};
  scrim.onclick=()=>open(false);
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&document.body.classList.contains("sideopen"))open(false)});
  side.querySelectorAll(".ddt").forEach(b=>b.onclick=()=>{const g=b.parentElement,on=g.classList.toggle("open");b.setAttribute("aria-expanded",String(on))});
  side.querySelectorAll(".sg.dd .sub a").forEach(a=>a.addEventListener("click",()=>setTimeout(()=>open(false),60)));
  side.querySelectorAll(".sgt").forEach(b=>b.onclick=()=>{
    const g=b.parentElement,shut=g.classList.toggle("shut");b.setAttribute("aria-expanded",String(!shut));
    NAVG[g.dataset.g]=!shut;try{localStorage.setItem("navg",JSON.stringify(NAVG))}catch(e){}
  });
  h.querySelector("#rf").onclick=async e=>{const b=e.currentTarget;if(b.dataset.busy)return;b.dataset.busy="1";b.classList.add("spin");try{await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));if(typeof load==="function")await Promise.race([load(),new Promise(r=>setTimeout(r,12000))])}catch(x){}finally{delete b.dataset.busy;setTimeout(()=>b.classList.remove("spin"),400)}};
  side.querySelector("#th").onclick=toggleTheme;syncThemeIcon();
  side.querySelector("#th").insertAdjacentHTML("beforeend","<span>الوضع الليلي / النهاري</span>");
  side.querySelector("#out").onclick=async()=>{Snd.play("logout");await db.auth.signOut();location.href="index.html"};
  // قائمة الحساب (الصورة الرمزية في الشريط العلوي)
  const um=document.createElement("div");um.className="umenu";um.id="um";um.hidden=true;
  um.innerHTML=`<div class="uhead"><span ${avAttr(ME.avatar,"avatar big")}>${avText(ME.avatar,initialOf())}</span><div><b>${esc(ME.name||"بدون اسم")}</b><small>${esc(realEmail(ME.email))}</small>
    <div class="utags"><span class="tag">${ROLE_AR[ME.role]||""}</span>${ME.role!=="admin"?mySecs().map(k=>`<span class="tag">${SEC_AR[k]}</span>`).join(""):""}</div></div></div>
    <a href="profile.html">${ico("user")}<span>ملفي الشخصي</span></a>
    ${canReports()?`<a href="users.html">${ico("users")}<span>المستخدمين والصلاحيات</span></a>`:""}
    <a href="settings.html">${ico("cog")}<span>الإعدادات</span></a>
    <button id="umout">${ico("out")}<span>تسجيل الخروج</span></button>`;
  document.body.appendChild(um);
  const av=h.querySelector("#av");
  av.onclick=e=>{e.stopPropagation();um.hidden=!um.hidden};
  document.addEventListener("click",e=>{if(!um.hidden&&!um.contains(e.target))um.hidden=true});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")um.hidden=true});
  um.querySelector("#umout").onclick=async()=>{Snd.play("logout");await db.auth.signOut();location.href="index.html"};
  // الأقسام الفرعية: الرابط #open / #done ... بيفتح التبويب المناسب كأنها صفحة لوحدها
  const subs=subsOf(active).map(x=>x[1]);
  const head=document.createElement("div");head.className="pagehead";head.id="pagehead";
  window.markSub=()=>{
    const t=typeof tab!=="undefined"&&subs.includes(tab)?tab:"";
    side.querySelectorAll(".sg.cur .sub a").forEach(a=>a.classList.toggle("on",a.dataset.h===t));
    const lbl=subsOf(active).find(x=>x[1]===t);
    head.innerHTML=cur?`<span class="pi">${ico(cur===REPORTS?"chart":cur[2])}</span><div><b>${cur===REPORTS?"التقارير العامة":cur[1]}</b>${lbl?`<small>${lbl[0]}</small>`:""}</div>`:"";
  };
  const apply=(init)=>{
    let k=location.hash.slice(1);if(k==="reports")k="prod";
    const t=subs.includes(k)?k:(subs[0]||"");
    if(subs.length&&typeof tab!=="undefined"){tab=t;if(!init||t!=="open"&&t!=="log")try{setTab()}catch(e){}}
    markSub();open(false);if(!init)window.scrollTo(0,0);
  };
  const wrap=document.querySelector(".wrap");if(wrap&&cur)wrap.prepend(head);
  window.addEventListener("hashchange",()=>apply(false));apply(true);
  if(_today&&_today!==new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10))setTimeout(()=>toast("تاريخ تليفونك مختلف عن السيرفر، البرنامج هيستخدم تاريخ السيرفر","warn"),1200);
  applyPerms();hideSplash();updateBadge();
  setTimeout(()=>document.documentElement.classList.add("settled"),1600);
}
// ===== طباعة / PDF احترافي: ترويسة بالشعار واسم الجهة + ترقيم صفحات + تذييل =====
const _cssStr=t=>String(t).replace(/\\/g,"\\\\").replace(/"/g,'\\"').replace(/\n/g," ");
let _pt=null;
window.addEventListener("beforeprint",()=>{
  // الطباعة دايمًا بالوضع النهاري عشان الألوان والنصوص تطلع واضحة في الـ PDF
  if(_pt===null){_pt=document.documentElement.dataset.theme||"";document.documentElement.dataset.theme="light"}
  if(SET.get("psign",true)&&!document.getElementById("psg")){
    const w=document.querySelector(".wrap");
    if(w){const g=document.createElement("div");g.className="print-sign";g.id="psg";
      g.innerHTML='<div><span></span>إعداد: '+esc(window.__pby||(ME&&ME.name?ME.name:""))+'</div><div><span></span>مراجعة</div><div><span></span>اعتماد المدير</div>';w.appendChild(g)}
  }
  const org=(SET.get("org","")||"").trim()||(typeof APP!=="undefined"?APP:"إدارة الأقسام");
  const paper=SET.get("paper","A4"),orient=window.__po||SET.get("orient","portrait"),note=(SET.get("pnote","")||"").trim();
  const by="طُبع بواسطة "+(window.__pby||(ME&&ME.name?ME.name:"النظام")),when=new Date().toLocaleString("ar-EG");
  const cm=/Chrome\/(\d+)/.exec(navigator.userAgent),mb=!!cm&&+cm[1]>=131;
  let heads=[...document.querySelectorAll(".print-head")].filter(p=>p.parentElement&&p.parentElement.getClientRects().length);
  if(!heads.length){
    const w=document.querySelector(".wrap");
    if(w){const h=document.createElement("div");h.className="print-head gen";
      const t=((document.querySelector(".pagehead b")||document.querySelector("h1")||{}).textContent||document.title).trim();
      h.innerHTML="<h2>"+esc(t)+"</h2>";w.prepend(h);heads=[h]}
  }
  heads.forEach(h=>{
    if(h.querySelector(".pl-top"))return;
    const top=document.createElement("div");top.className="pl-top";
    top.innerHTML=(SET.get("plogo",true)?'<img class="pl" src="icon.svg" alt="">':"")+'<div class="pl-org">'+esc(org)+'</div><div class="pl-meta">'+esc(by)+'<br>'+esc(when)+'</div>';
    h.prepend(top);
    const h2=h.querySelector("h2");
    if(h2&&h2.textContent.includes(" — ")){h2.dataset.o=h2.textContent;h2.textContent=h2.textContent.split(" — ").slice(1).join(" — ")}
  });
  const fam=FONTS[SET.get("font","tajawal")]?FONTS[SET.get("font","tajawal")][0]:"Tajawal";
  let css="@page{size:"+paper+" "+orient+";margin:16mm 14mm "+(mb?"18mm":"16mm")+"}";
  if(mb){
    const box=(pos,txt)=>"@page{@"+pos+'{content:"'+_cssStr(txt)+'";font-family:"'+fam+'",sans-serif;font-size:8.5pt;color:#666}}';
    css+=box("bottom-right",org+" · "+by+" · "+when);
    if(SET.get("pnums",true))css+="@page{@bottom-left{content:\"صفحة \" counter(page) \" من \" counter(pages);font-family:\""+fam+"\",sans-serif;font-size:8.5pt;color:#666}}";
    if(note)css+=box("bottom-center",note);
  }else{
    const f=document.createElement("div");f.className="print-foot";f.id="pf";
    f.textContent=by+" · "+when+(note?" · "+note:"");document.body.appendChild(f);
  }
  const st=document.createElement("style");st.id="pstyle";st.textContent=css;document.head.appendChild(st);
  document.documentElement.classList.toggle("pbw",!!SET.get("pbw",false));
});
window.addEventListener("afterprint",()=>{
  if(_pt!==null){if(_pt)document.documentElement.dataset.theme=_pt;else delete document.documentElement.dataset.theme;_pt=null}
  document.getElementById("psg")?.remove();
  ["pf","pstyle"].forEach(i=>document.getElementById(i)?.remove());
  document.querySelectorAll(".print-head.gen").forEach(h=>h.remove());
  document.querySelectorAll(".pl-top").forEach(t=>t.remove());
  document.querySelectorAll(".print-head h2[data-o]").forEach(h=>{h.textContent=h.dataset.o;delete h.dataset.o});
  document.documentElement.classList.remove("pbw");
});

/* ===== شاشة البداية (مرة واحدة في الجلسة) ===== */
function hideSplash(){
  try{window.__navStop&&window.__navStop()}catch(e){}
  const s=document.getElementById("splash");if(!s)return;
  try{sessionStorage.setItem("sp","1")}catch(e){}
  setTimeout(()=>{s.classList.add("done");setTimeout(()=>{s.classList.add("hide");setTimeout(()=>s.remove(),500)},260)},Math.max(0,600-performance.now()));
}
setTimeout(hideSplash,6000);

/* ===== مزامنة تلقائية: لما البيانات تتغير على السيرفر الصفحة بتتحدث لوحدها ===== */
(function(){
  let last=0,pending=false,hist=[];
  const busy=()=>{const a=document.activeElement;return !!document.getElementById("ov")||!!(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))};
  function run(){
    if(document.visibilityState!=="visible"||!navigator.onLine)return;
    if(busy()){pending=true;return}
    const now=Date.now();hist=hist.filter(t=>now-t<60000);
    if(hist.length>=6||now-last<1500)return; // حماية من التكرار
    hist.push(now);last=now;pending=false;
    try{
      const fn=typeof window.__masRefresh==="function"?window.__masRefresh:(typeof load==="function"?load:null);
      if(fn)Promise.resolve(fn()).catch(()=>{});
    }catch(e){}
  }
  addEventListener("mas-data",run);
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")setTimeout(run,300)});
  setInterval(run,60000);
  setInterval(()=>{if(pending)run()},5000);
})();

/* ===== أنيميشن التحميل والتنقل بين الصفحات ===== */
(function(){
  const st=document.createElement("style");
  st.textContent=`#navl{position:fixed;inset:0;z-index:99;pointer-events:none}
#navl .bar{position:absolute;top:0;left:0;right:0;height:3px;transform-origin:100% 50%;transform:scaleX(0);opacity:0;background:linear-gradient(90deg,#B9984C,#E8D49B,#B9984C);box-shadow:0 0 10px rgba(215,185,111,.7)}
#navl.on .bar{opacity:1}
#navl.run .bar{transform:scaleX(.85);transition:transform 8s cubic-bezier(.1,.6,.2,1)}
#navl.fin .bar{transform:scaleX(1);opacity:0;transition:transform .25s ease-out,opacity .3s .25s}
#navl .dim{position:absolute;inset:0;display:grid;place-items:center;background:rgba(40,14,20,.3);opacity:0;transition:opacity .2s}
#navl.nav{pointer-events:auto}
#navl.nav .dim{opacity:1;transition-delay:.15s}
#navl.fin .dim{opacity:0;transition-delay:0s}
#navl .box{display:flex;flex-direction:column;align-items:center;gap:10px;padding:18px 26px;border-radius:18px;background:linear-gradient(160deg,#642631,#421B24);color:#E8D49B;font-size:.9rem;box-shadow:0 12px 34px rgba(0,0,0,.4)}
#navl .ring{width:42px;height:42px;border-radius:50%;border:4px solid rgba(215,185,111,.25);border-top-color:#D7B96F;animation:navspin .8s linear infinite}
@keyframes navspin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){#navl .ring{animation:none}#navl.run .bar{transition:none}}`;
  document.head.appendChild(st);
  const el=document.createElement("div");el.id="navl";
  el.innerHTML='<i class="bar"></i><div class="dim"><div class="box"><i class="ring"></i><span>جاري التحميل…</span></div></div>';
  document.body.appendChild(el);
  let t,f;
  function start(nav){
    clearTimeout(t);clearTimeout(f);
    el.classList.remove("fin");el.classList.add("on");
    if(nav)el.classList.add("nav");
    void el.offsetWidth;el.classList.add("run");
    f=setTimeout(stop,10000); // أمان: لو الصفحة ماتغيرتش (تحميل ملف مثلًا)
  }
  function stop(){
    if(!el.classList.contains("on"))return;
    clearTimeout(f);el.classList.add("fin");
    t=setTimeout(()=>el.classList.remove("on","nav","run","fin"),600);
  }
  window.__navStop=stop;
  // الصفحة الجديدة بتحمّل: شريط ذهبي فوق (إلا لو شاشة البداية ظاهرة)
  if(!document.getElementById("splash"))start(false);
  document.addEventListener("click",e=>{
    if(e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    const a=e.target.closest&&e.target.closest("a[href]");
    if(!a||(a.target&&a.target!=="_self")||a.hasAttribute("download"))return;
    let u;try{u=new URL(a.href,location.href)}catch(x){return}
    if(u.origin!==location.origin||/\.apk$/i.test(u.pathname))return;
    if(u.pathname===location.pathname&&u.search===location.search)return; // نفس الصفحة (تبويب داخلي)
    start(true);
  });
  addEventListener("beforeunload",()=>start(true));
  addEventListener("pageshow",e=>{if(e.persisted)stop()});
})();

/* ===== Skeleton وحالات الخطأ ===== */
function skel(id,n=3){
  const el=document.getElementById(id);if(!el)return;
  el.setAttribute("aria-busy","true");
  el.innerHTML=el.tagName==="TBODY"
    ?Array.from({length:n},()=>'<tr><td colspan="9"><i class="sk" style="height:22px"></i></td></tr>').join("")
    :Array.from({length:n},()=>'<div class="card skc"><div class="top"><i class="sk" style="width:40%;height:20px"></i><i class="sk" style="width:60px;height:20px;border-radius:99px"></i></div><i class="sk" style="width:70%;height:12px"></i><i class="sk" style="height:8px;margin-top:14px"></i><i class="sk" style="width:55%;height:12px;margin-top:14px"></i></div>').join("");
}
function settle(){document.body.classList.add("noanim")}
function fail(id,retry){
  const el=document.getElementById(id);
  // لو في بيانات معروضة بالفعل، نكتفي برسالة بدل ما نمسحها
  if(!el||(el.children.length&&!el.querySelector(".sk,.empty"))){toast("تعذر تحميل البيانات");return}
  const h='<div class="empty err-state">تعذر تحميل البيانات<br><button class="btn sm" id="retry">إعادة المحاولة</button></div>';
  el.removeAttribute("aria-busy");
  el.innerHTML=el.tagName==="TBODY"?`<tr><td colspan="9">${h}</td></tr>`:h;
  el.querySelector("#retry").onclick=()=>{skel(id);retry()};
}
function countUp(el,to,o={}){
  const t0=performance.now(),d=600,dec=o.dec||0,suf=o.suf||"";
  const fmt=v=>(dec?v.toFixed(dec):nf(Math.round(v)))+suf;
  if(document.body.classList.contains("noanim")){el.textContent=fmt(to);return}
  (function f(t){const p=Math.min(1,(t-t0)/d);el.textContent=fmt(to*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(f)})(t0);
}

/* ===== أدوات عامة ===== */
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function toast(m,kind){
  let t=document.getElementById("toast");
  if(!t){t=document.createElement("div");t.id="toast";t.setAttribute("role","status");document.body.appendChild(t)}
  const type=kind||(/^(خطأ|حصل خطأ|تعذر|لم يتم)/.test(m)?"bad":/اكتب|كمّل|أكبر/.test(m)?"warn":"ok");
  t.textContent=m;t.className="";void t.offsetWidth;t.className="show "+type;
  Snd.play(type==="ok"?"success":type==="bad"?"error":"warn");
  clearTimeout(t._t);t._t=setTimeout(()=>t.className="",3000);
}
function closeModal(){
  cbHide();
  const o=document.getElementById("ov");if(!o)return;
  o.removeAttribute("id");
  if(document.documentElement.classList.contains("calm")){o.remove();return}
  o.classList.add("out");setTimeout(()=>o.remove(),170);
}
/* ===== ما الجديد: تلقائي من رسائل الـ commit على GitHub =====
   اكتب رسالة الـ commit بالعربي (السطر الأول + سطور إضافية اختيارية) وهتظهر لوحدها.
   الـ commits اللي رسالتها إنجليزي (Update x.js ...) بتتجاهل. لو عاوز تحكم يدوي: ضيف إصدار في APP_CHANGES وهيكسب. */
const GH_NAMES={"glaze.html":"صفحة الجليز","decoration.html":"صفحة الزخرفة","spray.html":"صفحة الرش","repair.html":"صفحة التصليح","casting.html":"صفحة الصب اليدوي","production.html":"تسجيل الإنتاج","reports.html":"التقارير","orders.html":"الطلبيات","reports.js":"التقارير","search.html":"البحث الشامل","catalog.html":"الأصناف والألوان","workers.html":"العمال","users.html":"المستخدمين والصلاحيات","activity.html":"سجل النشاط","settings.html":"الإعدادات","profile.html":"الملف الشخصي","index.html":"الصفحة الرئيسية","common.js":"وظائف البرنامج الأساسية","style.css":"التصميم","theme.css":"التصميم والأيقونات","dash.js":"لوحة المؤشرات"};
function ghFiles(files){
  const n=[...new Set((files||[]).map(f=>GH_NAMES[String(f.filename||"").split("/").pop()]).filter(Boolean))];
  return n.length?"تحديث وتحسين: "+n.slice(0,4).join("، ")+(n.length>4?" وغيرها":""):"";
}
async function ghChanges(){
  const K="mas_gh_log";let o=null;
  try{o=JSON.parse(localStorage.getItem(K)||"null")}catch(e){}
  if(o&&Date.now()-o.t<20*60000){window.GH_STAT=o.l.length?"ok":"empty";return o.l}
  try{
    if(!navigator.onLine||typeof GH_REPO==="undefined"){window.GH_STAT="offline";throw 0}
    const H={headers:{Accept:"application/vnd.github+json"}};
    const r=await fetch("https://api.github.com/repos/"+GH_REPO+"/commits?per_page=30",H);
    if(!r.ok){window.GH_STAT="http"+r.status;throw 0}
    const l=[];let det=0;
    for(const c of await r.json()){
      const m=String((c.commit&&c.commit.message)||"");
      if(/^merge branch/i.test(m))continue;
      let lines=m.split("\n").slice(/^merge pull request/i.test(m)?1:0).map(x=>x.replace(/^[\s\-*•]+/,"").trim()).filter(Boolean);
      if(!/[\u0600-\u06FF]/.test(m)){
        /* رسالة إنجليزي (زي Add files via upload): نطلّع ملخص تلقائي من أسماء الملفات اللي اتغيّرت */
        lines=[];if(det++<5){try{const rr=await fetch("https://api.github.com/repos/"+GH_REPO+"/commits/"+c.sha,H);if(rr.ok){const f=ghFiles((await rr.json()).files);if(f)lines=[f]}}catch(e){}}
      }
      if(lines.length)l.push({sha:c.sha,d:String((c.commit.committer&&c.commit.committer.date)||"").slice(0,10),lines});
    }
    window.GH_STAT=l.length?"ok":"empty";
    try{localStorage.setItem(K,JSON.stringify({t:Date.now(),l}))}catch(e){}
    return l;
  }catch(e){return o?o.l:[]}
}
async function ghLog(){
  const m=typeof APP_CHANGES!=="undefined"&&APP_CHANGES[0];
  if(m&&m[0]===APP_VERSION)return m;
  const l=await ghChanges();
  return l.length?[APP_VERSION,l[0].d,l.slice(0,6).flatMap(x=>x.lines)]:(m||null);
}
async function showWhatsNew(force){
  const m=typeof APP_CHANGES!=="undefined"&&APP_CHANGES[0];
  let title,items,key,seenK;
  if(m&&m[0]===APP_VERSION){title="ما الجديد في الإصدار "+m[0];items=m[2];key=m[0];seenK="mas_seen_ver"}
  else{
    const l=await ghChanges();
    if(!l.length){if(force)toast("مفيش ملاحظات لهذا الإصدار");return}
    key=l[0].sha;seenK="mas_seen_sha";
    let seen="";try{seen=localStorage.getItem(seenK)||""}catch(e){}
    const n=l.findIndex(x=>x.sha===seen);
    if(!force&&n===0)return;
    const fresh=force?l.slice(0,6):(n<0?l.slice(0,5):l.slice(0,n));
    title="ما الجديد في البرنامج";items=fresh.flatMap(x=>x.lines);
  }
  try{if(!force&&localStorage.getItem(seenK)===key)return;if(!force)localStorage.setItem(seenK,key)}catch(e){if(!force)return}
  openModal(title,`<ul style="margin:0;padding:0 18px 0 0;line-height:1.9">${items.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`,closeModal,"تمام");
}
function openModal(title,body,onSave,saveText="حفظ"){
  closeModal();Snd.play("open");
  const d=document.createElement("div");d.className="ov";d.id="ov";
  d.innerHTML=`<div class="modal"><h3>${title}</h3><div>${body}</div><div class="row"><button class="btn" id="mSave">${saveText}</button><button class="btn ghost" onclick="closeModal()">إلغاء</button></div></div>`;
  document.body.appendChild(d);
  d.addEventListener("mousedown",e=>{if(e.target===d)closeModal()});
  d.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();else if(e.key==="Enter"&&e.target.tagName==="INPUT"&&e.target.type!=="search"){e.preventDefault();d.querySelector("#mSave")?.click()}});
  d.querySelector("input:not([type=date]):not([type=hidden]),select")?.focus({preventScroll:true});
  enhanceAll(d);if(d.querySelector(NAME_SEL))catReady();
  d.addEventListener("focusin",e=>{if(e.target.matches&&e.target.matches(NAME_SEL)){if(e.target.value)try{e.target.select()}catch(x){}}});
  const b=d.querySelector("#mSave");
  b.onclick=async()=>{b.disabled=true;b.classList.add("loading");try{if((await checkNames(d))&&await onSave()!==false){saveHist(d);closeModal()}}catch(e){toast("حصل خطأ: "+e.message)}finally{b.disabled=false;b.classList.remove("loading")}};
}
function today(){return _today||new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10)}
function fmtD(d){return new Date(d+"T00:00:00").toLocaleDateString("ar-EG")}
// التاريخ مع اسم اليوم (الخميس ١٣‏/١١‏/٢٠٢٦) — بيُستخدم في التقارير
function fmtDW(d){if(!d)return"";const x=new Date(d+"T00:00:00");return isNaN(x)?String(d):x.toLocaleDateString("ar-EG",{weekday:"long"})+" "+fmtD(d)}
function ask(msg,yes="نعم، احذف"){return new Promise(res=>{
  const d=document.createElement("div");d.className="ov";d.style.zIndex=40;
  d.innerHTML=`<div class="modal"><h3>${msg}</h3><div class="row"><button class="btn" id="yes">${yes}</button><button class="btn ghost" id="no">إلغاء</button></div></div>`;
  document.body.appendChild(d);
  d.querySelector("#yes").onclick=()=>{d.remove();res(true)};
  d.querySelector("#no").onclick=()=>{d.remove();res(false)};
})}

/* ===== أوفلاين + PWA ===== */
(function(){
  const o=document.createElement("div");o.id="offline";o.setAttribute("role","status");o.setAttribute("aria-live","polite");
  o.innerHTML='<div class="ob"><svg class="wf" viewBox="0 0 24 24" aria-hidden="true"><path class="w1" d="M2 9a15 15 0 0 1 20 0"/><path class="w2" d="M5 12.5a10.5 10.5 0 0 1 14 0"/><path class="w3" d="M8.5 16a5.5 5.5 0 0 1 7 0"/><circle class="w4" cx="12" cy="19.5" r="1.2"/><path class="sl" d="M3 3l18 18"/><path class="ck" d="M6 13l4 4 8-9"/></svg><div class="ot"><b></b><small></small></div></div>';
  const T=o.querySelector("b"),S=o.querySelector("small");let hide=null;
  document.addEventListener("DOMContentLoaded",()=>document.body.appendChild(o));
  const pend=()=>{try{return Q_.get().length}catch(e){return 0}};
  /* نسخة صغيرة من عدد التسجيلات المعلقة في IndexedDB عشان الـ sw.js يقراها (هو مش بيشوف localStorage) */
  const meta=(()=>{let p=null;const open=()=>p||(p=new Promise(res=>{try{const q=indexedDB.open("mas-meta",1);q.onupgradeneeded=()=>q.result.createObjectStore("k");q.onsuccess=()=>res(q.result);q.onerror=q.onblocked=()=>res(null)}catch(e){res(null)}}));return{put:async(k,v)=>{const d=await open();if(!d)return;try{d.transaction("k","readwrite").objectStore("k").put(v,k)}catch(e){}}}})();
  window.masMeta=meta;
  /* Background Sync: نسجّل طلب "نبّهني لما النت يرجع" والنت واقع، والمتصفح بيصحّي الـ sw.js لما الاتصال يرجع حتى لو البرنامج مقفول */
  const regSync=()=>{try{navigator.serviceWorker.ready.then(r=>r.sync&&r.sync.register("net-back")).catch(()=>{})}catch(e){}};
  function down(){
    regSync();
    clearTimeout(hide);o.classList.remove("back","show");void o.offsetWidth;
    const n=pend();
    T.textContent="انقطع الاتصال بالإنترنت";
    S.textContent=n?n+" تسجيل محفوظ على الجهاز وهيتبعت أول ما يرجع الاتصال":"تقدر تكمل شغل، والتسجيلات هتتحفظ وتتبعت لما يرجع الاتصال";
    o.classList.add("show");try{Snd.play("warn")}catch(e){}
    try{navigator.vibrate&&navigator.vibrate([80,60,80])}catch(e){}
  }
  function up(){
    if(!o.classList.contains("show"))return;
    o.classList.add("back");T.textContent="رجع الاتصال";S.textContent="تم الاتصال بالإنترنت من جديد";
    try{Snd.play("success")}catch(e){}
    clearTimeout(hide);hide=setTimeout(()=>o.classList.remove("show","back"),2600);
  }
  /* إشعار نظام (يظهر والبرنامج في الخلفية) بانقطاع/رجوع النت، وبيختفي لوحده من الـ sw.js */
  const sysNote=(kind,body)=>{
    try{
      if(!("Notification" in window)||Notification.permission!=="granted")return;
      if(localStorage.getItem("net_notify")==="0")return; // المستخدم قفل التنبيه من الإعدادات
      if(document.visibilityState==="visible")return; // البرنامج قدامك: الشريط جوه البرنامج كفاية
      navigator.serviceWorker.ready.then(r=>{r.active&&r.active.postMessage({type:"net",kind,body})}).catch(()=>{});
    }catch(e){}
  };
  /* فحص حقيقي للإنترنت (navigator.onLine بيقول متصل بالشبكة بس، مش بالضرورة فيه نت) */
  async function probe(){
    if(!navigator.onLine)return false;
    const c=new AbortController(),t=setTimeout(()=>c.abort(),6000);
    try{await fetch("icon.svg?_chk="+Date.now(),{method:"HEAD",cache:"no-store",signal:c.signal});return true}
    catch(e){return false}finally{clearTimeout(t)}
  }
  let st=navigator.onLine?"on":"off",busy=false;
  function setNet(next){
    if(next===st)return;st=next;
    if(next==="off"){
      down();
      const n=pend();
      sysNote("off",n?n+" تسجيل محفوظ هيتبعت لما يرجع الاتصال":"تقدر تكمل شغل بدون إنترنت، والتسجيلات بتتحفظ على الجهاز");
    }else{
      const n=pend();
      up();
      sysNote("on",n?"جاري إرسال "+n+" تسجيل محفوظ":"تم الاتصال بالإنترنت من جديد");
    }
  }
  async function check(){
    if(busy)return;busy=true;
    try{setNet(await probe()?"on":"off")}finally{busy=false}
  }
  addEventListener("offline",()=>setNet("off"));
  addEventListener("online",async()=>{ // "online" ممكن تيجي قبل ما النت يشتغل فعلًا: نعيد الفحص كذا مرة
    for(let i=0;i<6;i++){await check();if(st==="on")return;await new Promise(r=>setTimeout(r,4000))}
  });
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")check()});
  let tick=0;setInterval(()=>{tick++;if(st==="off"||tick%3===0)check()},10000); // أوفلاين: كل 10 ثواني، متصل: كل 30
  document.addEventListener("DOMContentLoaded",()=>{meta.put("pend",pend());try{meta.put("netnotify",localStorage.getItem("net_notify")==="0"?"0":"1")}catch(e){}if(!navigator.onLine)down()});
  if("serviceWorker" in navigator&&/^https?:$/.test(location.protocol))addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
})();


/* ===== الوضع الداكن اليدوي ===== */
try{const t=localStorage.getItem("theme");if(t)document.documentElement.dataset.theme=t}catch(e){}
const isDark=()=>document.documentElement.dataset.theme?document.documentElement.dataset.theme==="dark":matchMedia("(prefers-color-scheme:dark)").matches;
function syncThemeIcon(){const b=document.getElementById("th");if(b)b.innerHTML=ico(isDark()?"sun":"moon")}
function toggleTheme(){const t=isDark()?"light":"dark";document.documentElement.dataset.theme=t;try{localStorage.setItem("theme",t)}catch(e){}syncThemeIcon()}

/* ===== تواريخ وأرقام ===== */
const nf=n=>Number(n||0).toLocaleString(SET.get("digits","mix")==="arab"?"ar-EG":"en-US");
function addDays(d,n){const x=new Date(d+"T00:00:00Z");x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)}
function daysBetween(a,b){return Math.round((new Date(b+"T00:00:00Z")-new Date(a+"T00:00:00Z"))/864e5)}
const LATE_DAYS=14;
function ageDays(d){return d?Math.max(0,daysBetween(String(d).slice(0,10),today())):0}
function ageTxt(d){const n=ageDays(d);return n===0?"النهارده":n===1?"من أمس":n===2?"من يومين":n<=10?`منذ ${n} أيام`:`منذ ${n} يوم`}
const isLate=(status,d)=>status==="open"&&ageDays(d)>LATE_DAYS;
function sumQty(rows,from,to){return rows.reduce((a,r)=>a+((!from||r.d>=from)&&(!to||r.d<=to)?r.qty:0),0)}

/* ===== بحث عربي ===== */
const norm=s=>String(s??"").toLowerCase().replace(/[\u064B-\u0652\u0640]/g,"").replace(/[أإآ]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي").trim();
const hit=(q,...t)=>!q||t.some(x=>norm(x).includes(q));
function searchBox(beforeId,onInput,ph="بحث بالصنف أو اللون…"){
  const el=document.getElementById(beforeId);if(!el)return;
  const d=document.createElement("div");d.className="search noprint";
  d.innerHTML=`${ico("search")}<input type="search" placeholder="${ph}" aria-label="بحث"><button type="button" class="x" hidden aria-label="مسح">×</button>`;
  el.before(d);
  const i=d.querySelector("input"),x=d.querySelector(".x");
  i.oninput=()=>{x.hidden=!i.value;onInput(norm(i.value))};
  x.onclick=()=>{i.value="";i.oninput();i.focus()};
}

/* ===== شريط ملخص (KPI) ===== */
// items: [[العنوان, القيمة, لون اختياري, {suf,dec}]]
function kpis(id,items){
  const el=document.getElementById(id)||id;if(!el)return;
  el.innerHTML=items.map(i=>`<div class="kpi"><div class="kv" ${i[2]?`style="color:${i[2]}"`:""}>0</div><div class="kl">${i[0]}</div>${i[4]?`<div class="kd ${i[4][0]}">${i[4][1]}</div>`:""}</div>`).join("");
  el.querySelectorAll(".kv").forEach((v,k)=>countUp(v,items[k][1],items[k][3]||{}));
}
/* ===== اختصارات التاريخ للفلاتر ===== */
function dateChips(fromId,toId,onChange){
  const f=document.getElementById(fromId),t=document.getElementById(toId);if(!f||!t)return;
  const w=document.createElement("div");w.className="chips noprint";
  const O=[["اليوم","today"],["7 أيام","7"],["الشهر","month"],["الكل","all"]];
  w.innerHTML=O.map(o=>`<button type="button" class="chip" data-k="${o[1]}">${o[0]}</button>`).join("");
  (f.closest(".two")||f.parentElement).before(w);
  const clear=()=>w.querySelectorAll(".chip").forEach(c=>c.classList.remove("on"));
  f.addEventListener("change",clear);t.addEventListener("change",clear);
  w.onclick=e=>{
    const b=e.target.closest(".chip");if(!b)return;const k=b.dataset.k,T=today();
    [f.value,t.value]=k==="all"?["",""]:k==="today"?[T,T]:k==="7"?[addDays(T,-6),T]:[T.slice(0,8)+"01",T];
    clear();b.classList.add("on");onChange();
  };
}

/* ===== تاريخ التسليم والتأجيل ===== */
const lateOrder=o=>o.status==="open"&&(o.due_date?today()>o.due_date:isLate(o.status,o.order_date));
function dueTag(o){
  if(o.status==="done"||!o.due_date)return "";
  const d=Math.round((new Date(o.due_date+"T12:00:00")-new Date(today()+"T12:00:00"))/864e5);
  return d<0?`<span class="tag late">متأخرة ${-d} يوم عن التسليم</span>`:d===0?'<span class="tag late">التسليم النهارده</span>':`<span class="tag">التسليم ${fmtD(o.due_date)} · باقي ${d} يوم</span>`;
}
function postponeOrder(sec,table,o,reload){
  if(!o)return;
  const base=o.due_date&&o.due_date>today()?o.due_date:today();
  const plus=n=>{const d=new Date(base+"T12:00:00");d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
  openModal("تأجيل الطلبية",`<div class="nums">${esc(o.item)} · التسليم الحالي: <b>${o.due_date?fmtD(o.due_date):"غير محدد"}</b></div>
    <div class="row" style="flex-wrap:wrap;gap:6px;margin:8px 0">${[1,3,7].map(n=>`<button type="button" class="btn ghost sm" onclick="document.getElementById('m-nd').value='${plus(n)}'">+${n===1?"يوم":n+" أيام"}</button>`).join("")}</div>
    <label>تاريخ التسليم الجديد</label><input type="date" id="m-nd" value="${plus(3)}" min="${today()}"><label>السبب (اختياري)</label><input id="m-pr">`,async()=>{
    const nd=document.getElementById("m-nd").value,why=document.getElementById("m-pr").value.trim();
    if(!nd){toast("اختار التاريخ الجديد");return false}
    if(nd===o.due_date){toast("اختار تاريخ مختلف");return false}
    const{error}=await db.from(table).update({due_date:nd,postponed_count:(o.postponed_count||0)+1}).eq("id",o.id);
    if(error){toast("خطأ: "+error.message);return false}
    const l=await db.from("order_postponements").insert({section:sec,order_id:o.id,old_date:o.due_date||null,new_date:nd,reason:why||null});
    await reload();toast(l.error?"اتأجلت، لكن سجل التأجيلات مش شغال":"تم التأجيل");
  },"تأجيل");
}

/* ===== القوائم الثابتة: اقتراحات + تصحيح الأخطاء الإملائية قبل الحفظ ===== */
let CAT=null,_catP=null;
const PAGE_KIND=/decoration/.test(location.pathname)?"code":"color";
const NAME_SEL="#m-item,#m-color,#m-color2,#m-name,#m-code,#m-sc,.msc,.nr .c,.it,.sb";
const kindOf=el=>(el.id==="m-item"||el.classList.contains("it"))?"item":el.id==="m-code"?"code":el.dataset.kind||PAGE_KIND;
const CATM={item:new Map(),color:new Map(),code:new Map()};
function catReady(){
  if(!_catP)_catP=(async()=>{
    let r=await db.from("catalog").select("id,kind,name,code").order("name");
    if(r.error&&/code/i.test(r.error.message||""))r=await db.from("catalog").select("id,kind,name").order("name");
    if(r.error){CAT=null;return}
    CAT={item:[],color:[],code:[]};
    r.data.forEach(x=>{if(CAT[x.kind]){CAT[x.kind].push(x.name);CATM[x.kind].set(x.name,{id:x.id,code:x.code||""})}});fillLists();
  })().catch(()=>{CAT=null});
  return _catP;
}
function fillLists(){
  if(!CAT)return;
  ["item","color","code"].forEach(k=>{
    let dl=document.getElementById("cat-"+k);
    if(!dl){dl=document.createElement("datalist");dl.id="cat-"+k;document.body.appendChild(dl)}
    dl.innerHTML=CAT[k].map(n=>`<option value="${esc(n)}">`).join("");
  });
}
function attachLists(root){enhanceAll(root)}
function lev(a,b){const m=a.length,n=b.length;if(!m)return n;if(!n)return m;let p=Array.from({length:n+1},(_,i)=>i);for(let i=1;i<=m;i++){const c=[i];for(let j=1;j<=n;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}return p[n]}
function pick(msg,opts){return new Promise(res=>{
  const d=document.createElement("div");d.className="ov";d.style.zIndex=40;
  d.innerHTML=`<div class="modal"><h3>${esc(msg)}</h3><div style="display:flex;flex-direction:column;gap:8px">${opts.map((o,i)=>`<button class="btn ${i===opts.length-1?"ghost":""}" data-i="${i}">${esc(o)}</button>`).join("")}</div></div>`;
  document.body.appendChild(d);
  d.onclick=e=>{const b=e.target.closest("[data-i]");if(b){d.remove();res(+b.dataset.i)}};
})}
async function addCat(kind,name){
  const r=await db.from("catalog").insert({kind,name});
  if(r.error&&r.error.code!=="23505"){toast("خطأ: "+r.error.message);return false}
  if(CAT&&!CAT[kind].includes(name)){CAT[kind].push(name);CATM[kind].set(name,{id:null,code:""});fillLists()}
  return true;
}
// true = كمّل الحفظ | false = ارجع للتعديل
async function checkNames(root){
  const els=[...root.querySelectorAll(NAME_SEL)];if(!els.length)return true;
  await catReady();if(!CAT)return true;
  for(const el of els){
    const kind=kindOf(el),v=el.value.trim();if(!v)continue;
    const list=CAT[kind],nv=norm(v),hit=list.find(n=>norm(n)===nv);
    if(hit){el.value=hit;continue}
    if(!list.length){if(!await addCat(kind,v))return false;continue}
    const sim=list.map(n=>[n,lev(norm(n),nv),Math.min(norm(n).length,nv.length)]).filter(x=>x[1]<=Math.max(1,Math.floor(x[2]/4))).sort((x,y)=>x[1]-y[1])[0];
    if(sim){
      const c=await pick(`«${v}» مش في القائمة. تقصد «${sim[0]}»؟`,[`استخدم «${sim[0]}»`,`إضافة «${v}» كاسم جديد`,"رجوع للتعديل"]);
      if(c===0){el.value=sim[0];continue}if(c!==1)return false;
    }else if(await pick(`«${v}» مش في القائمة. تضيفه كاسم جديد؟`,["نعم، أضفه","رجوع للتعديل"])!==0)return false;
    if(!await addCat(kind,v))return false;
  }
  return true;
}

/* ===== الشغل بدون إنترنت: التسجيلات بتتحفظ على الجهاز وتتبعت لوحدها ===== */
const Q_={k:"pendingQ",get(){try{return JSON.parse(localStorage.getItem(this.k)||"[]")}catch(e){return[]}},set(v){try{localStorage.setItem(this.k,JSON.stringify(v))}catch(e){}try{masMeta.put("pend",v.length)}catch(e){}},add(it){const q=this.get();q.push(it);this.set(q)}};
const uuid=()=>crypto.randomUUID?crypto.randomUUID():"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==="x"?r:(r&3|8)).toString(16)});
const isNet=e=>!navigator.onLine||/fetch|network|load failed/i.test((e&&e.message)||"");
let CID=true;
const noCid=({client_id,...r})=>r;
let WK=null;
async function wkLoad(){
  if(WK)return;WK=[];
  try{const{data}=await db.from("workers").select("name,section").eq("active",true).order("name");WKA=data||[]}catch(e){}
  const l=document.getElementById("wk-list");if(l)l.innerHTML=wkSel().map(n=>`<option value="${esc(n)}">`).join("")
}
// المدير يشوف كل العمال، وغيره يشوف عمال قسمه بس (والقسم الشغال حاليًا في صفحة الإنتاج)
let WKA=[];
function wkSel(){
  if(!ME||ME.role==="admin")return WKA.map(x=>x.name);
  let ok=mySecs();
  try{if(typeof sec==="string"&&sec&&ok.includes(sec))ok=[sec]}catch(e){}
  return WKA.filter(x=>x.section&&ok.includes(x.section)).map(x=>x.name)
}
const XW=(deco)=>'<label>'+(deco?'اسم العامل':'اسم العامل (اختياري)')+'</label><input id="m-w" list="wk-list" placeholder="اختار من العمال أو اكتب اسم"><datalist id="wk-list">'+wkSel().map(n=>`<option value="${esc(n)}">`).join("")+'</datalist>';
// الزخرفة: اسم العامل بيظهر في أول الشاشة (XT)، وباقي الحقول في آخرها (XF)
const XT=(deco)=>{if(!deco)return "";wkLoad();return XW(true)};
const XF=(deco)=>{wkLoad();return (deco?'<label>الرسمة — كود أو وصف (اختياري)</label><input id="m-ds" placeholder="مثال: كود 125 أو وردة بحواف ذهبي" maxlength="120">':XW(false))+'<label>ملاحظة (اختياري)</label><input id="m-n" placeholder="أي تعليق على الشغل">'};
// لون الرش: خانة منسدلة من قائمة الألوان، بتتملّى مسبقًا بلون الطلبية (تقدر تغيّره لو اترشّ بلون تاني)
const XS=(def,id="m-sc")=>'<label>لون الرش</label><input id="'+id+'" data-kind="color" value="'+esc(def||"")+'" placeholder="لون الرش" autocomplete="off" maxlength="60">';
const xfRead=()=>{const o={},w=(document.getElementById("m-w")||{}).value,n=(document.getElementById("m-n")||{}).value;if(w&&w.trim())o.worker=w.trim();if(n&&n.trim())o.note=n.trim();const d=(document.getElementById("m-ds")||{}).value;if(d&&d.trim())o.design=d.trim();const sc=(document.getElementById("m-sc")||{}).value;if(sc&&sc.trim())o.spray_color=sc.trim();return o};
let _scWarn=false;
async function insertRow(t,row){
  let r=await db.from(t).insert(CID?row:noCid(row));
  // عمود spray_color لسه ما اتضافش في Supabase: نسجّل الإنتاج من غيره ونفكّر المستخدم يشغّل الملف
  if(r.error&&/spray_color/.test(r.error.message||"")&&row.spray_color){
    const{spray_color,...rest}=row;row=rest;
    if(!_scWarn){_scWarn=true;try{toast("اتسجّل الإنتاج لكن لون الرش ما اتحفظش — شغّل ملف setup_spray_color.sql في Supabase","warn")}catch(e){}}
    r=await db.from(t).insert(CID?row:noCid(row));
  }
  if(r.error&&/worker|note|design/.test(r.error.message||"")&&(row.worker||row.note||row.design)){const{worker,note,design,...rest}=row;row=rest;r=await db.from(t).insert(CID?row:noCid(row))}
  if(r.error&&/client_id/.test(r.error.message||"")){CID=false;r=await db.from(t).insert(noCid(row))}
  return r;
}
// تسجيل الصب اليدوي: لو مفيش نت بيتحفظ على الجهاز وبيتبعت لوحده (زي باقي الأقسام)
async function castInsert(row){
  const id=uuid(),r2={...row,client_id:id};
  let res;try{res=await insertRow("casting_log",r2)}catch(e){res={error:{message:String(e)}}}
  if(res.error&&isNet(res.error)){
    Q_.add({id,table:"casting_log",row:r2,sec:"casting",rid:row.order_id||"free",qty:row.qty,txt:(row.item||"—")+(row.shift?" · "+row.shift:"")+(row.scrap?" · هالك "+row.scrap:"")});
    updateBadge();return{queued:true};
  }
  return res;
}
// بعد التسجيل: نظبط حالة الطلبية (مفتوحة / مكتملة)
async function syncAfter(it){
  const s=it.sync;if(!s)return false;
  if(s.lv){
    const{data}=await db.from(s.lv).select("*").eq("order_id",s.oid);
    const done=!!data&&data.length>0&&data.every(x=>x.produced>=x.total_required);
    await db.from(s.o).update({status:done?"done":"open"}).eq("id",s.oid);return done;
  }
  const{data}=await db.from(s.sv).select("*").eq("id",s.oid).single();
  const done=!!data&&data.produced>=data.qty_required;
  if(done)await db.from(s.o).update({status:"done"}).eq("id",s.oid);return done;
}
let _fl=false;
async function flushQueue(){
  if(_fl||!navigator.onLine)return 0;_fl=true;let n=0;
  try{
    for(;;){
      const q=Q_.get();if(!q.length)break;const it=q[0];
      let r;try{r=await insertRow(it.table,it.row)}catch(e){r={error:{message:String(e)}}}
      if(r.error&&r.error.code!=="23505"){
        if(isNet(r.error))break;
        let f=[];try{f=JSON.parse(localStorage.getItem("failedQ")||"[]")}catch(e){}
        f.push({...it,err:r.error.message});try{localStorage.setItem("failedQ",JSON.stringify(f))}catch(e){}
        toast("تسجيل اترفض: "+r.error.message,"bad");q.shift();Q_.set(q);continue;
      }
      try{await syncAfter(it)}catch(e){}
      q.shift();Q_.set(q);n++;
    }
  }finally{_fl=false;updateBadge()}
  return n;
}
function updateBadge(){
  const n=Q_.get().length,tb=document.querySelector(".topbar");if(!tb)return;
  let b=document.getElementById("pend");
  if(!n){if(b)b.remove();return}
  if(!b){
    b=document.createElement("button");b.id="pend";b.className="iconbtn";b.style.position="relative";b.setAttribute("aria-label","مزامنة التسجيلات المعلقة");
    b.onclick=async()=>{const k=await flushQueue();toast(k?"اتسجل "+k+" تسجيل":navigator.onLine?"لسه مش قادر يتصل بالسيرفر":"لسه مفيش نت","warn");if(k&&typeof load==="function")load()};
    const rf=tb.querySelector("#rf");rf?rf.before(b):tb.appendChild(b);
  }
  b.className="iconbtn lbl";b.innerHTML=ico("refresh")+`<span>مزامنة</span><em style="position:absolute;top:-4px;inset-inline-end:-2px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:var(--warn);color:#fff;font-size:.7rem;font-style:normal;display:grid;place-items:center">${n}</em>`;
}
async function autoFlush(){
  if(!Q_.get().length)return;
  const n=await flushQueue();
  if(n){toast("اتسجل "+n+" تسجيل كان منتظر");if(typeof load==="function")load()}
}
addEventListener("online",autoFlush);
setInterval(autoFlush,30000);
document.addEventListener("DOMContentLoaded",()=>setTimeout(autoFlush,1500));

/* ===== رابط إعادة تعيين كلمة السر (من إيميل المدير) ===== */
db.auth.onAuthStateChange(ev=>{
  if(ev!=="PASSWORD_RECOVERY")return;
  setTimeout(()=>openModal("اختار كلمة سر جديدة",`<label>كلمة السر الجديدة</label><input id="r_pw" type="password" autocomplete="new-password"><label>تأكيد كلمة السر</label><input id="r_pw2" type="password" autocomplete="new-password">`,async()=>{
    const a=r_pw.value,b=r_pw2.value;
    if(a.length<6){toast("كلمة السر لازم تكون 6 حروف على الأقل");return false}
    if(a!==b){toast("التأكيد مش مطابق");return false}
    const{error}=await db.auth.updateUser({password:a});
    if(error){toast("خطأ: "+error.message);return false}
    toast("تم تغيير كلمة السر");try{history.replaceState(null,"",location.pathname)}catch(e){}
  },"حفظ"),300);
});


/* =====================================================================
   v2 — قوائم منسدلة + إنتاج بدون طلبية + هالك سريع + واتساب
   ===================================================================== */

/* ===== قوائم منسدلة (سهم ▾) لكل خانات الاختيار: صنف / لون / كود / عامل / سبب ===== */
const HIST_SEL="#m-r,#m-pr,#m-n,#m-nt,#m-dn";
// كل الخانات اللي تتحول لقائمة منسدلة (أي خانة عليها data-kind بتتفعّل تلقائيًا، وده بيشمل البحث الشامل)
const COMBO_SEL=NAME_SEL+",#m-w,#m-gt,#m-rn,#m-ph,"+HIST_SEL+",#m-tsc,#m-nwc,input[data-kind]";
const CBX={p:null,inp:null,act:-1};
const cbKind=el=>el.id==="m-w"?"worker":(el.id==="m-gt"||el.id==="m-rn")?"cust":el.id==="m-ph"?"cphone":el.matches(HIST_SEL)?"hist:"+el.id:kindOf(el);
function cbHist(k){try{return JSON.parse(localStorage.getItem("hist_"+k.slice(5))||"[]")}catch(e){return[]}}
function saveHist(root){
  try{root.querySelectorAll("[data-cb^='hist:']").forEach(el=>{
    const v=el.value.trim();if(!v||v.length>60)return;
    const k="hist_"+el.dataset.cb.slice(5);let a=[];try{a=JSON.parse(localStorage.getItem(k)||"[]")}catch(e){}
    a=[v,...a.filter(x=>x!==v)].slice(0,25);localStorage.setItem(k,JSON.stringify(a));
  })}catch(e){}
}
function cbOpts(inp){
  const k=inp.dataset.cb;
  if(k==="worker")return wkSel().map(n=>[n,""]);
  if(k==="cust")return(typeof CUS!=="undefined"?CUS:[]).map(c=>[c.name,c.phone||""]);
  if(k==="cphone")return(typeof CUS!=="undefined"?CUS:[]).filter(c=>c.phone).map(c=>[c.phone,c.name]);
  if(k.startsWith("hist:"))return cbHist(k).map(n=>[n,""]);
  const out=[],seen=new Set();
  ((CAT&&CAT[k])||[]).forEach(n=>{seen.add(n);out.push([n,(CATM[k].get(n)||{}).code||""])});
  (inp._extra||[]).forEach(n=>{if(n&&!seen.has(n)){seen.add(n);out.push([n,""])}});
  return out;
}
function cbEnsure(){
  if(CBX.p)return CBX.p;
  const p=document.createElement("div");p.className="cbl";p.id="cbl";p.hidden=true;p.setAttribute("role","listbox");
  document.body.appendChild(p);
  p.addEventListener("pointerdown",e=>e.preventDefault());
  p.addEventListener("click",e=>{const b=e.target.closest(".cbo");if(b&&CBX.inp)cbPick(CBX.inp,b.dataset.v)});
  return CBX.p=p;
}
function cbPlace(){
  const p=CBX.p,inp=CBX.inp;if(!p||p.hidden||!inp)return;
  if(!inp.isConnected){cbHide();return}
  const r=inp.getBoundingClientRect(),vv=window.visualViewport,vh=vv?vv.height:innerHeight,vt=vv?vv.offsetTop:0;
  const below=vh-(r.bottom-vt),above=r.top-vt,h=Math.min(260,Math.max(120,Math.max(below,above)-16));
  p.style.width=r.width+"px";p.style.left=r.left+"px";p.style.maxHeight=h+"px";
  if(below<170&&above>below){p.style.top="auto";p.style.bottom=(innerHeight-r.top+4)+"px"}
  else{p.style.bottom="auto";p.style.top=(r.bottom+4)+"px"}
}
function cbShow(inp,all){
  const p=cbEnsure();CBX.inp=inp;CBX.act=-1;
  const q=all?"":norm(inp.value);
  let opts=cbOpts(inp);const total=opts.length;
  if(q)opts=opts.filter(o=>norm(o[0]).includes(q)||(o[1]&&norm(o[1]).includes(q))).sort((a,b)=>(norm(a[0]).startsWith(q)?0:1)-(norm(b[0]).startsWith(q)?0:1));
  if(!opts.length){
    if(!all&&q){cbHide();return}
    p.innerHTML='<div class="cbe">'+(total?"مفيش نتائج":"القائمة فاضية — اكتب الاسم وهيتضاف")+"</div>";
  }else{
    p.innerHTML=opts.slice(0,100).map(o=>`<button type="button" class="cbo" role="option" data-v="${esc(o[0])}"><span>${esc(o[0])}</span>${o[1]?`<small>${esc(o[1])}</small>`:""}</button>`).join("")+(opts.length>100?`<div class="cbe">و ${opts.length-100} كمان… اكتب للتصفية</div>`:"");
  }
  p.hidden=false;cbPlace();
  inp.closest(".cbw")?.classList.add("open");
}
function cbHide(){
  if(!CBX.p||CBX.p.hidden)return;
  CBX.p.hidden=true;document.querySelectorAll(".cbw.open").forEach(w=>w.classList.remove("open"));CBX.act=-1;
}
function cbPick(inp,v){
  inp._setting=true;inp.value=v;
  inp.dispatchEvent(new Event("input",{bubbles:true}));inp.dispatchEvent(new Event("change",{bubbles:true}));
  inp._setting=false;cbHide();
  if(inp.dataset.cb==="item"||inp.dataset.cb==="code")cbPreview(inp);
  if(Snd)Snd.play("tap");
}
const _pvC=new Map();
async function cbPreview(inp){
  const k=inp.dataset.cb;if(k!=="item"&&k!=="code")return;
  const w=inp.closest(".cbw");if(!w)return;
  const host=inp.closest(".nr")||w; // صفوف الأكواد: المعاينة تحت الصف كله عشان ما تبوّظش الشبكة
  let box=host.nextElementSibling;if(!box||!box.classList.contains("cbp")||box.dataset.k!==k){box=document.createElement("div");box.className="cbp";box.dataset.k=k;box.hidden=true;host.after(box)}
  const v=inp.value.trim(),m=v&&CATM[k].get(v);
  if(!m||!m.id){box.hidden=true;box.innerHTML="";return}
  try{
    let d=_pvC.get(m.id);
    if(!d){
      const r=await db.from("catalog").select("image,code").eq("id",m.id).maybeSingle();
      if(r.error||!r.data)return;d=r.data;_pvC.set(m.id,d);
    }
    if(inp.value.trim()!==v)return; // المستخدم غيّر الكلمة أثناء التحميل
    const im=safeAv(d.image);if(!im&&!d.code){box.hidden=true;box.innerHTML="";return}
    box.innerHTML=(im?`<img src="${im}" alt="">`:"")+`<span><b>${k==="code"?"كود الرسمة: ":""}${esc(v)}</b>${d.code?`<small>كود الصنف: ${esc(d.code)}</small>`:""}</span>`;
    box.hidden=false;
  }catch(e){}
}
function enhanceCombo(inp){
  if(!inp||inp.dataset.cb||inp.tagName!=="INPUT"||inp.type==="hidden")return;
  inp.dataset.cb=cbKind(inp);
  const lid=inp.getAttribute("list");
  inp._extra=lid?[...document.querySelectorAll("#"+lid+" option")].map(o=>o.value):[];
  inp.removeAttribute("list");inp.setAttribute("autocomplete","off");
  const w=document.createElement("span");w.className="cbw";inp.parentNode.insertBefore(w,inp);w.appendChild(inp);
  const b=document.createElement("button");b.type="button";b.className="cbb";b.tabIndex=-1;b.setAttribute("aria-label","عرض القائمة");
  b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';w.appendChild(b);
  b.addEventListener("pointerdown",e=>e.preventDefault());
  b.addEventListener("click",()=>{
    if(CBX.inp===inp&&CBX.p&&!CBX.p.hidden){cbHide();return}
    catReady().then(()=>cbShow(inp,true));
  });
  inp.addEventListener("focus",()=>{
    const v=inp.value.trim();
    catReady().then(()=>{if(document.activeElement!==inp)return;const ex=cbOpts(inp).some(o=>o[0]===v);cbShow(inp,!v||ex)});
  });
  inp.addEventListener("input",()=>{if(inp._setting)return;catReady().then(()=>cbShow(inp,false))});
  if(inp.dataset.cb==="item"||inp.dataset.cb==="code"){
    let _pt;const pv=()=>{clearTimeout(_pt);_pt=setTimeout(()=>catReady().then(()=>cbPreview(inp)),200)};
    inp.addEventListener("input",pv);inp.addEventListener("change",pv);
    if(inp.value.trim())pv();
  }
  inp.addEventListener("blur",()=>setTimeout(()=>{if(CBX.inp===inp&&document.activeElement!==inp)cbHide()},140));
  inp.addEventListener("keydown",e=>{
    const open=CBX.p&&!CBX.p.hidden&&CBX.inp===inp,os=open?[...CBX.p.querySelectorAll(".cbo")]:[];
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){
      e.preventDefault();if(!open){catReady().then(()=>cbShow(inp,true));return}
      if(!os.length)return;CBX.act=(CBX.act+(e.key==="ArrowDown"?1:-1)+os.length)%os.length;
      os.forEach((o,i)=>o.classList.toggle("act",i===CBX.act));os[CBX.act].scrollIntoView({block:"nearest"});
    }else if(e.key==="Enter"&&open&&CBX.act>=0&&os[CBX.act]){
      e.preventDefault();e.stopPropagation();cbPick(inp,os[CBX.act].dataset.v);
    }else if(e.key==="Escape"&&open){e.stopPropagation();cbHide()}
  });
}
function enhanceAll(root){
  if(!root||!root.querySelectorAll)return;
  root.querySelectorAll(COMBO_SEL).forEach(enhanceCombo);
}
addEventListener("scroll",e=>{if(CBX.p&&!CBX.p.hidden&&!CBX.p.contains(e.target))cbPlace()},true);
addEventListener("resize",cbPlace);
if(window.visualViewport)visualViewport.addEventListener("resize",cbPlace);
document.addEventListener("pointerdown",e=>{if(CBX.p&&!CBX.p.hidden&&!e.target.closest(".cbl,.cbw"))cbHide()},true);
// أي خانة جديدة تتضاف للصفحة (صف لون جديد مثلًا) بتبقى منسدلة تلقائيًا
const _cbInit=()=>{
  enhanceAll(document); // الخانات الموجودة في الصفحة من أول ما تفتح (زي البحث الشامل)
  new MutationObserver(ms=>{
    for(const m of ms)for(const n of m.addedNodes){
      if(n.nodeType!==1)continue;
      if(n.matches&&n.matches(COMBO_SEL))enhanceCombo(n);
      else if(n.querySelector)enhanceAll(n);
    }
  }).observe(document.body,{childList:true,subtree:true});
};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",_cbInit);else _cbInit();

/* ===== واتساب / اتصال ===== */
const WA_CC="20"; // كود الدولة الافتراضي (مصر) للأرقام اللي بتبدأ بـ 0
const waNum=n=>{
  let d=String(n||"").replace(/[^\d+]/g,"");if(!d)return"";
  if(d.startsWith("+"))d=d.slice(1);else if(d.startsWith("00"))d=d.slice(2);else if(d.startsWith("0"))d=WA_CC+d.slice(1);
  return/^\d{8,15}$/.test(d)?d:"";
};
const waLink=(n,msg)=>{const d=waNum(n);return d?"https://wa.me/"+d+(msg?"?text="+encodeURIComponent(msg):""):""};
const telLink=n=>{const d=String(n||"").replace(/[^\d+]/g,"");return d.length>=7?"tel:"+d:""};
const phoneOk=n=>{const d=String(n||"").replace(/[^\d+]/g,"");return d.length>=7&&d.length<=16};
const WA_ICO='<svg viewBox="0 0 24 24" aria-hidden="true" class="wai"><path d="M3 21l1.6-4.7A8.5 8.5 0 1 1 8 19.5z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .7c-.9-.4-1.7-1.2-2.1-2.1l.7-1-1-2z"/></svg>';
const TEL_ICO='<svg viewBox="0 0 24 24" aria-hidden="true" class="wai"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>';
// أزرار اتصال/واتساب لمستخدم (لو عنده أرقام)
function contactBtns(u){
  const w=waLink(u.whatsapp||"",""),t=telLink(u.phone||"");
  return(t?`<a class="cbtn tel" href="${t}" aria-label="اتصال">${TEL_ICO}<span>اتصال</span></a>`:"")+(w?`<a class="cbtn wa" href="${w}" target="_blank" rel="noopener" aria-label="واتساب">${WA_ICO}<span>واتساب</span></a>`:"");
}

/* ===== إنتاج بدون طلبية ===== */
let FREE_T=0;
async function freeTodayQty(sec){
  try{
    const r=await db.from("free_production").select("qty").eq("section",sec).eq("prod_date",today());
    return r.error?0:(r.data||[]).reduce((a,x)=>a+(+x.qty||0),0);
  }catch(e){return 0}
}
const NEED_V2=m=>/free_production|relation|does not exist|schema cache|could not find/i.test(m||"");
/* الزخرفة: لو الصنف + كود الرسمة في «إنتاج بدون طلبية» موجودين في طلبية مفتوحة، بيتسجّل عليها تلقائيًا (الأقدم الأول، والناقصة قبل المكتملة) */
const _dn=v=>String(v||"").replace(/^\s*كود\s*/,"").trim().toLowerCase();
async function decoLoadOpen(){
  try{
    if(!navigator.onLine)return null;
    const[o,l]=await Promise.all([db.from("deco_orders").select("id,item,order_date,status").eq("status","open"),db.from("deco_lines_status").select("id,order_id,code,total_required,produced")]);
    if(o.error||l.error)return null;
    const om=new Map(o.data.map(x=>[x.id,x]));
    return l.data.filter(x=>om.has(x.order_id)).map(x=>({id:x.id,oid:x.order_id,code:_dn(x.code),item:_dn(om.get(x.order_id).item),itemTxt:om.get(x.order_id).item,date:om.get(x.order_id).order_date||"",req:+x.total_required||0,done:+x.produced||0}));
  }catch(e){return null}
}
function decoFind(lines,item,code){
  if(!lines||!_dn(code))return null;
  const m=lines.filter(x=>x.code===_dn(code)&&x.item===_dn(item));
  if(!m.length)return null;
  m.sort((a,b)=>((a.done>=a.req)-(b.done>=b.req))||String(a.date).localeCompare(String(b.date)));
  return m[0];
}
function freeProduction(sec,done){
  if(!SEC_AR[sec]||sec==="repair"||sec==="casting")return;
  const deco=sec==="deco",spr=sec==="spray",lab=deco?"كود الرسمة":"اللون",kind=deco?"code":"color";
  const rowHtml=()=>`<div class="itemblk mrow"><div class="ih"><b class="mn"></b><button type="button" class="rmi" aria-label="حذف الصنف">${ib("trash","حذف")}</button></div>
    <label>الصنف</label><input class="it" placeholder="اسم الصنف" autocomplete="off">
    <div class="two"><div><label>${lab}${spr?" (لون الصنف — اختياري)":" (اختياري)"}</label><input class="sb" data-kind="${kind}" placeholder="${lab}" autocomplete="off"></div>
    <div><label>الكمية</label><input type="number" class="mq2" min="1" inputmode="numeric"></div></div>${spr?'<label>لون الرش</label><input class="msc" data-kind="color" placeholder="لون الرش" autocomplete="off" maxlength="60">':""}</div>`;
  openModal("إنتاج بدون طلبية · "+SEC_AR[sec],
    `${XT(deco)}<div class="hint" style="margin:0 0 6px">سجّل أكتر من صنف مرة واحدة. بيتسجّل في إنتاج القسم وتقاريره من غير ما يتربط بطلبية.</div>
    <button type="button" class="btn ghost sm" id="mclr" hidden style="margin:0 0 6px">مسح المسودة</button>
    <div id="mrows"></div>
    <button type="button" class="btn ghost sm" id="madd" style="margin:6px 0 10px">＋ إضافة صنف آخر</button>
    <label>التاريخ</label><input type="date" id="m-d" value="${today()}">${XF(deco)}`,async()=>{
    const box=document.getElementById("mrows"),els=[...box.querySelectorAll(".mrow")];
    const todo=[];
    for(let i=0;i<els.length;i++){
      const el=els[i],item=el.querySelector(".it").value.trim(),sub=el.querySelector(".sb").value.trim(),qv=el.querySelector(".mq2").value.trim(),sc=spr?el.querySelector(".msc").value.trim():"";
      if(!item&&!sub&&!qv&&!sc)continue;
      if(!item){toast("اكتب اسم الصنف رقم "+(i+1));return false}
      const q=parseInt(qv);
      if(!q||q<1){toast("اكتب كمية صحيحة للصنف: "+item);return false}
      if(spr&&!sc){toast("اكتب لون الرش للصنف: "+item);return false}
      todo.push({el,item,sub,q,sc});
    }
    if(!todo.length){toast("اكتب صنف واحد على الأقل");return false}
    const d=document.getElementById("m-d").value||today(),xf=xfRead();
    const dl=deco?await decoLoadOpen():null;
    todo.forEach(t=>{const m=deco?decoFind(dl,t.item,t.sub):null;if(m){t.link=m;t.over=Math.max(t.q-Math.max(m.req-m.done,0),0);m.done+=t.q}});
    if(!await reviewSave({title:"راجع الإنتاج قبل الحفظ",meta:[["القسم",SEC_AR[sec]],["التاريخ",fmtD(d)],...rvFields(xf)],
      items:todo.map(t=>({title:t.item,rows:[...(t.sub?[[lab,t.sub]]:[]),["الكمية",nf(t.q)],...(t.link?[["هيتسجل على طلبية","مربوط تلقائيًا بطلبية "+t.item+" (كود "+_dn(t.sub)+")"]]:[...(deco&&t.sub?[["ملحوظة","مفيش طلبية مفتوحة بنفس الصنف والكود، هيتسجل بدون طلبية"]]:[])])],warn:t.over?"الكمية أكبر من المتبقي في الطلبية بـ "+nf(t.over)+" — هتتسجل زي ما هي":""})),
      total:todo.reduce((a,t)=>a+t.q,0)}))return false;
    let ok=0,off=0,linked=0,over=0;const bad=[];
    for(const t of todo){
      const id=uuid();
      if(t.link){ // مربوط تلقائيًا بطلبية زخرفة
        const lrow={line_id:t.link.id,qty:t.q,prod_date:d,client_id:id,...xf},sync={lv:"deco_lines_status",o:"deco_orders",oid:t.link.oid};
        let lr;try{lr=await insertRow("deco_production",lrow)}catch(e){lr={error:{message:String(e)}}}
        if(lr.error&&isNet(lr.error)){Q_.add({id,table:"deco_production",row:lrow,sec:"deco",rid:t.link.id,qty:t.q,txt:t.item+" · كود "+t.sub,sync});updateBadge();off++;ok++;t.el.remove();continue}
        if(lr.error){bad.push(t.item+": "+lr.error.message);continue}
        try{await syncAfter({sync})}catch(e){}
        linked++;if(t.over)over++;ok++;t.el.remove();continue;
      }
      const row={section:sec,item:t.item,sub:t.sub||null,qty:t.q,prod_date:d,client_id:id,...xf,...(t.sc?{spray_color:t.sc}:{})};
      let res;try{res=await insertRow("free_production",row)}catch(e){res={error:{message:String(e)}}}
      if(res.error&&isNet(res.error)){
        Q_.add({id,table:"free_production",row,sec,rid:"free",qty:t.q,txt:t.item+(t.sub?" · "+t.sub:"")+" (بدون طلبية)"});updateBadge();
        off++;ok++;t.el.remove();continue;
      }
      if(res.error){bad.push(NEED_V2(res.error.message)?"لازم تشغّل ملف setup_v2.sql في Supabase الأول":t.item+": "+res.error.message);continue}
      ok++;t.el.remove();
    }
    if(ok&&done)await done();
    // اللي اتسجل اتشال من الشاشة؛ اللي فشل بس فاضل عشان تعيد المحاولة من غير تكرار
    if(bad.length){if(window._saveFreeDraft)window._saveFreeDraft();toast((ok?"اتسجل "+ok+" وفشل "+bad.length+" — ":"")+bad[0],"bad");renum();return false}
    if(window._clearFreeDraft)window._clearFreeDraft();
    toast(off?"مفيش نت: اتحفظ "+ok+" صنف على الجهاز وهيتسجلوا لما النت يرجع":"تم تسجيل "+ok+" صنف"+(linked?" — "+linked+" منهم اتربط بطلبية تلقائيًا":"")+(over?" — تنبيه: "+over+" أعلى من المتبقي":""),off||over?"warn":undefined);
  },"تسجيل الكل");
  const box=document.getElementById("mrows");
  const renum=()=>{const r=[...box.querySelectorAll(".mrow")];r.forEach((e,i)=>{e.querySelector(".mn").textContent="صنف "+(i+1);e.querySelector(".rmi").hidden=r.length<2})};
  const add=(focus)=>{
    box.insertAdjacentHTML("beforeend",rowHtml());
    const el=box.lastElementChild;enhanceAll(el);renum();
    el.querySelector(".rmi").onclick=()=>{el.remove();renum()};
    // Enter: ينقل للحقل اللي بعده، ومن الكمية في آخر صنف يفتح صنف جديد (من غير ما يحفظ بالغلط)
    el.addEventListener("keydown",e=>{
      if(e.key!=="Enter"||e.target.tagName!=="INPUT"||e.defaultPrevented)return;
      e.preventDefault();e.stopPropagation();
      const f=[...el.querySelectorAll("input:not([type=hidden])")],i=f.indexOf(e.target);
      if(i>=0&&i<f.length-1)f[i+1].focus();
      else if(el===box.lastElementChild)add(true);
      else{const n=el.nextElementSibling;if(n)n.querySelector(".it").focus()}
    });
    if(focus){el.querySelector(".it").focus();el.scrollIntoView({block:"nearest",behavior:"smooth"})}
  };
  // مسودة: بتتحفظ أول بأول وبترجع لو الصفحة اتقفلت أو النت قطع (24 ساعة)
  const DK="draft_free_"+sec,modal=document.getElementById("mrows").closest(".modal");
  const snap=()=>[...box.querySelectorAll(".mrow")].map(el=>({i:el.querySelector(".it").value,s:el.querySelector(".sb").value,q:el.querySelector(".mq2").value,c:spr?el.querySelector(".msc").value:""}));
  const XID={d:"m-d",w:"m-w",n:"m-n",g:"m-ds"},snapX=()=>{const o={};for(const k in XID){const e=document.getElementById(XID[k]);if(e)o[k]=e.value}return o};
  const saveDraft=()=>{try{const rows=snap().filter(r=>r.i||r.s||r.q||r.c);if(rows.length)localStorage.setItem(DK,JSON.stringify({at:Date.now(),rows,x:snapX()}));else localStorage.removeItem(DK)}catch(e){}};
  let draft=null;try{draft=JSON.parse(localStorage.getItem(DK))}catch(e){}
  if(draft&&Date.now()-draft.at<864e5&&draft.rows&&draft.rows.length){
    draft.rows.forEach((r,n)=>{if(n>0||!box.querySelector(".mrow"))add(false);const el=box.lastElementChild;el.querySelector(".it").value=r.i;el.querySelector(".sb").value=r.s;el.querySelector(".mq2").value=r.q;if(spr&&r.c)el.querySelector(".msc").value=r.c});
    if(draft.x)for(const k in XID){const e=document.getElementById(XID[k]);if(e&&draft.x[k])e.value=draft.x[k]}
    toast("رجّعنا آخر مسودة اتكتبت");const cb=document.getElementById("mclr");if(cb){cb.hidden=false;cb.onclick=()=>{try{localStorage.removeItem(DK)}catch(e){}box.innerHTML="";add(true);cb.hidden=true;toast("اتمسحت المسودة")}}
  }else add(true);
  modal.addEventListener("input",saveDraft);modal.addEventListener("click",e=>{if(e.target.closest(".rmi"))setTimeout(saveDraft,0)});
  window._clearFreeDraft=()=>{try{localStorage.removeItem(DK)}catch(e){}};window._saveFreeDraft=saveDraft;
  document.getElementById("madd").onclick=()=>add(true);
}
/* ===== مراجعة التسجيل قبل الحفظ (تأكيد) ===== */
const remAfter=(rem,q)=>q>rem?"0 (زيادة "+nf(q-rem)+")":nf(rem-q);
const overWarn=(rem,q)=>q>rem?"الكمية أكبر من المتبقي ("+nf(rem)+") بـ "+nf(q-rem)+" — هتتسجل زي ما هي":"";
const overToast=(n,x)=>toast("تم التسجيل — تنبيه: "+(n>1?n+" بنود":"الكمية")+" أعلى من المتبقي"+(x?" بـ "+nf(x):""),"warn");
const RVX={worker:"العامل",design:"الرسمة",note:"ملاحظة",spray_color:"لون الرش"};
const rvFields=o=>Object.keys(RVX).filter(k=>o&&o[k]).map(k=>[RVX[k],o[k]]);
function reviewSave({title="راجع التسجيل قبل الحفظ",meta=[],items=[],total=null,totalLabel="إجمالي الكمية"}){
  return new Promise(res=>{
    const d=document.createElement("div");d.className="ov";d.style.zIndex=70;
    const row=r=>`<div class="rvr"><span>${esc(String(r[0]))}</span><b>${esc(String(r[1]))}</b></div>`;
    d.innerHTML=`<div class="modal rv" role="dialog" aria-modal="true"><h3 class="ibt">${ui("eye")}<span>${esc(title)}</span></h3>
      <div class="hint" style="margin:0 0 8px">اتأكد إن البيانات صح، وبعدها اضغط تأكيد عشان يتحفظ.</div>
      ${meta.length?`<div class="rvm">${meta.map(row).join("")}</div>`:""}
      ${items.map((it,i)=>`<div class="rvi">${it.title?`<div class="rvt">${items.length>1?(i+1)+". ":""}${esc(it.title)}</div>`:""}${it.rows.map(row).join("")}${it.warn?`<div class="rvw ibt">${ui("alert")}<span>${esc(it.warn)}</span></div>`:""}</div>`).join("")}
      ${total!==null?`<div class="rvtot"><span>${esc(totalLabel)}</span><b>${nf(total)}</b></div>`:""}
      <div class="row"><button class="btn" id="rv-ok" type="button">${ib("check","تأكيد وحفظ")}</button><button class="btn ghost" id="rv-no" type="button">${ib("edit","رجوع وتعديل")}</button></div></div>`;
    document.body.appendChild(d);
    const end=v=>{d.remove();document.removeEventListener("keydown",kd,true);res(v)};
    const kd=e=>{if(e.key==="Escape"){e.stopPropagation();end(false)}};
    document.addEventListener("keydown",kd,true);
    d.onclick=e=>{if(e.target===d||e.target.closest("#rv-no"))end(false);else if(e.target.closest("#rv-ok"))end(true)};
    try{d.querySelector("#rv-ok").focus({preventScroll:true})}catch(e){}
  });
}
/* ===== الهالك: السليم بيتاخد من إنتاج الجليز (الصنف + اليوم) والهالك بيتكتب يدويًا ===== */
async function glazeProducedByItem(day){
  const m=new Map(),add=(k,v)=>{k=String(k||"").trim();if(k)m.set(k,(m.get(k)||0)+(+v||0))};
  try{
    const[p,f]=await Promise.all([db.from("glaze_production").select("line_id,qty").eq("prod_date",day),db.from("free_production").select("item,qty").eq("section","glaze").eq("prod_date",day)]);
    const pr=p.data||[],lids=[...new Set(pr.map(e=>e.line_id))];
    if(lids.length){
      const l=await db.from("glaze_order_lines").select("id,order_id").in("id",lids),oids=[...new Set((l.data||[]).map(x=>x.order_id))];
      const o=oids.length?await db.from("glaze_orders").select("id,item").in("id",oids):{data:[]};
      const lm=new Map((l.data||[]).map(x=>[x.id,x.order_id])),om=new Map((o.data||[]).map(x=>[x.id,x.item]));
      pr.forEach(e=>add(om.get(lm.get(e.line_id)),e.qty));
    }
    (f.data||[]).forEach(e=>add(e.item,e.qty));
  }catch(e){}
  return m;
}
function wireWasteGood(upd,keepFirst){
  const it=document.getElementById("m-item"),d=document.getElementById("m-d"),g=document.getElementById("m-g");
  if(!it||!d||!g)return;
  const hint=document.createElement("div");hint.className="hint";hint.id="m-gh";g.parentElement.appendChild(hint);
  let cache={d:null,m:new Map()},seq=0,first=!!keepFirst;
  const run=async()=>{
    const day=d.value||today(),my=++seq;
    if(cache.d!==day){const m=await glazeProducedByItem(day);if(my!==seq)return;cache={d:day,m}}
    const dl=document.getElementById("m-items");
    if(dl){const have=new Set([...dl.options].map(o=>o.value));cache.m.forEach((v,k)=>{if(!have.has(k)){const o=document.createElement("option");o.value=k;dl.prepend(o)}})}
    const item=it.value.trim(),v=item?cache.m.get(item):0;
    if(first){first=false;if(v>0)hint.textContent="إنتاج الجليز للصنف ده في اليوم ده: "+nf(v);return}
    if(v>0){g.value=v;g.readOnly=true;hint.textContent="السليم من إنتاج الجليز في اليوم ده: "+nf(v)}
    else{g.readOnly=false;hint.textContent=item?"مفيش إنتاج جليز مسجل للصنف ده في اليوم ده — اكتب السليم يدويًا":""}
    upd();
  };
  it.addEventListener("input",run);it.addEventListener("change",run);d.addEventListener("change",run);
  run();
}
/* ===== تسجيل هالك سريع (جليز) — من غير طلبية ===== */
function quickWaste(done){
  openModal("تسجيل هالك · جليز",
    `<label>الصنف</label><input id="m-item" list="m-items" placeholder="اسم الصنف" autocomplete="off"><datalist id="m-items"></datalist>
    <div class="two"><div><label>الكمية السليمة</label><input type="number" id="m-g" min="0" inputmode="numeric"></div><div><label>الكمية الهالكة</label><input type="number" id="m-q" min="0" inputmode="numeric"></div></div>
    <div class="nums" id="m-pct"></div>
    <label>التاريخ</label><input type="date" id="m-d" value="${today()}">
    <label>السبب (اختياري)</label><input id="m-r" autocomplete="off">`,async()=>{
    const item=document.getElementById("m-item").value.trim(),g=parseInt(document.getElementById("m-g").value)||0,q=parseInt(document.getElementById("m-q").value)||0;
    if(!item){toast("اكتب الصنف");return false}
    if(g+q<=0){toast("اكتب الكمية السليمة والهالكة");return false}
    const wd=document.getElementById("m-d").value||today(),wr=document.getElementById("m-r").value.trim();
    if(!await reviewSave({title:"راجع الهالك قبل الحفظ",meta:[["التاريخ",fmtD(wd)]],items:[{title:item,rows:[["الكمية السليمة",nf(g)],["الكمية الهالكة",nf(q)],["نسبة الهالك",(q/(g+q)*100).toFixed(1)+"%"],...(wr?[["السبب",wr]]:[])]}]}))return false;
    const{error}=await db.from("glaze_waste").insert({item,waste_date:wd,good_qty:g,qty:q,reason:wr||null});
    if(error){toast(isNet(error)?"مفيش نت: الهالك محتاج اتصال عشان يتسجل":"خطأ: "+error.message,"bad");return false}
    toast("تم تسجيل الهالك");if(done)await done();
  });
  const upd=()=>{const g=parseInt(document.getElementById("m-g").value)||0,q=parseInt(document.getElementById("m-q").value)||0;document.getElementById("m-pct").innerHTML=g+q>0?`الإجمالي <b>${g+q}</b> · نسبة الهالك <b>${(q/(g+q)*100).toFixed(1)}%</b>`:""};
  document.getElementById("m-g").oninput=upd;document.getElementById("m-q").oninput=upd;
  wireWasteGood(upd,false);
}


/* ===== تحديث تلقائي: يقارن رقم الإصدار على GitHub بالإصدار الشغال ===== */
(function(){
  if(typeof APP_VERSION==="undefined"||!/^https?:$/.test(location.protocol))return;
  let busy=false;
  const typing=()=>{const a=document.activeElement;return a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)};
  async function check(){
    if(busy||!navigator.onLine||typing())return;
    busy=true;
    try{
      const r=await fetch("config.js?_chk="+Date.now(),{cache:"no-store"});
      const m=(await r.text()).match(/APP_VERSION\s*=\s*"([^"]+)"/);
      if(!m||m[1]===APP_VERSION)return;
      let tried="";try{tried=sessionStorage.getItem("upd_try")||""}catch(e){}
      if(tried===m[1])return; // منع التكرار لو التحديث ماخلصش
      try{sessionStorage.setItem("upd_try",m[1])}catch(e){}
      if(typeof toast==="function")toast("جاري تحديث البرنامج للنسخة "+m[1]+"…");
      try{
        for(const k of await caches.keys())if(k!=="mas-lib")await caches.delete(k);
        try{const g=await navigator.serviceWorker.getRegistration();if(g)await g.update()}catch(e){}
      }catch(e){}
      setTimeout(()=>location.reload(),1200);
    }catch(e){}finally{busy=false}
  }
  addEventListener("load",()=>setTimeout(check,1500));
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")check()});
  setInterval(check,5*60*1000);
})();


/* ===== الإشعارات (Web Push) ===== */
const PUSH_OK=()=>"serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window&&typeof VAPID_PUBLIC!=="undefined"&&!!VAPID_PUBLIC;
const _b64=s=>{const p="=".repeat((4-s.length%4)%4),r=atob((s+p).replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from([...r].map(c=>c.charCodeAt(0)))};
async function pushSub(reg){
  let sub=await reg.pushManager.getSubscription();
  if(sub)return sub;
  try{return await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:_b64(VAPID_PUBLIC)})}
  catch(e){const o=await reg.pushManager.getSubscription();if(o){await o.unsubscribe();return reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:_b64(VAPID_PUBLIC)})}throw e}
}
async function pushSave(sub){
  const o=sub.toJSON();
  const{error}=await db.rpc("save_push_sub",{p_endpoint:o.endpoint,p_p256dh:o.keys.p256dh,p_auth:o.keys.auth,p_ua:navigator.userAgent});
  return !error;
}
async function pushEnable(){
  if(!PUSH_OK())throw new Error("unsupported");
  if(await Notification.requestPermission()!=="granted")throw new Error("denied");
  const reg=await navigator.serviceWorker.ready;
  const sub=await pushSub(reg);
  if(!await pushSave(sub))throw new Error("save");
  try{const{data:{session}}=await db.auth.getSession();localStorage.setItem("push_uid",session.user.id);localStorage.setItem("push_sync",String(Date.now()))}catch(e){}
  return true;
}
async function pushDisable(){
  try{
    const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();
    if(sub){await db.rpc("delete_push_sub",{p_endpoint:sub.endpoint});await sub.unsubscribe()}
    localStorage.removeItem("push_uid");
  }catch(e){}
}
async function pushState(){
  if(!PUSH_OK())return "unsupported";
  if(Notification.permission==="denied")return "denied";
  try{const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();return sub&&Notification.permission==="granted"?"on":"off"}catch(e){return "off"}
}
// تسجيل الخروج: نشيل اشتراك الجهاز من السيرفر عشان المستخدم اللي خرج ما يجيلهوش إشعارات
(function(){
  try{
    const so=db.auth.signOut.bind(db.auth);
    db.auth.signOut=async(...a)=>{
      try{
        if(PUSH_OK()&&Notification.permission==="granted"){
          const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();
          if(sub)await db.rpc("delete_push_sub",{p_endpoint:sub.endpoint});
        }
        localStorage.removeItem("push_uid");
      }catch(e){}
      try{await masCacheClear()}catch(e){}
      return so(...a);
    };
  }catch(e){}
})();
// تجديد التسجيل بهدوء (مرة كل يوم، أو فورًا لو اتغير المستخدم على نفس الجهاز)
addEventListener("load",()=>setTimeout(async()=>{
  try{
    if(!PUSH_OK()||Notification.permission!=="granted")return;
    const{data:{session}}=await db.auth.getSession();if(!session)return;
    const same=localStorage.getItem("push_uid")===session.user.id,last=+localStorage.getItem("push_sync")||0;
    const reg=await navigator.serviceWorker.ready;
    const had=await reg.pushManager.getSubscription();
    if(had&&same&&Date.now()-last<864e5)return;
    const sub=await pushSub(reg);
    if(await pushSave(sub)){localStorage.setItem("push_uid",session.user.id);localStorage.setItem("push_sync",String(Date.now()))}
  }catch(e){}
},4000));

/* ---------- الطلبية كيان واحد: مجموعة أصناف (order_groups) ---------- */
// بترجّع id الطلبية لو (فيه أكتر من صنف أو اسم) ولو الجدول لسه ما اتعملش ترجّع null والإضافة تكمّل زي الأول
async function makeGroup(title,n){
  title=(title||"").trim();
  if(n<2&&!title)return null;
  try{const{data,error}=await db.from("order_groups").insert({title:title||null}).select("id").single();return error?null:data.id}catch(e){return null}
}
async function dropGroup(gid){if(gid)try{await db.from("order_groups").delete().eq("id",gid)}catch(e){}}
const withGid=(row,gid)=>gid?{...row,group_id:gid}:row;
/* عرض الطلبية الواحدة بأصنافها: كارت أب (الاسم + الإجمالي) وتحته كارت لكل صنف */
let GT=new Map();
async function loadGroupTitles(){
  try{const{data,error}=await db.from("order_groups").select("id,title");if(error||!data)return GT;GT=new Map(data.map(x=>[x.id,(x.title||"").trim()]))}catch(e){}
  return GT;
}
const ordCount=l=>new Set(l.map(o=>o.group_id?"g"+o.group_id:"o"+o.id)).size;
function groupHtml(list,cardFn,numFn,table){
  const seen=new Set(),out=[];
  list.forEach(o=>{
    const g=o.group_id;
    if(!g){out.push(cardFn(o));return}
    if(seen.has(g))return;seen.add(g);
    const m=list.filter(x=>x.group_id===g);
    if(m.length<2){out.push(cardFn(o));return}
    const nm=m.map(numFn),req=nm.reduce((a,x)=>a+x.req,0),done=nm.reduce((a,x)=>a+Math.min(x.done,x.req),0),rem=Math.max(req-done,0),pct=req?Math.min(100,Math.round(done/req*100)):0;
    const open=m.some(x=>x.status==="open"),late=m.some(lateOrder),title=GT.get(g)||"",names=[...new Set(m.map(x=>x.item))].map(esc).join("، ");
    const dues=m.map(x=>x.due_date).filter(Boolean).sort();
    out.push(`<div class="card ogrp"><div class="top"><b>${title?esc(title):names}</b><span><span class="tag">${m.length} أصناف</span> ${late?'<span class="tag late">متأخرة</span> ':""}<span class="tag ${open?"":"ok"}">${open?"مفتوحة":"مكتملة"}</span></span></div>
      <div class="nums">${title?names+" · ":""}${dues.length&&open?"أقرب تسليم: <b>"+fmtD(dues[0])+"</b> · ":""}الإجمالي: مطلوب <b>${req}</b> · تم <b>${done}</b> · متبقي <b>${rem}</b></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      ${m.map(cardFn).join("")}
      <div class="row"><button class="btn ghost sm" onclick="delGroup('${g}','${table}')">حذف الطلبية كلها</button></div></div>`);
  });
  return out.join("");
}
async function delGroup(gid,table){
  if(!await ask("حذف الطلبية كلها بكل أصنافها وبياناتها؟"))return;
  const{data,error}=await db.from(table).delete().eq("group_id",gid).select();
  if(error||!data.length){toast(error?"خطأ: "+error.message:"لم يتم الحذف، راجع الصلاحيات");return}
  await dropGroup(gid);
  if(typeof load==="function")await load();toast("تم حذف الطلبية كلها");
}
const GTITLE_HTML='<label>اسم الطلبية / العميل (اختياري)</label><input id="m-gt" placeholder="مثال: طلبية أحمد" maxlength="80">';

/* ===== أيقونات التبويبات الفرعية (خطية وبسيطة، بتتضاف تلقائيًا لأي .tabs) ===== */
const TIC={
  open:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  done:'<circle cx="12" cy="12" r="9"/><path d="m8 12.2 2.8 2.8L16 9.5"/>',
  waste:'<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="m6 7 1 13h10l1-13"/><path d="M10 11v5M14 11v5"/>',
  chart:'<path d="M4 20h16"/><path d="M7 16v-5M12 16V6M17 16v-8"/>',
  users:'<path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="8" r="3.5"/><path d="M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3M15.5 4.7a3.5 3.5 0 0 1 0 6.6"/>',
  log:'<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/><path d="M12 8v4.2l2.8 1.8"/>',
  db:'<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13"/><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
  cal:'<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10.5h17"/>',
  orders:'<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4h6v3H9z"/><path d="M9 12h6M9 16h4"/>',
  layers:'<path d="m12 3.5 8.5 4.7-8.5 4.8-8.5-4.8z"/><path d="m3.5 12.5 8.5 4.8 8.5-4.8"/>',
  box:'<path d="M20.5 7.8v8.4l-8.5 4.8-8.5-4.8V7.8L12 3z"/><path d="m3.8 7.9 8.2 4.7 8.2-4.7M12 21v-8.4"/>',
  drop:'<path d="M12 3.5s6 6 6 10.2a6 6 0 0 1-12 0C6 9.5 12 3.5 12 3.5z"/>',
  hash:'<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
  grid:'<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
  palette:'<path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.6 0-.5-.2-.9-.5-1.2a1.7 1.7 0 0 1 1.2-2.9H16a5 5 0 0 0 5-5c0-4-4-7.3-9-7.3z"/><circle cx="7.8" cy="11" r=".8"/><circle cx="10.5" cy="7.2" r=".8"/><circle cx="15" cy="7.8" r=".8"/>',
  spray:'<rect x="7" y="10" width="10" height="11" rx="2.2"/><path d="M10 10V7h4v3M12 3.5V7"/><path d="M18 5h.01M20.5 8h.01M19.5 11.5h.01"/>',
  wrench:'<path d="M14.5 6.5a4 4 0 0 0 5 5l-9 9a2.1 2.1 0 0 1-3-3l9-9a4 4 0 0 0-2-2z"/>',
  cast:'<path d="M8 2.5h8"/><path d="M9.5 2.5v3.6c0 1.3-4 2.4-4 7.4a6.5 6.5 0 0 0 13 0c0-5-4-6.1-4-7.4V2.5"/><path d="M6 12.5h12"/>'
};
function tabIconKey(b){
  const t=b.textContent.trim(),k=[b.id,b.dataset.t,b.dataset.s,b.dataset.k].join(" ");
  const has=(re)=>re.test(k)||re.test(t);
  if(has(/repair|تصليح/))return"wrench";
  if(has(/casting|الصب/)&&!has(/سجل الصب/))return"cast";
  if(has(/مفتوح|\bopen\b/))return"open";
  if(has(/مكتمل|\bdone\b/))return"done";
  if(has(/هالك|\brep\b/))return"waste";
  if(has(/تقارير|\bprod\b/))return"chart";
  if(has(/عمال|\bwk\b/))return"users";
  if(has(/سجل|السجل|\blog\b/))return"log";
  if(has(/نسخ|\bbk\b/))return"db";
  if(has(/اليومي|\bdaily\b/))return"cal";
  if(has(/الطلبيات|\borders\b/))return"orders";
  if(has(/العام|\bgeneral\b/))return"layers";
  if(has(/الأصناف|\bitem\b/))return"box";
  if(has(/الألوان|\bcolor\b/))return"drop";
  if(has(/أكواد|\bcode\b/))return"hash";
  if(has(/جليز|\bglaze\b/))return"drop";
  if(has(/زخرفة|\bdeco\b/))return"palette";
  if(/\bspray\b/.test(k)||t==="رش")return"spray";
  if(t==="الكل")return"grid";
  return"";
}
function tabsScroll(){
  document.querySelectorAll(".tabs").forEach(t=>{
    if(!t.dataset.drag){
      t.dataset.drag=1;let x0=0,s0=0,down=false,moved=false;
      t.addEventListener("pointerdown",e=>{if(e.pointerType!=="mouse")return;down=true;moved=false;x0=e.clientX;s0=t.scrollLeft});
      window.addEventListener("pointermove",e=>{if(!down)return;const d=e.clientX-x0;if(Math.abs(d)>4)moved=true;t.scrollLeft=s0-d});
      window.addEventListener("pointerup",()=>{down=false});
      t.addEventListener("click",e=>{if(moved){e.stopPropagation();e.preventDefault();moved=false}},true);
    }
    const on=t.querySelector("button.on");
    if(on&&t.scrollWidth>t.clientWidth+2&&t._on!==on){t._on=on;
      const r=on.getBoundingClientRect(),c=t.getBoundingClientRect();
      t.scrollTo({left:t.scrollLeft+(r.left+r.width/2)-(c.left+c.width/2),behavior:"smooth"})}
  });
}
function decorateTabs(){
  tabsScroll();
  document.querySelectorAll(".tabs button").forEach(b=>{
    if(b.querySelector("svg"))return;
    const k=tabIconKey(b);if(!k||!TIC[k])return;
    b.insertAdjacentHTML("afterbegin",`<svg class="tic" viewBox="0 0 24 24" aria-hidden="true">${TIC[k]}</svg>`);
    b.classList.add("has-tic");
  });
}
(()=>{let q=0;const go=()=>{if(q)return;q=requestAnimationFrame(()=>{q=0;try{decorateTabs()}catch(e){}})};
  document.addEventListener("DOMContentLoaded",()=>{go();new MutationObserver(go).observe(document.body,{childList:true,subtree:true})});})();
