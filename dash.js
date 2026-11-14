// لوحة التحكم (قراءة فقط): مؤشرات اكتمال دائرية + الإنتاج مقابل الهالك
const RING_SRC={
  "glaze.html":{o:"glaze_orders",l:"glaze_lines_status",req:"total_required",ok:"produced"},
  "decoration.html":{o:"deco_orders",l:"deco_lines_status",req:"total_required",ok:"produced"},
  "spray.html":{s:"spray_status",req:"qty_required",ok:"produced"},
  "casting.html":{s:"casting_status",req:"qty_required",ok:"produced"}};
async function pgAll(t,cols,f){
  const out=[];
  for(let i=0;;i+=1000){
    let q=db.from(t).select(cols);if(f)q=f(q);
    const{data,error}=await q.order("id").range(i,i+999);
    if(error)throw error;out.push(...data);if(data.length<1000)break;
  }
  return out;
}
const ringSVG=(pct,color,track)=>`<svg class="ring" viewBox="0 0 64 64" role="img" aria-label="${Math.round(pct)}%"><circle class="bg" cx="32" cy="32" r="26" pathLength="100"${track?` style="stroke:${track}"`:""}/>${pct>0?`<circle class="fg" cx="32" cy="32" r="26" pathLength="100" style="--p:${Math.min(100,pct)};stroke:${color}"/>`:""}</svg>`;
async function sectionProgress(s){
  const c=RING_SRC[s[0]];let req=0,ok=0,n=0;
  if(c.s){
    (await pgAll(c.s,"id,status,"+c.req+","+c.ok,q=>q.eq("status","open"))).forEach(r=>{req+=+r[c.req]||0;ok+=Math.min(+r[c.ok]||0,+r[c.req]||0);n++});
  }else{
    const [o,l]=await Promise.all([pgAll(c.o,"id,status",q=>q.eq("status","open")),pgAll(c.l,"id,order_id,"+c.req+","+c.ok)]);
    const open=new Set(o.map(x=>x.id));
    l.filter(r=>open.has(r.order_id)).forEach(r=>{req+=+r[c.req]||0;ok+=Math.min(+r[c.ok]||0,+r[c.req]||0);n++});
  }
  return{s,req,ok,n,pct:req>0?Math.round(ok/req*100):0};
}
async function wasteCard(T){
  const rows=await pgAll("glaze_waste","id,waste_date,good_qty,qty",q=>q.gte("waste_date",addDays(T,-13)));
  const split=addDays(T,-6),sum=(a)=>a.reduce((x,r)=>[x[0]+(+r.good_qty||0),x[1]+(+r.qty||0)],[0,0]);
  const [g,w]=sum(rows.filter(r=>String(r.waste_date).slice(0,10)>=split)),[pg,pw]=sum(rows.filter(r=>String(r.waste_date).slice(0,10)<split));
  const rate=g+w>0?w/(g+w)*100:0,prev=pg+pw>0?pw/(pg+pw)*100:null;
  if(g+w<=0)return`<div class="card"><div class="top"><b>الإنتاج مقابل الهالك (جليز)</b></div><div class="empty">مفيش بيانات هالك الأسبوع ده</div></div>`;
  let dl="";
  if(prev!==null){const d=rate-prev;dl=`<div class="wd ${d<=0?"good":"bad"}">${d<=0?"▼":"▲"} ${Math.abs(d).toFixed(1)} نقطة عن الأسبوع اللي قبله</div>`}
  return`<div class="card"><div class="top"><b>الإنتاج مقابل الهالك (جليز)</b><span class="tag">آخر 7 أيام</span></div>
    <div class="wrow"><div class="rw big">${ringSVG(rate,"var(--bad)","var(--ok)")}<div class="pc"><b>${rate.toFixed(1)}%</b><small>هالك</small></div></div>
    <div class="wl"><div><i style="background:var(--ok)"></i>سليم <b>${nf(g)}</b></div><div><i style="background:var(--bad)"></i>هالك <b>${nf(w)}</b></div>${dl}</div></div></div>`;
}
// تحليل الهالك (جليز): أكتر الأصناف والأسباب هالكًا آخر 30 يوم + تحذير لو النسبة عالية أو بتزيد
async function wasteInsights(T){
  const rows=await pgAll("glaze_waste","id,waste_date,good_qty,qty,item,reason",q=>q.gte("waste_date",addDays(T,-29)));
  if(!rows.length)return"";
  const grp=(keyf)=>{const m=new Map();rows.forEach(r=>{const k=keyf(r);if(!k)return;const x=m.get(k)||[0,0];x[0]+=+r.qty||0;x[1]+=(+r.good_qty||0)+(+r.qty||0);m.set(k,x)});return[...m].filter(e=>e[1][0]>0).sort((a,b)=>b[1][0]-a[1][0]).slice(0,3)};
  const items=grp(r=>(r.item||"").trim()||"بدون صنف").filter(e=>e[1][1]>=20),reasons=grp(r=>(r.reason||"").trim());
  const split=addDays(T,-6),pick=f=>rows.filter(r=>f(String(r.waste_date).slice(0,10)));
  const rt=a=>{const w=a.reduce((x,r)=>x+(+r.qty||0),0),t=a.reduce((x,r)=>x+(+r.qty||0)+(+r.good_qty||0),0);return t>=20?w/t*100:null};
  const now=rt(pick(d=>d>=split)),prev=rt(pick(d=>d<split));
  const warn=now!==null&&(now>=5||(prev!==null&&now-prev>=2));
  if(!items.length&&!reasons.length&&!warn)return"";
  const li=(a,fmt)=>a.map(([k,[w,t]])=>`<div class="line" style="display:flex;justify-content:space-between;gap:8px"><span>${esc(k)}</span><span class="nums">${fmt(w,t)}</span></div>`).join("");
  return`<div class="card"${warn?' style="border-color:var(--warn)"':""}><div class="top"><b>تحليل الهالك (جليز)</b><span class="tag">آخر 30 يوم</span></div>
    ${warn?`<div class="nums ibt" style="color:var(--bad);margin-bottom:6px">${ui("alert")}<span>نسبة الهالك الأسبوع ده ${now.toFixed(1)}%${prev!==null?` (كانت ${prev.toFixed(1)}%)`:""}</span></div>`:""}
    ${items.length?`<div class="nums" style="margin:6px 0 2px">أكتر الأصناف هالكًا</div>${li(items,(w,t)=>`${nf(w)} (${(w/t*100).toFixed(1)}%)`)}`:""}
    ${reasons.length?`<div class="nums" style="margin:8px 0 2px">أكتر الأسباب</div>${li(reasons,w=>nf(w))}`:""}</div>`;
}
async function dash2(){
  const hx=document.getElementById("hx");if(!hx)return;
  const T=today(),vs=visibleSections().filter(s=>RING_SRC[s[0]]);
  if(!vs.length)return;
  if(!hx.children.length)hx.innerHTML='<div class="card skc"><i class="sk" style="height:96px"></i></div>';
  const [P,W]=await Promise.all([
    Promise.allSettled(vs.map(sectionProgress)),
    vs.some(s=>s[0]==="glaze.html")?Promise.all([wasteCard(T).catch(()=>""),wasteInsights(T).catch(()=>"")]).then(a=>a.join("")):Promise.resolve("")]);
  const ok=P.filter(p=>p.status==="fulfilled").map(p=>p.value);
  let h="";
  if(ok.length)h+=`<div class="card"><div class="top"><b>اكتمال الطلبيات المفتوحة</b></div><div class="rings">${ok.map(p=>`<div class="rg"><div class="rw">${ringSVG(p.pct,p.s[3])}<div class="pc"><b class="pv" data-to="${p.pct}">0</b></div></div><span>${esc(p.s[1])}</span><small>${p.n?`${nf(p.ok)} من ${nf(p.req)}`:"مفيش طلبيات"}</small></div>`).join("")}</div></div>`;
  hx.innerHTML=h+W;
  hx.querySelectorAll(".pv").forEach(e=>{try{countUp(e,+e.dataset.to)}catch(x){e.textContent=e.dataset.to}});
}
