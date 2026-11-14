/* reports.js — محرك التقارير المشترك (يعتمد على common.js و config.js)
   v2.6: ملاحظات ذكية، توقّع الإنجاز، فلاتر (صنف/لون/عامل)، لون الرش، وطباعة ذكية باختيار الأقسام */
const Reports=(()=>{
const APP="إدارة الأقسام";
const D=x=>x?String(x).slice(0,10):"";
const WD=["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
const wdOf=d=>new Date(d+"T00:00:00Z").getUTCDay();
const isOff=d=>wdOf(d)===5; // الجمعة إجازة
const pctOf=(a,b)=>b?Math.round(a/b*100):0;
const shortD=d=>new Date(d+"T00:00:00Z").toLocaleDateString("ar-EG",{day:"numeric",month:"short",timeZone:"UTC"});

/* ---------- جلب البيانات (مع تجاوز حد 1000 صف في Supabase) ---------- */
async function all(table,cols="*"){
  const out=[];
  for(let f=0;;f+=1000){
    const{data,error}=await db.from(table).select(cols).order("id").range(f,f+999);
    if(error)throw error;
    out.push(...data);
    if(data.length<1000)break;
  }
  return out;
}
// الإنتاج بدون طلبية (جدول free_production) — لو الجدول لسه مش موجود بيرجع فاضي
async function freeRows(sec){
  const out=[];
  try{
    for(let f=0;;f+=1000){
      const{data,error}=await db.from("free_production").select("*").eq("section",sec).order("id").range(f,f+999);
      if(error)return[];
      out.push(...data);if(data.length<1000)break;
    }
  }catch(e){return[]}
  return out.map(x=>sec==="spray"
    ?{d:D(x.prod_date),item:x.item||"—",sub:x.spray_color||"",oc:x.sub||"",qty:+x.qty||0,w:x.worker||"",n:x.note||"",free:true,id:x.id,tb:"free_production",raw:x}
    :{d:D(x.prod_date),item:x.item||"—",sub:x.sub||"",qty:+x.qty||0,w:x.worker||"",n:x.note||"",free:true,id:x.id,tb:"free_production",raw:x});
}
const groupBy=(arr,k)=>{const m=new Map();arr.forEach(x=>{const v=x[k];(m.get(v)||m.set(v,[]).get(v)).push(x)});return m};

function fromLines(orders,lines,prods,subKey,waste,tb){
  const O=new Map(orders.map(o=>[o.id,o])),L=new Map(lines.map(l=>[l.id,l])),byO=groupBy(lines,"order_id");
  const prod=prods.map(p=>{const l=L.get(p.line_id),o=l&&O.get(l.order_id);return{d:D(p.prod_date),item:o?.item||"—",sub:l?String(l[subKey]??""):"",qty:+p.qty||0,w:p.worker||"",n:[p.design,p.note].filter(Boolean).join(" · "),id:p.id,tb,raw:p,oid:l&&l.order_id,max:l?(+l.total_required||0)-(+l.produced||0)+(+p.qty||0):0}});
  const ord=orders.map(o=>{
    const ls=byO.get(o.id)||[];
    return{id:o.id,gid:o.group_id||null,item:o.item,sub:ls.map(l=>l[subKey]).join("، "),date:D(o.order_date),due:D(o.due_date),pc:+o.postponed_count||0,status:o.status,
      req:ls.reduce((a,l)=>a+(+l.total_required||0),0),done:ls.reduce((a,l)=>a+Math.min(+l.produced||0,+l.total_required||0),0),
      over:ls.reduce((a,l)=>a+Math.max((+l.produced||0)-(+l.total_required||0),0),0)};
  });
  const out={prod,ord};
  if(waste)out.waste=waste.map(w=>({d:D(w.waste_date),item:w.item||w.glaze_orders?.item||"-",good:+w.good_qty||0,qty:+w.qty||0}));
  return out;
}

const SRC={
  glaze:{name:"جليز",page:"glaze.html",icon:"glaze",color:"#2E6F80",noun:"الإنتاج",sub:"اللون",
    async fetch(){
      const[o,p,w]=await Promise.all([
        all("glaze_orders","*"),
        all("glaze_production","*"),
        all("glaze_waste","*").catch(()=>[])
      ]);
      // الأسطر: نجرب الـ view أولاً ولو فشل نحسب من الجداول الأصلية
      let l;
      try{l=await all("glaze_lines_status","id,order_id,color,total_required,produced")}
      catch(e){
        const[ln,inc]=await Promise.all([all("glaze_order_lines","id,order_id,color,qty_required"),all("glaze_order_increases","id,line_id,qty").catch(()=>[])]);
        const add=new Map(),made=new Map();
        inc.forEach(x=>add.set(x.line_id,(add.get(x.line_id)||0)+(+x.qty||0)));
        p.forEach(x=>made.set(x.line_id,(made.get(x.line_id)||0)+(+x.qty||0)));
        l=ln.map(x=>({id:x.id,order_id:x.order_id,color:x.color,total_required:(+x.qty_required||0)+(add.get(x.id)||0),produced:made.get(x.id)||0}));
      }
      const names=new Map(o.map(x=>[x.id,x.item]));
      w.forEach(x=>{if(!x.item&&x.order_id)x.item=names.get(x.order_id)});
      const out=fromLines(o,l,p,"color",w,"glaze_production");out.prod.push(...await freeRows("glaze"));return out;
    }},
  deco:{name:"زخرفة",page:"decoration.html",icon:"deco",color:"#5E5A8C",noun:"الإنتاج",sub:"الكود",
    async fetch(){
      const[o,l,p]=await Promise.all([all("deco_orders","*"),all("deco_lines_status","id,order_id,code,total_required,produced"),all("deco_production","*")]);
      const out=fromLines(o,l,p,"code",null,"deco_production");out.prod.push(...await freeRows("deco"));return out;
    }},
  // الرش: لون الصنف (oc) حاجة، و«لون الرش» (sub = spray_color) حاجة تانية مسجلة على كل تسجيل إنتاج.
  // التسجيلات القديمة اللي من غير لون رش بتتحسب «بدون لون رش».
  spray:{name:"رش",page:"spray.html",icon:"spray",color:"#B8862B",noun:"الإنتاج",sub:"لون الرش",
    async fetch(){
      const[s,p,sg]=await Promise.all([all("spray_status","*"),all("spray_production","*"),all("spray_orders","id,group_id,spray_color").catch(()=>all("spray_orders","id,group_id").catch(()=>[]))]);
      const GM=new Map(sg.map(x=>[x.id,x.group_id||null])),SCM=new Map(sg.map(x=>[x.id,(x.spray_color||"").trim()]));
      const S=new Map(s.map(x=>[x.id,x])),fr=await freeRows("spray");
      return{
        prod:p.map(x=>{const o=S.get(x.order_id),oc=o?String(o.color??""):"";return{d:D(x.prod_date),item:o?.item||"—",sub:String(x.spray_color||""),oc,qty:+x.qty||0,w:x.worker||"",n:x.note||"",id:x.id,tb:"spray_production",raw:x,oid:x.order_id,max:o?(+o.qty_required||0)-(+o.produced||0)+(+x.qty||0):0}}).concat(fr),
        ord:s.map(o=>({id:o.id,gid:o.group_id||GM.get(o.id)||null,item:o.item,sub:String(o.color??"")+(SCM.get(o.id)?" ← رش "+SCM.get(o.id):""),date:D(o.order_date),due:D(o.due_date),pc:+o.postponed_count||0,status:o.status,req:+o.qty_required||0,done:Math.min(+o.produced||0,+o.qty_required||0),over:Math.max((+o.produced||0)-(+o.qty_required||0),0)}))
      };
    }},
  repair:{name:"تصليح",page:"repair.html",icon:"repair",color:"#5D6B7A",noun:"التصليح",sub:"",
    async fetch(){
      const r=await all("repair_log","id,repair_date,item,qty");
      return{prod:r.map(x=>({d:D(x.repair_date),item:x.item||"بدون صنف",sub:"",qty:+x.qty||0})),ord:null};
    }}
};
const KEYS=Object.keys(SRC);
const cache={};
const inflight={};
async function getData(key,force){
  const c=cache[key];
  if(!force&&c&&Date.now()-c.t<30000)return c.data;
  if(!force&&inflight[key])return inflight[key]; // طلب شغال بالفعل (تحميل مسبق): ما نكررهوش
  const p=SRC[key].fetch().then(data=>{cache[key]={t:Date.now(),data};return data}).finally(()=>{if(inflight[key]===p)delete inflight[key]});
  inflight[key]=p;return p;
}

/* ---------- فترات وتجميع ---------- */
function rangeOf(k,f,t){
  const T=today();
  return k==="today"?[T,T]:k==="7"?[addDays(T,-6),T]:k==="month"?[T.slice(0,8)+"01",T]:k==="all"?["",""]:[f||"",t||""];
}
const inRange=(d,f,t)=>(!f||d>=f)&&(!t||d<=t);
function prevRange(f,t){if(!f||!t)return null;const n=daysBetween(f,t)+1,pt=addDays(f,-1);return[addDays(pt,-(n-1)),pt]}
const weekStart=d=>addDays(d,-((new Date(d+"T00:00:00Z").getUTCDay()+1)%7)); // الأسبوع يبدأ السبت
const plan=(f,t)=>{const n=daysBetween(f,t)+1;return n<=31?"day":n<=150?"week":"month"};
const keyOf=(d,m)=>m==="day"?d:m==="week"?weekStart(d):d.slice(0,7);
function bucketList(f,t,m){
  const out=[];
  if(m==="day"){for(let c=f;c<=t;c=addDays(c,1))out.push(c)}
  else if(m==="week"){for(let c=weekStart(f);c<=t;c=addDays(c,7))out.push(c)}
  else{let y=+f.slice(0,4),mo=+f.slice(5,7);const end=t.slice(0,7);for(;;){const k=y+"-"+String(mo).padStart(2,"0");if(k>end)break;out.push(k);if(++mo>12){mo=1;y++}}}
  return out;
}
const shortL=(k,m)=>m==="day"?String(+k.slice(8)):m==="week"?(+k.slice(8))+"/"+(+k.slice(5,7)):new Date(k+"-01T00:00:00Z").toLocaleDateString("ar-EG",{month:"short",timeZone:"UTC"});
const longL=(k,m)=>m==="day"?new Date(k+"T00:00:00Z").toLocaleDateString("ar-EG",{weekday:"long",day:"numeric",month:"long",timeZone:"UTC"})
  :m==="week"?"أسبوع يبدأ "+new Date(k+"T00:00:00Z").toLocaleDateString("ar-EG",{day:"numeric",month:"long",timeZone:"UTC"})
  :new Date(k+"-01T00:00:00Z").toLocaleDateString("ar-EG",{month:"long",year:"numeric",timeZone:"UTC"});
const fmtP=(f,t)=>f&&t?(f===t?fmtDW(f):`من ${fmtDW(f)} إلى ${fmtDW(t)}`):f?`من ${fmtDW(f)}`:t?`حتى ${fmtDW(t)}`:"كل الفترات";
const keyFor=(r,by,cfg)=>by==="sub"?r.item+(r.sub?" — "+r.sub:""):by==="col"?(r.sub||"بدون "+(cfg.sub||"لون")):r.item;
const groupSum=(rows,by,cfg)=>{const m=new Map();rows.forEach(r=>{const k=keyFor(r,by,cfg||{});m.set(k,(m.get(k)||0)+r.qty)});return[...m].sort((a,b)=>b[1]-a[1])};
const sum=rows=>rows.reduce((a,r)=>a+r.qty,0);
const deltaOf=(cur,prev)=>prev==null?null:prev===0?(cur>0?["up","▲ جديد"]:null):(()=>{const p=Math.round((cur-prev)/prev*100);return p===0?["flat","= نفس الفترة السابقة"]:[p>0?"up":"down",(p>0?"▲ ":"▼ ")+Math.abs(p)+"% عن الفترة السابقة"]})();

/* ---------- تحليل الطلبيات المفتوحة: توقّع الإنجاز والطلبيات الراكدة ---------- */
// المعدل = إنتاج آخر 14 يوم ÷ عدد أيام الشغل الفعلية فيها. التقدير بأيام شغل (مش أيام تقويم).
function backlog(key,data){
  if(!data||!data.ord)return null;
  const T=today(),from=addDays(T,-13);
  const k1=r=>key==="spray"?r.item+"|"+(r.oc??r.sub):r.item;
  const k2=o=>key==="spray"?o.item+"|"+o.sub:o.item;
  const wd=new Set(),q14=new Map(),last=new Map();let tot14=0;
  data.prod.forEach(r=>{
    const k=k1(r);
    if(!last.has(k)||r.d>last.get(k))last.set(k,r.d);
    if(r.d>=from&&r.d<=T){wd.add(r.d);q14.set(k,(q14.get(k)||0)+r.qty);tot14+=r.qty}
  });
  const days=Math.max(wd.size,1);
  const rows=data.ord.filter(o=>o.status==="open").map(o=>{
    const rem=Math.max(o.req-o.done,0),k=k2(o),rate=(q14.get(k)||0)/days,l=last.get(k)||"";
    return{o,rem,rate,last:l,eta:rem>0&&rate>0?Math.ceil(rem/rate):null,stalled:rem>0&&(!l||daysBetween(l,T)>14)&&ageDays(o.date)>7};
  });
  const rem=rows.reduce((a,x)=>a+x.rem,0),rate=tot14/days;
  return{rows,rem,rate,eta:rem>0&&rate>0?Math.ceil(rem/rate):null,stalled:rows.filter(x=>x.stalled),by:new Map(rows.map(x=>[x.o.id,x])),active:wd.size};
}
const ordN=n=>n===1?"طلبية":n===2?"طلبيتين":n<=10?n+" طلبيات":n+" طلبية";
const etaTxt=n=>n==null?"—":n<=1?"يوم شغل":n===2?"يومين شغل":n<=10?n+" أيام شغل":n+" يوم شغل";

/* ---------- ملاحظات ذكية (نصوص جاهزة بالعربي من الأرقام) ---------- */
const INS_ICON={ok:"checkc",warn:"alert",info:"bulb"};
const insHtml=list=>list.map(([k,t])=>`<div class="ins ${k}"><span class="ii" aria-hidden="true">${ui(INS_ICON[k]||"bulb")}</span><span>${t}</span></div>`).join("");
function sectionInsights(c){
  const{cfg,key,rows,f,t,total,prevTotal,k,hasW,bl,custom}=c,I=[],T=today();
  if(!rows.length)return I;
  const days=[...new Set(rows.map(r=>r.d))].sort(),perDay=new Map();
  rows.forEach(r=>perDay.set(r.d,(perDay.get(r.d)||0)+r.qty));
  // 1) الاتجاه مقارنة بالفترة السابقة
  if(prevTotal!=null){
    if(prevTotal===0&&total>0)I.push(["info","مفيش إنتاج مسجل في الفترة السابقة، فالفترة دي هي البداية."]);
    else if(prevTotal>0){
      const p=Math.round((total-prevTotal)/prevTotal*100);
      if(Math.abs(p)>=10)I.push([p>0?"ok":"warn",`${cfg.noun} ${p>0?"زاد":"قلّ"} <b>${Math.abs(p)}%</b> عن الفترة السابقة (${nf(prevTotal)} ← ${nf(total)}).`]);
      else I.push(["info","الإنتاج ثابت تقريبًا مقارنة بالفترة السابقة."]);
    }
  }
  // 2) توقّع نهاية الشهر
  if(k==="month"&&T.slice(0,7)===(f||"").slice(0,7)){
    const el=+T.slice(8),dim=new Date(Date.UTC(+T.slice(0,4),+T.slice(5,7),0)).getUTCDate();
    if(el>=5&&el<dim)I.push(["info",`بالمعدل الحالي المتوقع يوصل إنتاج الشهر لحوالي <b>${nf(Math.round(total/el*dim))}</b> بنهاية الشهر.`]);
  }
  // 3) أفضل يوم
  const avg=total/days.length,best=[...perDay].sort((a,b)=>b[1]-a[1])[0];
  if(days.length>=4&&best[1]>=avg*1.5)I.push(["info",`أفضل يوم: <b>${longL(best[0],"day")}</b> بـ ${nf(best[1])} (${(best[1]/avg).toFixed(1)} ضعف متوسط أيام الشغل).`]);
  // 4) أيام شغل من غير إنتاج
  const s=f||days[0],e=(t&&t<T?t:T);
  if(s&&e>=s&&daysBetween(s,e)>=2&&daysBetween(s,e)<=62){
    const miss=[];for(let d=s;d<=e;d=addDays(d,1))if(!isOff(d)&&d!==T&&!perDay.has(d))miss.push(d);
    if(miss.length)I.push(["warn",`فيه <b>${miss.length}</b> يوم شغل من غير أي إنتاج${miss.length<=4?": "+miss.map(shortD).join("، "):""}.`]);
  }
  // 5) تركّز الإنتاج على صنف واحد
  const gi=groupSum(rows,"item",cfg);
  if(gi.length>1&&gi[0][1]/total>=.5)I.push(["info",`<b>${esc(gi[0][0])}</b> لوحده ${pctOf(gi[0][1],total)}% من الإنتاج.`]);
  // 6) الألوان / الأكواد
  if(cfg.sub){
    const gc=groupSum(rows.filter(r=>r.sub),"col",cfg);
    if(gc.length){
      const top=gc[0];
      I.push(["info",`أكتر ${cfg.sub==="لون الرش"?"لون اترشّ":cfg.sub} في الفترة: <b>${esc(top[0])}</b> (${nf(top[1])} · ${pctOf(top[1],total)}%) من ${gc.length} ${gc.length>2&&gc.length<11?(cfg.sub==="الكود"?"أكواد":"ألوان"):(cfg.sub==="الكود"?"كود":"لون")}.`]);
    }
    const nos=rows.filter(r=>!r.sub);
    if(nos.length&&sum(nos)/total>=.2)I.push(["warn",`${pctOf(sum(nos),total)}% من الإنتاج متسجل من غير ${cfg.sub}.`]);
  }
  // 7) رش: أكتر تركيبة (لون الصنف ← لون الرش)
  if(key==="spray"){
    const mp=new Map();rows.forEach(r=>{if(r.oc&&r.sub){const kk=r.oc+" ← "+r.sub;mp.set(kk,(mp.get(kk)||0)+r.qty)}});
    if(mp.size>1){const t=[...mp].sort((a,b)=>b[1]-a[1])[0];I.push(["info",`أكتر تركيبة: صنف بلون <b>${esc(t[0].split(" ← ")[0])}</b> اترشّ <b>${esc(t[0].split(" ← ")[1])}</b> (${nf(t[1])}).`])}
  }
  // 8) العمال
  if(hasW){
    const ws=workerStats(rows);
    if(ws.length){
      I.push(["info",`أعلى عامل: <b>${esc(ws[0].w)}</b> بـ ${nf(ws[0].q)} (${pctOf(ws[0].q,total)}% من الإنتاج)${ws.length>1?` من ${ws.length} عمال`:""}.`]);
      const un=sum(rows.filter(r=>!r.w));
      if(un&&un/total>=.3)I.push(["warn",`${pctOf(un,total)}% من الإنتاج متسجل من غير اسم عامل.`]);
    }
  }
  // 9) نمط أيام الأسبوع
  if(days.length>=14&&daysBetween(days[0],days[days.length-1])>=27){
    const wq=Array(7).fill(0),wn=Array(7).fill(0);
    perDay.forEach((v,d)=>{const w=wdOf(d);wq[w]+=v;wn[w]++});
    const av=wq.map((v,i)=>wn[i]>=2?v/wn[i]:0),bi=av.indexOf(Math.max(...av));
    if(av[bi]>0)I.push(["info",`أقوى يوم في الأسبوع: <b>${WD[bi]}</b> (متوسط ${nf(Math.round(av[bi]))}).`]);
  }
  return I;
}
function backlogInsights(bk,cfg){
  const I=[];if(!bk||!bk.rows.length)return I;
  if(bk.rem>0){
    if(bk.eta!=null)I.push(["info",`المتبقي <b>${nf(bk.rem)}</b> في ${ordN(bk.rows.length)} مفتوحة. بمعدل آخر 14 يوم (${nf(Math.round(bk.rate))}/يوم شغل) هيخلص تقريبًا خلال <b>${etaTxt(bk.eta)}</b>.`]);
    else I.push(["warn",`المتبقي <b>${nf(bk.rem)}</b> في ${ordN(bk.rows.length)} ومفيش إنتاج في آخر 14 يوم.`]);
  }
  if(bk.stalled.length){
    const nm=bk.stalled.slice(0,3).map(x=>esc(x.o.item)+(x.o.sub&&cfg&&cfg.sub==="لون الرش"?" · "+esc(x.o.sub):"")).join("، ");
    I.push(["warn",`<b>${ordN(bk.stalled.length)}</b> راكدة (مفيش عليها إنتاج من أكتر من 14 يوم): ${nm}${bk.stalled.length>3?" …":""}.`]);
  }
  return I;
}
function workerStats(rows){
  const m=new Map();
  rows.forEach(r=>{if(!r.w)return;const o=m.get(r.w)||{w:r.w,q:0,days:new Set(),items:new Set()};o.q+=r.qty;o.days.add(r.d);o.items.add(r.item);m.set(r.w,o)});
  return[...m.values()].sort((a,b)=>b.q-a.q);
}

/* ---------- الرسم البياني (أعمدة متراصة) ---------- */
function drawChart(el,{f,t,series}){
  if(!f||!t){
    const ds=series.flatMap(s=>s.rows.map(r=>r.d)).sort();
    if(!ds.length){el.innerHTML='<div class="empty">مفيش بيانات في الفترة دي</div>';return}
    f=f||ds[0];t=t||ds[ds.length-1];
  }
  const m=plan(f,t),bl=bucketList(f,t,m);
  const sums=series.map(s=>{const o={};s.rows.forEach(r=>{if(r.d>=f&&r.d<=t){const k=keyOf(r.d,m);o[k]=(o[k]||0)+r.qty}});return o});
  const tot=bl.map(k=>sums.reduce((a,o)=>a+(o[k]||0),0));
  if(!tot.some(Boolean)){el.innerHTML='<div class="empty">مفيش بيانات في الفترة دي</div>';return}
  const max=Math.max(...tot),step=Math.ceil(bl.length/10),few=bl.length<=12,mi=tot.indexOf(max);
  const unit=m==="day"?"يوم":m==="week"?"أسبوع":"شهر";
  el.innerHTML=`<div class="chart"><div class="bars">${bl.map((k,i)=>{
      const h=tot[i]/max*100;
      return `<div class="b ${tot[i]?"":"zero"}" data-i="${i}"><div class="st" data-h="${h}" style="height:0">${series.map((s,si)=>sums[si][k]?`<i style="flex:${sums[si][k]};background:${s.color}"></i>`:"").join("")}</div>${tot[i]&&(few||i===mi)?`<span class="bv" style="bottom:calc(${h}% + 2px)">${nf(tot[i])}</span>`:""}</div>`}).join("")}</div>
    <div class="axis">${bl.map((k,i)=>`<span>${i%step===0?shortL(k,m):""}</span>`).join("")}</div>
    <div class="cinfo">كل عمود = ${unit} · اضغط على عمود للتفاصيل</div></div>
    ${series.length>1?`<div class="legend">${series.map(s=>`<span><i style="background:${s.color}"></i>${s.name}</span>`).join("")}</div>`:""}`;
  requestAnimationFrame(()=>requestAnimationFrame(()=>el.querySelectorAll(".st").forEach(s=>s.style.height=s.dataset.h+"%")));
  el.querySelector(".bars").onclick=e=>{
    const b=e.target.closest(".b");if(!b)return;const i=+b.dataset.i;
    el.querySelectorAll(".b").forEach(x=>x.classList.toggle("sel",x===b));
    const parts=series.length>1?"<br>"+series.map((s,si)=>`${s.name}: <b>${nf(sums[si][bl[i]]||0)}</b>`).join(" · "):"";
    el.querySelector(".cinfo").innerHTML=`${longL(bl[i],m)} — <b>${nf(tot[i])}</b>${parts}`;
  };
}

/* ---------- أدوات واجهة مشتركة ---------- */
const CHIPS=[["today","اليوم"],["7","7 أيام"],["month","الشهر"],["all","الكل"]];
const chipsHtml=k=>CHIPS.map(c=>`<button type="button" class="chip ${c[0]===k?"on":""}" data-k="${c[0]}">${c[1]}</button>`).join("");
const skelKpis=n=>Array.from({length:n},()=>'<i class="sk" style="height:66px;border-radius:14px"></i>').join("");
function csvDownload(name,header,rows){
  const q=s=>'"'+String(s??"").replace(/"/g,'""')+'"';
  const csv="﻿"+[header.join(","),...rows.map(r=>r.map(q).join(","))].join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download=name;a.click();
}
async function shareText(text){
  const org=(SET.get("org","")||"").trim();
  if(SET.get("shareorg",false)&&org)text=org+"\n"+text;
  if(SET.get("sharedt",false))text+="\nتاريخ الإصدار: "+new Date().toLocaleString("ar-EG");
  const m=SET.get("share","auto");
  if(m==="copy"){
    try{await navigator.clipboard.writeText(text);toast("اتنسخ التقرير");return}catch(e){}
  }
  if(m!=="whatsapp"&&navigator.share){try{await navigator.share({text});return}catch(e){if(e.name==="AbortError")return}}
  window.open("https://wa.me/?text="+encodeURIComponent(text),"_blank");
}
const showMore=(list,flag)=>flag?list:list.slice(0,10);
/* ---------- تعديل / حذف تسجيل إنتاج من جوه التقارير ---------- */
const SYNC={glaze:{lv:"glaze_lines_status",o:"glaze_orders"},deco:{lv:"deco_lines_status",o:"deco_orders"},spray:{sv:"spray_status",o:"spray_orders"}};
// بعد أي تعديل/حذف: نعيد حساب حالة الطلبية (مفتوحة/مكتملة) زي صفحة تسجيل الإنتاج
async function resyncOrder(row,key){
  const s=SYNC[key];if(!s||!row.oid)return;
  if(s.lv){await syncAfter({sync:{lv:s.lv,o:s.o,oid:row.oid}});return}
  const{data}=await db.from(s.sv).select("*").eq("id",row.oid).single();
  const done=!!data&&data.produced>=data.qty_required;
  if(data&&data.status!==(done?"done":"open"))await db.from(s.o).update({status:done?"done":"open"}).eq("id",row.oid);
}
const actBtns=(i,r)=>`<span class="iacts">`+(can("edit")?`<button class="iact" type="button" data-act="edit" data-i="${i}" title="تعديل" aria-label="تعديل">${ui("edit")}</button>`:"")+(can("delete")?`<button class="iact bad" type="button" data-act="del" data-i="${i}" title="حذف" aria-label="حذف">${ui("trash")}</button>`:"")+`</span>`;
const entryTxt=r=>r.item+(r.sub?" · "+r.sub:"");
function editEntry(row,key,done){
  if(!row||!row.id)return;
  const deco=key==="deco",spray=key==="spray",free=!!row.free,raw=row.raw||{};
  const lab=deco?"كود الرسمة":spray?"لون الصنف":"اللون",sid=deco?"m-code":"m-color";
  if(row.max)row={...row,max:Math.max(row.max,row.qty)}; // مسموح دايمًا ترجّع الكمية لقيمتها الحالية أو أقل
  openModal("تعديل تسجيل الإنتاج",
    XT(deco)+(free?`<label>الصنف</label><input id="m-item" autocomplete="off"><label>${lab} (اختياري)</label><input id="${sid}" autocomplete="off">`
         :`<div class="nums"><b>${esc(entryTxt(row))}</b></div>`)+
    `<label>الكمية</label><input type="number" id="m-q" min="1" inputmode="numeric" value="${row.qty}">`+
    (row.max?`<div class="hint" style="margin:0">المتاح للبند ده: ${nf(row.max)} (لو زدت عنه هيتسجل مع تنبيه في التقارير)</div>`:"")+
    `<label>التاريخ</label><input type="date" id="m-d" value="${esc(row.d||today())}">${spray?XS(raw.spray_color||""):""}${XF(deco)}`,async()=>{
    const q=parseInt(document.getElementById("m-q").value);
    if(!q||q<1){toast("اكتب كمية صحيحة");return false}
    const v=id=>((document.getElementById(id)||{}).value||"").trim();
    const patch={qty:q,prod_date:v("m-d")||row.d||today(),worker:v("m-w")||null,note:v("m-n")||null};
    if(deco)patch.design=v("m-ds")||null;
    if(spray){if(!v("m-sc")){toast("اكتب لون الرش");return false}patch.spray_color=v("m-sc")}
    if(free){const item=v("m-item");if(!item){toast("اكتب الصنف");return false}patch.item=item;patch.sub=v(sid)||null}
    let r=await db.from(row.tb).update(patch).eq("id",row.id).select();
    if(r.error&&/worker|note|design|spray_color/.test(r.error.message||"")){const{worker,note,design,spray_color,...rest}=patch;r=await db.from(row.tb).update(rest).eq("id",row.id).select()}
    if(r.error){toast(isNet(r.error)?"التعديل محتاج اتصال بالإنترنت":"خطأ: "+r.error.message,"bad");return false}
    if(!r.data||!r.data.length){toast("لم يتم التعديل، راجع الصلاحيات","bad");return false}
    await resyncOrder(row,key);cache[key]=null;toast("تم التعديل");if(done)done();
  },"حفظ التعديل");
  const set=(id,val)=>{const el=document.getElementById(id);if(el&&val)el.value=val};
  if(free){set("m-item",row.free&&spray?raw.item:row.item);set(sid,free?raw.sub:"")}
  set("m-w",raw.worker);set("m-n",raw.note);set("m-ds",raw.design);
}
async function deleteEntry(row,key,done){
  if(!row||!row.id)return;
  if(!await ask("حذف تسجيل الإنتاج ده؟ ("+esc(entryTxt(row))+" · "+nf(row.qty)+")"))return;
  const{data,error}=await db.from(row.tb).delete().eq("id",row.id).select();
  if(error||!data.length){toast(error?(isNet(error)?"الحذف محتاج اتصال بالإنترنت":"خطأ: "+error.message):"لم يتم الحذف، راجع الصلاحيات","bad");return}
  await resyncOrder(row,key);cache[key]=null;toast("تم الحذف");if(done)done();
}
const stripTags=h=>String(h).replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">");

/* ---------- طباعة ذكية ----------
   نافذة بتسأل: إيه الأقسام اللي تتطبع؟ (ملخص / تفصيلي / للإدارة) + اتجاه الصفحة (تلقائي).
   الأقسام الفاضية بتتخفى تلقائيًا، واختيارك بيتحفظ لكل تقرير. العناصر المعلّمة data-ps هي الأقسام. */
const PS_PRESETS=[["ملخص سريع",["kpi","insights","chart","dist"]],["تفصيلي",null],["للإدارة",["kpi","insights","open","late","secs"]]];
function printDialog(root,scope,secs,hooks={}){
  // secs: [[id, الاسم, فيه بيانات؟]]
  let saved=null;try{saved=SET.get("ps_"+scope,null)}catch(e){}
  const on=id=>saved&&saved.s?saved.s.includes(id):(id!=="log");
  const mode=(saved&&saved.o)||"auto";
  const body=`<div class="hint" style="margin:0 0 8px">اختار الأقسام اللي تظهر في الورق. الأقسام الفاضية بتتخفى لوحدها.</div>
    <div class="row" style="flex-wrap:wrap;gap:6px;margin:0 0 8px">${PS_PRESETS.map((p,i)=>`<button type="button" class="btn ghost sm" data-pre="${i}">${p[0]}</button>`).join("")}</div>
    ${secs.map(([id,lb,has])=>`<label class="sw" style="cursor:pointer;${has?"":"opacity:.55"}"><span>${lb}${has?"":"<small>مفيش بيانات</small>"}</span><input type="checkbox" class="psx" data-id="${id}" ${has&&on(id)?"checked":""} ${has?"":"disabled"}></label>`).join("")}
    <label>اتجاه الصفحة</label><select id="ps-o"><option value="auto" ${mode==="auto"?"selected":""}>تلقائي (عرضي لو فيه جدول تفصيلي)</option><option value="portrait" ${mode==="portrait"?"selected":""}>طولي</option><option value="landscape" ${mode==="landscape"?"selected":""}>عرضي</option></select>
    <h3 style="margin:14px 0 4px">تعديل قبل الطباعة</h3><div class="hint" style="margin:0 0 4px">بيتغيّر على الورق بس — البيانات نفسها ما بتتأثرش.</div>
    <label>عنوان التقرير (اختياري)</label><input id="ps-t" maxlength="80" placeholder="سيبه فاضي للعنوان الأصلي">
    <label>ملاحظة تظهر أعلى التقرير (اختياري)</label><input id="ps-n" maxlength="200" placeholder="مثال: تقرير مراجعة نهاية الأسبوع">
    <label>اسم المُعِد (اختياري)</label><input id="ps-by" maxlength="60" value="${esc((saved&&saved.by)||"")}" placeholder="الافتراضي: اسم المستخدم الحالي">`;
  openModal("خيارات الطباعة",body,async()=>{
    const ids=[...document.querySelectorAll(".psx:checked")].map(x=>x.dataset.id);
    if(!ids.length){toast("اختار قسم واحد على الأقل");return false}
    const om=document.getElementById("ps-o").value;
    const pt=document.getElementById("ps-t").value.trim(),pn=document.getElementById("ps-n").value.trim(),pby=document.getElementById("ps-by").value.trim();
    SET.set("ps_"+scope,{s:ids,o:om,by:pby});
    window.__pby=pby||null;
    const ph=root.querySelector(".print-head"),h2=ph&&ph.querySelector("h2");
    if(h2&&pt){h2.dataset.ot=h2.textContent;h2.textContent=pt}
    if(ph&&pn){const n=document.createElement("div");n.className="ps-note";n.textContent=pn;ph.appendChild(n)}
    const land=om==="landscape"||(om==="auto"&&(ids.includes("log")||(scope==="orders"&&ids.includes("list")))); // جدول الطلبيات 8 أعمدة: عرضي تلقائي
    window.__po=land?"landscape":(om==="portrait"||om==="auto"?"portrait":null);
    secs.forEach(([id])=>root.querySelectorAll('[data-ps="'+id+'"]').forEach(el=>el.classList.toggle("ps-off",!ids.includes(id))));
    root.querySelectorAll("[data-empty]").forEach(el=>el.classList.add("ps-empty"));
    if(hooks.before)hooks.before(ids);
    document.body.classList.add("pr-"+scope);
    let done=false;
    const clean=()=>{
      if(done)return;done=true;window.__po=null;window.__pby=null;document.body.classList.remove("pr-"+scope);
      root.querySelectorAll(".ps-note").forEach(n=>n.remove());
      root.querySelectorAll(".print-head h2[data-ot]").forEach(h=>{h.textContent=h.dataset.ot;delete h.dataset.ot});
      root.querySelectorAll(".ps-off,.ps-empty").forEach(el=>el.classList.remove("ps-off","ps-empty"));
      if(hooks.after)hooks.after();
    };
    addEventListener("afterprint",clean,{once:true});
    setTimeout(clean,60000); // احتياط لو المتصفح ما بعتش afterprint
    setTimeout(()=>window.print(),250);
  },"طباعة");
  document.querySelectorAll("#ov [data-pre]").forEach(b=>b.onclick=()=>{
    const p=PS_PRESETS[+b.dataset.pre][1];
    document.querySelectorAll("#ov .psx:not(:disabled)").forEach(x=>x.checked=p?p.includes(x.dataset.id):true);
  });
}

/* ---------- تقرير قسم واحد ---------- */
function mount(rootId,key){
  const root=typeof rootId==="string"?document.getElementById(rootId):rootId,cfg=SRC[key];
  const st={k:"month",f:"",t:"",item:"",col:"",wk:"",by:"item",data:null,moreB:false,moreO:false,moreL:false,printing:false,last:null};
  const hasOrd=key!=="repair";
  root.innerHTML=`
  <div class="print-head"><h2>${APP} — تقرير ${cfg.name}</h2><div class="nums rpd"></div></div>
  <div class="card noprint">
    <div class="chips rch">${chipsHtml(st.k)}</div>
    <div class="two"><div><label>من</label><input type="date" class="rf"></div><div><label>إلى</label><input type="date" class="rt"></div></div>
    <label>الصنف</label><select class="ri"><option value="">الكل</option></select>
    <div class="two rflt" hidden><div class="rclw" hidden><label>${cfg.sub||""}</label><select class="rcl"><option value="">الكل</option></select></div><div class="rww" hidden><label>العامل</label><select class="rw"><option value="">الكل</option></select></div></div>
  </div>
  <div class="kpis rk" data-ps="kpi">${skelKpis(4)}</div>
  <div class="card" data-ps="insights"><div class="sec-head"><h3 class="hi">${ui("sparkles")}<span>ملاحظات ذكية</span></h3></div><div class="rins"></div></div>
  <div class="card" data-ps="chart"><div class="sec-head"><h3>${cfg.noun} على مدار الفترة</h3></div><div class="rc"><i class="sk" style="height:170px"></i></div></div>
  <div class="card" data-ps="dist"><div class="sec-head"><h3>التوزيع</h3><div class="seg noprint"></div></div><div class="scroll rb"></div></div>
  ${hasOrd?'<div class="card" data-ps="open"><div class="sec-head"><h3>الطلبيات المفتوحة حالياً</h3></div><div class="scroll ro"></div></div>':""}
  <div class="card" data-ps="workers"><div class="sec-head"><h3>أداء العمال</h3></div><div class="scroll rwk"></div></div>
  <div class="card" data-ps="log"><div class="sec-head"><h3>سجل التفاصيل</h3></div><div class="scroll rlg"></div></div>
  <div class="actbar noprint"><button class="btn ib rx">${ib("download","تصدير Excel")}</button><button class="btn ghost ib rpr">${ib("print","طباعة")}</button><button class="btn ghost ib rsh">${ib("share","مشاركة")}</button></div>`;
  const $=s=>root.querySelector(s),$$=s=>root.querySelectorAll(s);
  const subLbl=cfg.sub||"";

  function range(){return rangeOf(st.k,st.f,st.t)}
  function draw(){
    const data=st.data;if(!data)return;
    const[f,t]=range();
    const byItem=r=>!st.item||r.item===st.item,byCol=r=>!st.col||r.sub===st.col,byWk=r=>!st.wk||r.w===st.wk;
    const pass=r=>byItem(r)&&byCol(r)&&byWk(r);
    const rows=data.prod.filter(r=>inRange(r.d,f,t)&&pass(r));
    const total=sum(rows);
    const days=new Set(rows.map(r=>r.d)).size;
    const perDay=new Map();rows.forEach(r=>perDay.set(r.d,(perDay.get(r.d)||0)+r.qty));
    const best=[...perDay].sort((a,b)=>b[1]-a[1])[0];
    const pr=prevRange(f,t);
    const prevTotal=pr?sum(data.prod.filter(r=>inRange(r.d,pr[0],pr[1])&&pass(r))):null;
    const K=[[`إجمالي ${cfg.noun}`,total,null,{},deltaOf(total,prevTotal)],
      ["متوسط / يوم عمل",days?total/days:0,null,{}],
      [best?`أفضل يوم (${new Date(best[0]+"T00:00:00Z").toLocaleDateString("ar-EG",{weekday:"long",timeZone:"UTC"})} ${shortD(best[0])})`:"أفضل يوم",best?best[1]:0,null,{}],
      ["عدد الأصناف",new Set(rows.map(r=>r.item)).size,null,{}]];
    let open=[],bk=null;
    if(data.ord){
      open=data.ord.filter(o=>o.status==="open"&&(!st.item||o.item===st.item)&&(!st.col||key!=="spray"||o.sub===st.col));
      bk=backlog(key,data);
      const req=open.reduce((a,o)=>a+o.req,0),dn=open.reduce((a,o)=>a+o.done,0),late=open.filter(o=>isLate(o.status,o.date)).length;
      K.push(["طلبيات مفتوحة",open.length,null,{}],["المتبقي للإنجاز",Math.max(req-dn,0),null,{}],["نسبة إنجاز المفتوحة",req?dn/req*100:0,null,{suf:"%"}],[`متأخرة (+${LATE_DAYS} يوم)`,late,late?"var(--warn)":null,{}]);
    }
    if(data.waste){
      const w=data.waste.filter(x=>inRange(x.d,f,t)&&byItem(x)),wq=w.reduce((a,x)=>a+x.qty,0),wg=w.reduce((a,x)=>a+x.good,0);
      K.push(["الهالك",wq,wq?"var(--bad)":null,{}],["نسبة الهالك",wq+wg?wq/(wq+wg)*100:0,null,{suf:"%",dec:1}]);
    }
    kpis($(".rk"),K);
    // ملاحظات ذكية
    const hasW=data.prod.some(r=>r.w);
    let ins=sectionInsights({cfg,key,rows,f,t,total,prevTotal,k:st.k,hasW});
    if(bk&&!st.col&&!st.wk&&!st.item)ins=ins.concat(backlogInsights(bk,cfg));
    {const ex=(data.ord||[]).filter(o=>o.over>0&&(!st.item||o.item===st.item)&&(!st.col||key!=="spray"||o.sub===st.col));
      if(ex.length&&!st.wk){const tot=ex.reduce((a,o)=>a+o.over,0),nm=ex.slice(0,3).map(o=>esc(o.item)+(o.sub?" · "+esc(o.sub):"")+" (+"+nf(o.over)+")").join("، ");
        ins.push(["warn",`<b>زيادة في الكمية:</b> ${ordN(ex.length)} اتسجّل عليها إنتاج أكتر من المطلوب بإجمالي <b>${nf(tot)}</b>: ${nm}${ex.length>3?" …":""}.`])}}
    const order={warn:0,ok:1,info:2};ins=ins.sort((a,b)=>order[a[0]]-order[b[0]]).slice(0,9);
    $(".rins").innerHTML=ins.length?insHtml(ins):'<div class="empty">مفيش بيانات كفاية للملاحظات في الفترة دي</div>';
    $('[data-ps="insights"]').toggleAttribute("data-empty",!ins.length);
    drawChart($(".rc"),{f,t,series:[{name:cfg.name,color:cfg.color,rows}]});
    // التوزيع
    const opts=[["item","حسب الصنف"]];
    if(subLbl){opts.push(["sub","الصنف + "+subLbl]);opts.push(["col","حسب "+subLbl])}
    if(!opts.some(o=>o[0]===st.by))st.by="item";
    $(".seg").innerHTML=opts.map(o=>`<button type="button" data-by="${o[0]}" class="${o[0]===st.by?"on":""}">${o[1]}</button>`).join("");
    const g=groupSum(rows,st.by,cfg),gl=showMore(g,st.moreB||st.printing);
    $(".rb").innerHTML=g.length?`<table><thead><tr><th>${st.by==="sub"?"الصنف — "+subLbl:st.by==="col"?subLbl:"الصنف"}</th><th>الكمية</th><th>النسبة</th></tr></thead><tbody>${gl.map(([k,v])=>{const p=total?Math.round(v/total*100):0;return `<tr><td>${esc(k)}</td><td><b>${nf(v)}</b></td><td><div class="share"><div class="bar"><i style="width:${p}%;background:${cfg.color}"></i></div><span>${p}%</span></div></td></tr>`}).join("")}</tbody><tfoot><tr><th>الإجمالي</th><th>${nf(total)}</th><th></th></tr></tfoot></table>${g.length>10&&!st.printing?`<button class="btn ghost sm more noprint" data-m="b">${st.moreB?"عرض أقل":`عرض الكل (${g.length})`}</button>`:""}`:'<div class="empty">مفيش بيانات في الفترة دي</div>';
    // الطلبيات المفتوحة (مع التقدير والركود)
    if(hasOrd){
      const ol=open.slice().sort((a,b)=>(a.date||"").localeCompare(b.date||"")),ov=showMore(ol,st.moreO||st.printing);
      $(".ro").innerHTML=ol.length?`<table><thead><tr><th>الطلبية</th><th>العمر</th><th>الإنجاز</th><th>المتبقي</th><th>التقدير</th></tr></thead><tbody>${ov.map(o=>{
        const p=o.req?Math.min(100,Math.round(o.done/o.req*100)):0,late=isLate(o.status,o.date),b=bk&&bk.by.get(o.id),rem=Math.max(o.req-o.done,0);
        const est=!b||!rem?"—":b.stalled?'<span class="tag late">راكدة</span>':b.eta!=null?"~ "+etaTxt(b.eta):'<span class="nums">لا إنتاج حديث</span>';
        return `<tr><td><b>${esc(o.item)}</b>${o.sub?`<div class="nums" style="font-size:.8rem">${esc(o.sub)}</div>`:""}</td><td>${late?'<span class="tag late">متأخرة</span> ':""}<span class="nums">${ageTxt(o.date)}</span></td><td><div class="share"><div class="bar"><i style="width:${p}%;background:${p>=100?"var(--ok)":cfg.color}"></i></div><span>${p}%</span></div>${o.over>0?`<span class="tag late">زيادة +${nf(o.over)}</span>`:""}</td><td><b>${nf(rem)}</b></td><td>${est}</td></tr>`}).join("")}</tbody></table><div class="hint" style="margin-top:4px">التقدير = المتبقي ÷ معدل إنتاج الصنف في آخر 14 يوم (بأيام الشغل).</div>${ol.length>10&&!st.printing?`<button class="btn ghost sm more noprint" data-m="o">${st.moreO?"عرض أقل":`عرض الكل (${ol.length})`}</button>`:""}`:'<div class="empty">مفيش طلبيات مفتوحة</div>';
    }
    // أداء العمال
    const ws=workerStats(rows);
    $(".rwk").innerHTML=ws.length?`<table><thead><tr><th>العامل</th><th>الكمية</th><th>أيام</th><th>متوسط/يوم</th><th>أصناف</th></tr></thead><tbody>${ws.map(o=>`<tr><td><b>${esc(o.w)}</b></td><td><b>${nf(o.q)}</b></td><td>${o.days.size}</td><td>${nf(Math.round(o.q/o.days.size))}</td><td>${o.items.size}</td></tr>`).join("")}</tbody></table>`:'<div class="empty">مفيش أسماء عمال مسجلة في الفترة دي</div>';
    $('[data-ps="workers"]').toggleAttribute("data-empty",!ws.length);
    // سجل التفاصيل
    const lg=rows.slice().sort((a,b)=>b.d.localeCompare(a.d)),CAP=400,lv=st.printing?lg.slice(0,CAP):showMore(lg,st.moreL);
    st.lvRows=lv;const canAct=!st.printing&&(can("edit")||can("delete"));
    const subCell=r=>esc(r.sub||"—")+(key==="spray"&&r.oc?`<div class="nums" style="font-size:.78rem">لون الصنف: ${esc(r.oc)}</div>`:"");
    $(".rlg").innerHTML=lg.length?`<table><thead><tr><th>التاريخ</th><th>الصنف</th>${subLbl?`<th>${subLbl}</th>`:""}<th>الكمية</th><th>العامل</th><th>ملاحظة</th>${canAct?'<th class="noprint"></th>':""}</tr></thead><tbody>${lv.map(r=>`<tr><td>${fmtDW(r.d)}</td><td>${esc(r.item)}${r.free?' <span class="tag">بدون طلبية</span>':""}</td>${subLbl?`<td>${subCell(r)}</td>`:""}<td><b>${nf(r.qty)}</b></td><td>${esc(r.w||"—")}</td><td>${esc(r.n||"—")}</td>${canAct?`<td class="noprint" style="white-space:nowrap">${r.id?actBtns(st.lvRows.indexOf(r),r):""}</td>`:""}</tr>`).join("")}</tbody></table>${st.printing?(lg.length>CAP?`<div class="hint">اتعرض أحدث ${CAP} تسجيل من ${nf(lg.length)} — الباقي في ملف Excel.</div>`:""):(lg.length>10?`<button class="btn ghost sm more noprint" data-m="l">${st.moreL?"عرض أقل":`عرض الكل (${lg.length})`}</button>`:"")}`:'<div class="empty">مفيش تسجيلات في الفترة دي</div>';
    $('[data-ps="log"]').toggleAttribute("data-empty",!lg.length);
    $(".rpd").textContent=fmtP(f,t)+(st.item?" · الصنف: "+st.item:"")+(st.col?" · "+subLbl+": "+st.col:"")+(st.wk?" · العامل: "+st.wk:"")+" · طُبع في "+fmtD(today());
    st.last={f,t,rows,total,g,open,best,ins,ws,bk};
  }
  async function refresh(force){
    $(".rk").innerHTML=skelKpis(hasOrd?8:4);
    try{st.data=await getData(key,force)}
    catch(e){$(".rk").innerHTML='<div class="empty err-state" style="grid-column:1/-1">تعذر تحميل التقرير<br><button class="btn sm rr">إعادة المحاولة</button></div>';$(".rr").onclick=()=>refresh(true);return}
    const fill=(sel,vals,cur)=>{sel.innerHTML='<option value="">الكل</option>'+vals.map(v=>`<option>${esc(v)}</option>`).join("");sel.value=[...sel.options].some(o=>o.value===cur)?cur:"";return sel.value};
    const P=st.data.prod,uniq=a=>[...new Set(a.filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ar"));
    st.item=fill($(".ri"),uniq(P.map(r=>r.item)),st.item);
    const cols=subLbl?uniq(P.map(r=>r.sub)):[],wks=uniq(P.map(r=>r.w));
    st.col=fill($(".rcl"),cols,st.col);st.wk=fill($(".rw"),wks,st.wk);
    $(".rclw").hidden=!cols.length;$(".rww").hidden=!wks.length;$(".rflt").hidden=!cols.length&&!wks.length;
    syncDates();draw();
  }
  function syncDates(){if(st.k!=="custom"){[$(".rf").value,$(".rt").value]=rangeOf(st.k)}}
  $(".rch").onclick=e=>{const b=e.target.closest(".chip");if(!b)return;st.k=b.dataset.k;st.moreB=st.moreO=st.moreL=false;$$(".rch .chip").forEach(c=>c.classList.toggle("on",c===b));syncDates();draw()};
  const custom=()=>{st.k="custom";st.f=$(".rf").value;st.t=$(".rt").value;$$(".rch .chip").forEach(c=>c.classList.remove("on"));draw()};
  $(".rf").onchange=custom;$(".rt").onchange=custom;
  $(".ri").onchange=e=>{st.item=e.target.value;draw()};
  $(".rcl").onchange=e=>{st.col=e.target.value;draw()};
  $(".rw").onchange=e=>{st.wk=e.target.value;draw()};
  root.addEventListener("click",e=>{
    const ab=e.target.closest("[data-act]");
    if(ab){const r=st.lvRows[+ab.dataset.i];if(!r)return;(ab.dataset.act==="edit"?editEntry:deleteEntry)(r,key,()=>refresh(true));return}
    const sg=e.target.closest(".seg button");
    if(sg){st.by=sg.dataset.by;st.moreB=false;draw();return}
    const mo=e.target.closest(".more");
    if(mo){const m=mo.dataset.m;if(m==="b")st.moreB=!st.moreB;else if(m==="o")st.moreO=!st.moreO;else st.moreL=!st.moreL;draw()}
  });
  $(".rx").onclick=()=>{
    if(!st.last)return;const{f,t,rows}=st.last,sp=key==="spray";
    csvDownload(`${cfg.name}-تقرير-${f||"الكل"}${t&&t!==f?"-"+t:""}.csv`,["التاريخ","الصنف",cfg.sub||"-",...(sp?["لون الصنف"]:[]),"الكمية","العامل","ملاحظة"],rows.slice().sort((a,b)=>a.d.localeCompare(b.d)).map(r=>[r.d,r.item,r.sub,...(sp?[r.oc||""]:[]),r.qty,r.w||"",r.n||""]));
  };
  $(".rpr").onclick=()=>{
    if(!st.last)return;
    const L=st.last,has={kpi:true,insights:L.ins.length>0,chart:L.total>0,dist:L.g.length>0,open:L.open.length>0,workers:L.ws.length>0,log:L.rows.length>0};
    const secs=[["kpi","الأرقام الرئيسية",has.kpi],["insights","الملاحظات الذكية",has.insights],["chart","الرسم البياني",has.chart],["dist","جدول التوزيع",has.dist]];
    if(hasOrd)secs.push(["open","الطلبيات المفتوحة والتقدير",has.open]);
    secs.push(["workers","أداء العمال",has.workers],["log","سجل التفاصيل (كل التسجيلات)",has.log]);
    printDialog(root,key,secs,{before(){st.printing=true;draw()},after(){st.printing=false;draw()}});
  };
  $(".rsh").onclick=()=>{
    if(!st.last)return;const{f,t,total,g,open,best,ins,ws}=st.last;
    const L=[`تقرير ${cfg.name}`,`الفترة: ${fmtP(f,t)}`+(st.item?` · ${st.item}`:"")+(st.col?` · ${st.col}`:"")+(st.wk?` · ${st.wk}`:""),`إجمالي ${cfg.noun}: ${nf(total)}`];
    if(best)L.push(`أفضل يوم: ${fmtDW(best[0])} (${nf(best[1])})`);
    if(g.length)L.push("أعلى الأصناف:",...g.slice(0,5).map(([k,v])=>`• ${k}: ${nf(v)}`));
    if(subLbl){const gc=groupSum(st.last.rows.filter(r=>r.sub),"col",cfg);if(gc.length)L.push(`أعلى ${subLbl}:`,...gc.slice(0,4).map(([k,v])=>`• ${k}: ${nf(v)}`))}
    if(ws.length)L.push(`أعلى عامل: ${ws[0].w} (${nf(ws[0].q)})`);
    if(hasOrd)L.push(`طلبيات مفتوحة: ${open.length} · متأخرة: ${open.filter(o=>isLate(o.status,o.date)).length}`);
    const top=ins.filter(x=>x[0]!=="info").slice(0,3);
    if(top.length)L.push("ملاحظات:",...top.map(x=>"• "+stripTags(x[1])));
    shareText(L.join("\n"));
  };
  refresh();
  return{refresh:(f=true)=>refresh(f)};
}


/* ---------- تقرير الطلبيات (كل الأقسام) ---------- */
const ORD_SECS=["glaze","deco","spray"];
const ORD_ST=[["open","مفتوحة"],["late","متأخرة"],["stalled","راكدة"],["pp","اتأجلت"],["done","مكتملة"],["dlv","تم التسليم"],["part","تسليم جزئي"],["all","الكل"]];

/* ---------- الطلبية كيان واحد: دمج أصناف نفس الطلبية في صف واحد ---------- */
const GT={t:0,m:new Map(),x:new Map(),d:new Map()};
async function groupTitles(force){
  if(!force&&Date.now()-GT.t<30000)return GT.m;
  try{let r;
    try{r=await all("order_groups","id,title,order_no,customer_phone,delivered_at,delivery_note")}
    catch(e){try{r=await all("order_groups","id,title,order_no,customer_phone")}catch(e2){r=await all("order_groups","id,title")}}
    GT.m=new Map(r.map(x=>[x.id,(x.title||"").trim()]));
    GT.x=new Map(r.map(x=>[x.id,{no:x.order_no||"",ph:(x.customer_phone||"").trim(),dv:x.delivered_at||null,dn:(x.delivery_note||"").trim()}]));
    try{const dr=await all("order_deliveries","id,group_id,delivered_on,qty_done,qty_short,is_final,note,created_at");
      const M=new Map();dr.sort((a,b)=>String(a.delivered_on).localeCompare(String(b.delivered_on))||String(a.created_at).localeCompare(String(b.created_at)));
      dr.forEach(d=>{(M.get(d.group_id)||M.set(d.group_id,[]).get(d.group_id)).push({d:d.delivered_on,q:d.qty_done,s:d.qty_short,f:!!d.is_final,n:(d.note||"").trim()})});GT.d=M}catch(e){GT.d=new Map()}
    GT.t=Date.now()}catch(e){}
  return GT.m;
}
function mergeGroups(rows,titles){
  const out=[],G=new Map();
  rows.forEach(r=>{
    if(!r.gid){out.push({...r,items:null,n:1,q:(r.item+" "+r.sub)});return}
    const key=r.k+"|"+r.gid;let g=G.get(key);
    if(!g){g={r,list:[]};G.set(key,g);out.push(g)}
    g.list.push(r);
  });
  return out.map(x=>{
    if(!x.list)return x;
    const L=x.list,r0=L[0],open=L.filter(r=>r.status==="open"),dues=L.map(r=>r.due).filter(Boolean).sort(),dds=L.map(r=>r.dd).filter(v=>v!=null);
    const req=L.reduce((a,r)=>a+r.req,0),done=L.reduce((a,r)=>a+r.done,0),rem=L.reduce((a,r)=>a+r.rem,0),title=titles&&titles.get(r0.gid)||"";
    const names=[...new Set(L.map(r=>r.item))],X=GT.x.get(r0.gid)||{},dv=!!X.dv;
    return{k:r0.k,delivered:dv,dvList:GT.d.get(r0.gid)||[],dvDate:X.dv||null,dvNote:X.dn||"",sec:r0.sec,color:r0.color,gid:r0.gid,id:"g"+r0.gid,
      item:title||names.join("، "),sub:title?names.join("، "):"",
      date:L.map(r=>r.date).filter(Boolean).sort()[0]||"",due:dues[0]||null,pc:Math.max(...L.map(r=>r.pc||0)),
      status:dv?"done":open.length?"open":r0.status,req,done,over:L.reduce((a,r)=>a+(r.over||0),0),rem,
      pct:req?Math.min(100,Math.round(Math.min(done,req)/req*100)):0,
      secOpen:open.length>0,late:!dv&&open.some(r=>r.late),dd:!dv&&open.length&&dds.length?Math.min(...dds):r0.dd,stalled:!dv&&open.some(r=>r.stalled),
      eta:dv?null:open.reduce((m,r)=>r.eta==null?m:Math.max(m??0,r.eta),null),
      items:L.map(r=>({item:r.item,sub:r.sub,req:r.req,done:Math.min(r.done,r.req),rem:r.rem,st:r.status})),n:L.length,
      q:(title+" "+(X.no||"")+" "+(X.ph||"")+" "+L.map(r=>r.item+" "+r.sub).join(" "))};
  });
}
function ordersReport(rootId){
  const root=document.getElementById(rootId);
  const st={sec:"",stt:"open",q:"",f:"",t:"",gt:new Map(),data:{},err:{},rows:[],more:false,printing:false,last:null};
  root.innerHTML=`
  <div class="print-head"><h2>${APP} — تقرير الطلبيات</h2><div class="nums rpd"></div></div>
  <div class="card noprint">
    <h3>تقرير الطلبيات</h3>
    <div class="two"><div><label>القسم</label><select class="of-s"><option value="">كل الأقسام</option>${ORD_SECS.map(k=>`<option value="${k}">${SRC[k].name}</option>`).join("")}</select></div>
    <div><label>الحالة</label><select class="of-t">${ORD_ST.map(([v,l])=>`<option value="${v}" ${v===st.stt?"selected":""}>${l}</option>`).join("")}</select></div></div>
    <div class="two"><div><label>تاريخ الطلبية من</label><input type="date" class="of-f"></div><div><label>إلى</label><input type="date" class="of-e"></div></div>
    <label>بحث باسم الطلبية أو العميل أو الصنف أو اللون</label><input type="search" class="of-q" placeholder="اكتب جزء من الاسم">
  </div>
  <div class="kpis ok-k" data-ps="kpi">${skelKpis(4)}</div>
  <div class="card" data-ps="secs"><div class="sec-head"><h3>ملخص الأقسام</h3></div><div class="scroll ok-secs"></div></div>
  <div class="card" data-ps="list"><div class="sec-head"><h3>تفاصيل الطلبيات</h3></div><div class="ok-list"></div></div>
  <div class="actbar noprint"><button class="btn ib ok-x">${ib("download","تصدير Excel")}</button><button class="btn ghost ib ok-p">${ib("print","طباعة")}</button><button class="btn ghost ib ok-sh">${ib("share","مشاركة")}</button></div>`;
  const $=s=>root.querySelector(s);

  function build(){
    const rows=[];
    ORD_SECS.forEach(k=>{
      const d=st.data[k];if(!d||!d.ord)return;
      const bk=backlog(k,d);
      d.ord.forEach(o=>{
        const rem=Math.max(o.req-o.done,0),b=bk&&bk.by.get(o.id);
        const late=o.status==="open"&&(o.due?today()>o.due:isLate(o.status,o.date));
        const dd=o.due?daysBetween(today(),o.due):null; // موجب = باقي، سالب = متأخر
        rows.push({k,sec:SRC[k].name,color:SRC[k].color,id:o.id,gid:o.gid||null,item:o.item||"—",sub:o.sub||"",date:o.date,due:o.due,pc:o.pc||0,status:o.status,req:o.req,done:o.done,over:o.over||0,rem,
          pct:o.req?Math.min(100,Math.round(o.done/o.req*100)):0,late,dd,stalled:!!(b&&b.stalled),eta:b?b.eta:null});
      });
    });
    return mergeGroups(rows,st.gt);
  }
  function pass(r){
    if(st.sec&&r.k!==st.sec)return false;
    if(st.f&&(!r.date||r.date<st.f))return false;
    if(st.t&&(!r.date||r.date>st.t))return false;
    if(st.q&&!(r.q||r.item+" "+r.sub).toLowerCase().includes(st.q.toLowerCase()))return false;
    switch(st.stt){
      case"open":return r.status==="open";
      case"late":return r.late;
      case"stalled":return r.status==="open"&&r.stalled;
      case"pp":return r.pc>0;
      case"done":return r.status!=="open";
      case"dlv":return !!r.delivered;
      case"part":return !r.delivered&&!!(r.dvList&&r.dvList.length);
    }
    return true;
  }
  const dueCell=r=>{
    if(r.status!=="open")return r.due?`<span class="nums">${fmtDW(r.due)}</span>`:"—";
    if(!r.due)return '<span class="nums">بدون تاريخ</span>';
    const d=r.dd;
    return `${fmtDW(r.due)}<div>${d<0?`<span class="tag late">متأخرة ${-d} يوم</span>`:d===0?'<span class="tag late">النهارده</span>':`<span class="tag">باقي ${d} يوم</span>`}</div>`;
  };
  const stateTag0=r=>r.delivered?`<span class="tag ok">تم تسليم الطلبية</span>${r.secOpen?`<div><span class="tag">لسه مفتوحة في الأقسام</span></div>`:""}${dvDates(r)}${r.rem>0?`<div><span class="tag late">بعجز ${nf(r.rem)}</span></div>`:""}${r.dvNote?`<div class="nums" style="font-size:.78rem">${esc(r.dvNote)}</div>`:""}`:r.status!=="open"?'<span class="tag ok">مكتملة</span>':(r.late?'<span class="tag late">متأخرة</span> ':"")+(r.stalled?'<span class="tag late">راكدة</span> ':"")+(r.pc?`<span class="tag">اتأجلت ${r.pc}</span>`:"")||'<span class="nums">شغّالة</span>';
  const dvTimes=n=>n===1?"مرة واحدة":n===2?"مرتين":n<=10?n+" مرات":n+" مرة";
  const dvDates=r=>r.dvList&&r.dvList.length?`<div class="nums" style="font-size:.78rem">على ${dvTimes(r.dvList.length)}: ${r.dvList.map(x=>fmtDW(x.d)).join(" · ")}</div>`:(r.dvDate?`<div class="nums" style="font-size:.78rem">${fmtDW(r.dvDate)}</div>`:"");
  const stateTag=r=>{const b=stateTag0(r);return !r.delivered&&r.dvList&&r.dvList.length?b+`<div><span class="tag">تسليم جزئي · ${dvTimes(r.dvList.length)}</span></div>${dvDates(r)}`:b};
  const etaCell=r=>r.status!=="open"||!r.rem?"—":r.stalled?'<span class="tag late">راكدة</span>':r.eta!=null?"~ "+etaTxt(r.eta):'<span class="nums">لا إنتاج حديث</span>';

  function draw(){
    const all=st.rows,list=all.filter(pass);
    const ord=a=>a.status!=="open"?3:a.late?0:a.due?1:2;
    list.sort((a,b)=>ord(a)-ord(b)||(a.due||"9999").localeCompare(b.due||"9999")||(a.date||"").localeCompare(b.date||""));
    const open=list.filter(r=>r.status==="open"),done=list.length-open.length;
    const lateN=open.filter(r=>r.late).length,req=open.reduce((a,r)=>a+r.req,0),dn=open.reduce((a,r)=>a+Math.min(r.done,r.req),0),rem=open.reduce((a,r)=>a+r.rem,0);
    const pct=req?Math.round(dn/req*100):0;
    $(".ok-k").innerHTML=`<div class="kpi"><div class="kv">${nf(list.length)}</div><small>إجمالي الطلبيات</small></div>
      <div class="kpi"><div class="kv">${nf(open.length)}${lateN?` <small>(${lateN} متأخرة)</small>`:""}</div><small>مفتوحة</small></div>
      <div class="kpi"><div class="kv">${nf(done)}</div><small>مكتملة</small></div>
      <div class="kpi"><div class="kv">${nf(rem)}</div><small>المتبقي للإنجاز${open.length?` · ${pct}%`:""}</small></div>`;
    // ملخص الأقسام
    const sm=ORD_SECS.map(k=>{const L=list.filter(r=>r.k===k);if(!L.length&&!st.err[k])return null;const o=L.filter(r=>r.status==="open");
      return{k,n:L.length,o:o.length,l:o.filter(r=>r.late).length,d:L.length-o.length,rem:o.reduce((a,r)=>a+r.rem,0),req:o.reduce((a,r)=>a+r.req,0),dn:o.reduce((a,r)=>a+Math.min(r.done,r.req),0)}}).filter(Boolean);
    $(".ok-secs").innerHTML=sm.length?`<table><thead><tr><th>القسم</th><th>الكل</th><th>مفتوحة</th><th>متأخرة</th><th>مكتملة</th><th>المتبقي</th><th>الإنجاز</th></tr></thead><tbody>${sm.map(x=>{const p=x.req?Math.round(x.dn/x.req*100):0;return `<tr><td><span class="badge" style="--c:${SRC[x.k].color}">${SRC[x.k].name}</span>${st.err[x.k]?' <span class="tag late">تعذر التحميل</span>':""}</td><td>${nf(x.n)}</td><td>${nf(x.o)}</td><td>${x.l?`<b style="color:var(--bad,#b3261e)">${nf(x.l)}</b>`:"0"}</td><td>${nf(x.d)}</td><td><b>${nf(x.rem)}</b></td><td><div class="share"><div class="bar"><i style="width:${p}%;background:${SRC[x.k].color}"></i></div><span>${p}%</span></div></td></tr>`}).join("")}</tbody></table>`:'<div class="empty">مفيش طلبيات بالفلاتر دي</div>';
    // التفاصيل
    const CAP=400,lv=st.printing?list.slice(0,CAP):(st.more?list:list.slice(0,15));
    $(".ok-list").innerHTML=list.length?`<div class="scroll"><table><thead><tr><th>الطلبية</th><th>القسم</th><th>تاريخ الطلبية</th><th>التسليم</th><th>الإنجاز</th><th>المتبقي</th><th>الحالة</th><th>التقدير</th></tr></thead><tbody>${lv.map(r=>`<tr><td><b>${esc(r.item)}</b>${r.items?` <span class="tag">${r.n} أصناف</span>`:""}${r.items?r.items.map(i=>`<div class="nums" style="font-size:.8rem">• ${esc(i.item)}${i.sub?" ("+esc(i.sub)+")":""} — ${nf(i.done)}/${nf(i.req)}${i.st!=="open"?" ✓":""}${r.delivered&&i.rem>0?` <b style="color:var(--bad,#b3261e)">— عجز ${nf(i.rem)}</b>`:""}</div>`).join(""):r.sub?`<div class="nums" style="font-size:.8rem">${esc(r.sub)}</div>`:""}</td><td><span class="badge" style="--c:${r.color}">${r.sec}</span></td><td>${r.date?fmtDW(r.date):"—"}</td><td>${dueCell(r)}</td><td><div class="share"><div class="bar"><i style="width:${r.pct}%;background:${r.pct>=100?"var(--ok)":r.color}"></i></div><span>${r.pct}%</span></div><div class="nums" style="font-size:.78rem">${nf(Math.min(r.done,r.req))} من ${nf(r.req)}</div>${r.over>0?`<span class="tag late">زيادة +${nf(r.over)}</span>`:""}</td><td><b>${nf(r.rem)}</b></td><td>${stateTag(r)}</td><td>${etaCell(r)}</td></tr>`).join("")}</tbody></table></div>${st.printing?(list.length>CAP?`<div class="hint">اتعرض أول ${CAP} طلبية من ${nf(list.length)} — الباقي في ملف Excel.</div>`:""):(list.length>15?`<button class="btn ghost sm more noprint">${st.more?"عرض أقل":`عرض الكل (${list.length})`}</button>`:"")}<div class="hint" style="margin-top:4px">التقدير = المتبقي ÷ معدل إنتاج الصنف في آخر 14 يوم (بأيام الشغل). الطلبية «متأخرة» لو عدّى تاريخ تسليمها، ولو ملهاش تاريخ تسليم فلو عدّى عليها أكتر من ${LATE_DAYS} يوم.</div>`:'<div class="empty">مفيش طلبيات بالفلاتر دي</div>';
    const lb=ORD_ST.find(x=>x[0]===st.stt)[1];
    $(".rpd").textContent=(st.sec?SRC[st.sec].name:"كل الأقسام")+" · "+lb+(st.f||st.t?" · "+fmtP(st.f,st.t):"")+(st.q?" · بحث: "+st.q:"")+" · طُبع في "+fmtD(today());
    root.querySelector('[data-ps="secs"]').toggleAttribute("data-empty",!sm.length);
    root.querySelector('[data-ps="list"]').toggleAttribute("data-empty",!list.length);
    st.last={list,open,lateN,rem,pct,sm};
  }
  async function refresh(force){
    $(".ok-k").innerHTML=skelKpis(4);
    st.gt=await groupTitles(force);
    const res=await Promise.allSettled(ORD_SECS.map(k=>getData(k,force)));
    res.forEach((r,i)=>{const k=ORD_SECS[i];if(r.status==="fulfilled"){st.data[k]=r.value;delete st.err[k]}else{st.err[k]=true}});
    st.rows=build();draw();
  }
  $(".of-s").onchange=e=>{st.sec=e.target.value;st.more=false;draw()};
  $(".of-t").onchange=e=>{st.stt=e.target.value;st.more=false;draw()};
  $(".of-f").onchange=e=>{st.f=e.target.value;draw()};
  $(".of-e").onchange=e=>{st.t=e.target.value;draw()};
  let qt=null;$(".of-q").oninput=e=>{clearTimeout(qt);const v=e.target.value.trim();qt=setTimeout(()=>{st.q=v;st.more=false;draw()},200)};
  root.addEventListener("click",e=>{if(e.target.closest(".more")){st.more=!st.more;draw()}});
  $(".ok-x").onclick=()=>{
    if(!st.last)return;
    csvDownload(`تقرير-الطلبيات-${today()}.csv`,["القسم","الطلبية","الصنف","اللون/الكود","تاريخ الطلبية","تاريخ التسليم","المطلوب","المنتج","المتبقي","الإنجاز %","الحالة","مرات التأجيل"],
      st.last.list.flatMap(r=>r.items?r.items.map(i=>[r.sec,r.item,i.item,i.sub,r.date,r.due||"",i.req,i.done,i.rem,i.req?Math.min(100,Math.round(i.done/i.req*100)):0,r.delivered?(i.rem>0?"تم التسليم بعجز "+i.rem:"تم التسليم"):(r.dvList&&r.dvList.length&&i.st==="open")?"تسليم جزئي ("+r.dvList.length+")":i.st!=="open"?"مكتملة":r.late?"متأخرة":r.stalled?"راكدة":"شغّالة",r.pc]):[[r.sec,"",r.item,r.sub,r.date,r.due||"",r.req,Math.min(r.done,r.req),r.rem,r.pct,r.status!=="open"?"مكتملة":r.late?"متأخرة":r.stalled?"راكدة":"شغّالة",r.pc]]));
  };
  $(".ok-p").onclick=()=>{
    if(!st.last)return;const L=st.last;
    printDialog(root,"orders",[["kpi","الأرقام الرئيسية",true],["secs","ملخص الأقسام",L.sm.length>0],["list","تفاصيل الطلبيات",L.list.length>0]],{before(){st.printing=true;draw()},after(){st.printing=false;draw()}});
  };
  $(".ok-sh").onclick=()=>{
    if(!st.last)return;const{list,open,lateN,rem,sm}=st.last;
    const T=[`تقرير الطلبيات`,(st.sec?SRC[st.sec].name:"كل الأقسام")+" · "+ORD_ST.find(x=>x[0]===st.stt)[1],`الطلبيات: ${nf(list.length)} · مفتوحة: ${nf(open.length)} · متأخرة: ${nf(lateN)}`,`المتبقي للإنجاز: ${nf(rem)}`];
    if(sm.length>1)T.push("",...sm.map(x=>`• ${SRC[x.k].name}: ${nf(x.o)} مفتوحة${x.l?` (${x.l} متأخرة)`:""} · متبقي ${nf(x.rem)}`));
    const lt=list.filter(r=>r.late).slice(0,8);
    if(lt.length)T.push("","أهم المتأخرة:",...lt.map(r=>`• ${r.sec} · ${r.item}${r.sub?" ("+r.sub+")":""} — متبقي ${nf(r.rem)}${r.due?" · تسليم "+fmtDW(r.due):""}`));
    shareText(T.join("\n"));
  };
  refresh();
  return{refresh:(f=true)=>refresh(f)};
}

/* ---------- لوحة التقارير الشاملة ---------- */
function dashboard(rootId){
  const root=document.getElementById(rootId);
  const st={k:"month",f:"",t:"",data:{},err:{},moreT:false,moreC:false,moreL:false,printing:false,last:null};
  root.innerHTML=`
  <div class="print-head"><h2>${APP} — ملخص كل الأقسام</h2><div class="nums rpd"></div></div>
  <div class="card noprint">
    <div class="chips rch">${chipsHtml(st.k)}</div>
    <div class="two"><div><label>من</label><input type="date" class="rf"></div><div><label>إلى</label><input type="date" class="rt"></div></div>
  </div>
  <div class="secgrid rs" data-ps="secs">${Array.from({length:4},()=>'<i class="sk" style="height:96px;border-radius:14px"></i>').join("")}</div>
  <div class="card" data-ps="insights"><div class="sec-head"><h3 class="hi">${ui("sparkles")}<span>ملاحظات ذكية</span></h3></div><div class="rins"></div></div>
  <div class="card" data-ps="chart"><div class="sec-head"><h3>الإنتاج اليومي لكل الأقسام</h3></div><div class="rc"><i class="sk" style="height:170px"></i></div></div>
  <div class="card" data-ps="colors"><div class="sec-head"><h3>ألوان الرش</h3></div><div class="scroll rcol"></div></div>
  <div class="card" data-ps="top"><div class="sec-head"><h3>أعلى الأصناف</h3></div><div class="scroll rt2"></div></div>
  <div class="card" data-ps="late"><div class="sec-head"><h3>طلبيات متأخرة وراكدة</h3></div><div class="scroll rl"></div></div>
  <div class="card noprint"><h3>تصدير ونسخة احتياطية</h3>
    <div class="nums" style="margin-bottom:8px">خد نسخة من بياناتك بشكل دوري. ملف JSON فيه كل الجداول ويتحفظ عندك.</div>
    <div class="actbar x2"><button class="btn ib rx">${ib("download","تصدير Excel")}</button><button class="btn ghost ib rbk">${ib("db","نسخة احتياطية")}</button><button class="btn ghost ib rpr">${ib("print","طباعة")}</button><button class="btn ghost ib rsh">${ib("share","مشاركة")}</button></div></div>`;
  const $=s=>root.querySelector(s),$$=s=>root.querySelectorAll(s);
  const range=()=>rangeOf(st.k,st.f,st.t);
  const syncDates=()=>{if(st.k!=="custom")[$(".rf").value,$(".rt").value]=rangeOf(st.k)};

  function draw(){
    const[f,t]=range(),pr=prevRange(f,t);
    const per=KEYS.map(k=>{
      const d=st.data[k];if(!d)return{k,err:true};
      const rows=d.prod.filter(r=>inRange(r.d,f,t));
      const prevT=pr?sum(d.prod.filter(r=>inRange(r.d,pr[0],pr[1]))):null;
      const open=d.ord?d.ord.filter(o=>o.status==="open"):null;
      return{k,rows,total:sum(rows),prevT,delta:deltaOf(sum(rows),prevT),open,bk:backlog(k,d),late:open?open.filter(o=>isLate(o.status,o.date)).length:0};
    });
    $(".rs").innerHTML=per.map(p=>{
      const c=SRC[p.k];
      if(p.err)return `<a class="seccard" href="javascript:void(0)" onclick="location.reload()" style="--c:${c.color}"><div class="h">${ico(c.icon)}${c.name}</div><div class="sm">تعذر التحميل — اضغط للمحاولة</div></a>`;
      return `<a class="seccard" href="${c.page}#reports" style="--c:${c.color}"><div class="h">${ico(c.icon)}${c.name}</div><div class="big kv2">0</div><div class="sm">${c.noun} في الفترة</div>${p.delta?`<div class="kd ${p.delta[0]}">${p.delta[1]}</div>`:""}${p.open?`<div class="sm">${p.open.length} مفتوحة${p.late?` · <b style="color:var(--warn)">${p.late} متأخرة</b>`:""}</div>`:""}${p.bk&&p.bk.eta!=null?`<div class="sm">يخلص المتبقي في ~${etaTxt(p.bk.eta)}</div>`:""}</a>`;
    }).join("");
    $$(".rs .kv2").forEach((el,i)=>countUp(el,per.filter(p=>!p.err)[i].total));
    // رسم مجمّع
    const series=per.filter(p=>!p.err).map(p=>({name:SRC[p.k].name,color:SRC[p.k].color,rows:p.rows}));
    drawChart($(".rc"),{f,t,series});
    // ملاحظات ذكية على مستوى المصنع
    const ok=per.filter(p=>!p.err),I=[],gt=ok.reduce((a,p)=>a+p.total,0);
    if(gt>0){
      const lead=ok.slice().sort((a,b)=>b.total-a.total)[0];
      I.push(["info",`أعلى قسم إنتاجًا: <b>${SRC[lead.k].name}</b> بـ ${nf(lead.total)} (${pctOf(lead.total,gt)}% من الإجمالي ${nf(gt)}).`]);
    }
    ok.forEach(p=>{
      if(p.prevT==null)return;const c=SRC[p.k];
      if(p.prevT>0){const d=Math.round((p.total-p.prevT)/p.prevT*100);if(d<=-25)I.push(["warn",`إنتاج <b>${c.name}</b> نزل ${Math.abs(d)}% عن الفترة السابقة (${nf(p.prevT)} ← ${nf(p.total)}).`]);else if(d>=25)I.push(["ok",`إنتاج <b>${c.name}</b> زاد ${d}% عن الفترة السابقة.`])}
      else if(p.total===0&&f&&t&&daysBetween(f,t)>=2)I.push(["warn",`<b>${c.name}</b>: مفيش إنتاج في الفترة.`]);
    });
    const tl=ok.reduce((a,p)=>a+p.late,0),ts=ok.reduce((a,p)=>a+(p.bk?p.bk.stalled.length:0),0);
    if(tl)I.push(["warn",`فيه <b>${ordN(tl)}</b> متأخرة (أكتر من ${LATE_DAYS} يوم).`]);
    if(ts)I.push(["warn",`<b>${ordN(ts)}</b> راكدة من غير إنتاج 14 يوم: ${ok.filter(p=>p.bk&&p.bk.stalled.length).map(p=>SRC[p.k].name+" ("+p.bk.stalled.length+")").join("، ")}.`]);
    const sp=per.find(p=>p.k==="spray"&&!p.err);
    if(sp){
      const gc=groupSum(sp.rows.filter(r=>r.sub),"col",SRC.spray);
      if(gc.length)I.push(["info",`أكتر لون اترشّ: <b>${esc(gc[0][0])}</b> (${nf(gc[0][1])}).`]);
    }
    I.sort((a,b)=>({warn:0,ok:1,info:2}[a[0]]-{warn:0,ok:1,info:2}[b[0]]));
    $(".rins").innerHTML=I.length?insHtml(I.slice(0,8)):'<div class="empty">مفيش بيانات كفاية للملاحظات في الفترة دي</div>';
    $('[data-ps="insights"]').toggleAttribute("data-empty",!I.length);
    // ألوان الرش
    const sprRows=sp?sp.rows.filter(r=>r.sub):[];
    if(sprRows.length){
      const gc=groupSum(sprRows,"col",SRC.spray),tot=sum(sprRows),cl=showMore(gc,st.moreC||st.printing);
      $(".rcol").innerHTML=`<table><thead><tr><th>لون الرش</th><th>الكمية</th><th>النسبة</th></tr></thead><tbody>${cl.map(([k,v])=>{const p=pctOf(v,tot);return `<tr><td>${esc(k)}</td><td><b>${nf(v)}</b></td><td><div class="share"><div class="bar"><i style="width:${p}%;background:${SRC.spray.color}"></i></div><span>${p}%</span></div></td></tr>`}).join("")}</tbody><tfoot><tr><th>الإجمالي</th><th>${nf(tot)}</th><th></th></tr></tfoot></table>${gc.length>10&&!st.printing?`<button class="btn ghost sm more noprint" data-m="c">${st.moreC?"عرض أقل":`عرض الكل (${gc.length})`}</button>`:""}`;
    }else $(".rcol").innerHTML='<div class="empty">مفيش إنتاج رش في الفترة دي</div>';
    $('[data-ps="colors"]').toggleAttribute("data-empty",!sprRows.length);
    // أعلى الأصناف (كل الأقسام)
    const top=[];per.filter(p=>!p.err).forEach(p=>{const m=new Map();p.rows.forEach(r=>m.set(r.item,(m.get(r.item)||0)+r.qty));m.forEach((v,k)=>top.push({k,v,s:p.k}))});
    top.sort((a,b)=>b.v-a.v);const tv=showMore(top,st.moreT||st.printing);
    $(".rt2").innerHTML=top.length?`<table><thead><tr><th>الصنف</th><th>القسم</th><th>الكمية</th></tr></thead><tbody>${tv.map(x=>`<tr><td>${esc(x.k)}</td><td><span class="badge" style="--c:${SRC[x.s].color}">${SRC[x.s].name}</span></td><td><b>${nf(x.v)}</b></td></tr>`).join("")}</tbody></table>${top.length>10&&!st.printing?`<button class="btn ghost sm more noprint" data-m="t">${st.moreT?"عرض أقل":`عرض الكل (${top.length})`}</button>`:""}`:'<div class="empty">مفيش بيانات في الفترة دي</div>';
    $('[data-ps="top"]').toggleAttribute("data-empty",!top.length);
    // متأخرة وراكدة
    const late=[];per.forEach(p=>{if(p.open)p.open.forEach(o=>{const l=isLate(o.status,o.date),sl=p.bk&&p.bk.by.get(o.id),stl=!!(sl&&sl.stalled);if(l||stl)late.push({...o,s:p.k,late:l,stalled:stl})})});
    late.sort((a,b)=>(a.date||"").localeCompare(b.date||""));const ll=showMore(late,st.moreL||st.printing);
    $(".rl").innerHTML=late.length?`<table><thead><tr><th>الطلبية</th><th>القسم</th><th>العمر</th><th>المتبقي</th></tr></thead><tbody>${ll.map(o=>`<tr><td><b>${esc(o.item)}</b>${o.sub?`<div class="nums" style="font-size:.8rem">${esc(o.sub)}</div>`:""}</td><td><a href="${SRC[o.s].page}" class="badge" style="--c:${SRC[o.s].color};text-decoration:none">${SRC[o.s].name}</a></td><td>${o.late?'<span class="tag late">متأخرة</span> ':""}${o.stalled?'<span class="tag">راكدة</span> ':""}<span class="nums">${ageTxt(o.date)}</span></td><td><b>${nf(Math.max(o.req-o.done,0))}</b></td></tr>`).join("")}</tbody></table>${late.length>10&&!st.printing?`<button class="btn ghost sm more noprint" data-m="l">${st.moreL?"عرض أقل":`عرض الكل (${late.length})`}</button>`:""}`:`<div class="empty">مفيش طلبيات متأخرة أو راكدة</div>`;
    $('[data-ps="late"]').toggleAttribute("data-empty",!late.length);
    $(".rpd").textContent=fmtP(f,t)+" · طُبع في "+fmtD(today());
    st.last={f,t,per,top,late,I};
  }
  async function refresh(force){
    const res=await Promise.allSettled(KEYS.map(k=>getData(k,force)));
    res.forEach((r,i)=>{if(r.status==="fulfilled"){st.data[KEYS[i]]=r.value;delete st.err[KEYS[i]]}else{delete st.data[KEYS[i]];st.err[KEYS[i]]=1}});
    if(Object.keys(st.err).length===KEYS.length){
      $(".rs").innerHTML='<div class="empty err-state" style="grid-column:1/-1">تعذر تحميل التقارير<br><button class="btn sm rr">إعادة المحاولة</button></div>';
      $(".rr").onclick=()=>refresh(true);return;
    }
    syncDates();draw();
  }
  $(".rch").onclick=e=>{const b=e.target.closest(".chip");if(!b)return;st.k=b.dataset.k;$$(".rch .chip").forEach(c=>c.classList.toggle("on",c===b));syncDates();draw()};
  const custom=()=>{st.k="custom";st.f=$(".rf").value;st.t=$(".rt").value;$$(".rch .chip").forEach(c=>c.classList.remove("on"));draw()};
  $(".rf").onchange=custom;$(".rt").onchange=custom;
  root.addEventListener("click",e=>{const mo=e.target.closest(".more");if(!mo)return;const m=mo.dataset.m;if(m==="t")st.moreT=!st.moreT;else if(m==="c")st.moreC=!st.moreC;else st.moreL=!st.moreL;draw()});
  $(".rx").onclick=()=>{
    if(!st.last)return;const{f,t,per}=st.last;
    const rows=per.filter(p=>!p.err).flatMap(p=>p.rows.map(r=>[SRC[p.k].name,r.d,r.item,r.sub,r.qty,r.w||""])).sort((a,b)=>a[1].localeCompare(b[1]));
    csvDownload(`تقرير-الأقسام-${f||"الكل"}${t&&t!==f?"-"+t:""}.csv`,["القسم","التاريخ","الصنف","اللون/الكود (لون الرش في الرش)","الكمية","العامل"],rows);
  };
  $(".rbk").onclick=async e=>{
    const b=e.currentTarget;b.disabled=true;b.classList.add("loading");
    const TABLES=["free_production","glaze_orders","glaze_order_lines","glaze_production","glaze_order_increases","glaze_waste","deco_orders","deco_lines","deco_production","deco_increases","spray_orders","spray_production","repair_log"];
    try{
      const out={exported_at:new Date().toISOString(),tables:{},errors:{}};
      for(const tb of TABLES){try{out.tables[tb]=await all(tb,"*")}catch(er){out.errors[tb]=er.message||String(er)}}
      const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,1)],{type:"application/json"}));a.download=`نسخة-احتياطية-${today()}.json`;a.click();
      toast(Object.keys(out.errors).length?"تم التحميل مع تعذر بعض الجداول":"تم تحميل النسخة الاحتياطية");
    }finally{b.disabled=false;b.classList.remove("loading")}
  };
  $(".rpr").onclick=()=>{
    if(!st.last)return;const L=st.last;
    const has={secs:true,insights:L.I.length>0,chart:L.per.some(p=>!p.err&&p.total>0),colors:!$('[data-ps="colors"]').hasAttribute("data-empty"),top:L.top.length>0,late:L.late.length>0};
    printDialog(root,"dash",[["secs","كروت الأقسام",has.secs],["insights","الملاحظات الذكية",has.insights],["chart","الرسم البياني",has.chart],["colors","ألوان الرش",has.colors],["top","أعلى الأصناف",has.top],["late","طلبيات متأخرة وراكدة",has.late]],{before(){st.printing=true;draw()},after(){st.printing=false;draw()}});
  };
  $(".rsh").onclick=()=>{
    if(!st.last)return;const{f,t,per,late,I}=st.last;
    const w=I.filter(x=>x[0]==="warn").slice(0,3);
    shareText([`ملخص الأقسام`,`الفترة: ${fmtP(f,t)}`,...per.filter(p=>!p.err).map(p=>`• ${SRC[p.k].name}: ${nf(p.total)}`),`طلبيات متأخرة: ${late.filter(x=>x.late).length}`,...(w.length?["ملاحظات:",...w.map(x=>"• "+stripTags(x[1]))]:[])].join("\n"));
  };
  refresh();
  return{refresh:(f=true)=>refresh(f)};
}

return{shareText,mount,dashboard,ordersReport,sources:SRC,getData,backlog,ordN,editEntry,deleteEntry,actBtns,entryTxt,insHtml,printDialog,workerStats,groupSum,etaTxt};
})();
