/* إعدادات الذكاء الاصطناعي (للمدير فقط) — تُحقن داخل قسم «البيانات» في settings.html */
(function(){
  const $=id=>document.getElementById(id);
  const PN={gemini:"Google Gemini",groq:"Groq",openrouter:"OpenRouter"};
  const dt=t=>new Date(t).toLocaleString("ar-EG",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
  let ST=null;

  async function load(){
    const[{data:s,error:e1},r]=await Promise.all([db.from("ai_settings").select("*").eq("id",1).maybeSingle(),masAi({action:"status"})]);
    if(e1){$("ai_state").textContent=e1.code==="42P01"?"شغّل ملف الـ Migration أولاً (20261118_mas_ai_hub.sql).":"تعذر التحميل: "+e1.message;return}
    ST=s;
    const FALLBACK=[{id:"gemini",label:"Google Gemini",key_configured:null},{id:"groq",label:"Groq",key_configured:null}];
    const okList=r.ok&&r.data&&Array.isArray(r.data.providers);
    const prov=okList?r.data.providers:FALLBACK;
    const opts=(sel,withNone)=>(withNone?'<option value="">— بدون —</option>':"")+prov.map(p=>`<option value="${esc(p.id)}"${p.id===sel?" selected":""}>${esc(p.label)}</option>`).join("");
    $("ai_en").checked=!!s.enabled;
    $("ai_pri").innerHTML=opts(s.primary_provider);
    $("ai_fb").innerHTML=opts(s.fallback_provider,true);
    $("ai_auto").checked=!!s.auto_failover;
    $("ai_to").value=Math.round(s.timeout_ms/1000);
    $("ai_lu").value=s.daily_limit_user;$("ai_lt").value=s.daily_limit_total;
    $("ai_state").textContent=okList?"":(r.ok||r.code==="unknown_action")
      ?"⚠ نسخة الدالة mas-ai-hub على Supabase قديمة (لا تعرف أمر status). أعد نشرها من ملفات phase3b. القائمة المعروضة افتراضية."
      :"⚠ تعذّر قراءة حالة المحركات: "+r.msg+" — القائمة المعروضة افتراضية.";
    $("ai_eng").innerHTML=prov.map(p=>`<div class="line fe"><span>${esc(p.label)} <span class="nums">· ${p.key_configured===null?"الحالة غير معروفة":p.key_configured?"المفتاح مضبوط":"المفتاح غير مضبوط"}</span></span><button class="btn ghost sm" data-t="${esc(p.id)}"${p.key_configured===false?" disabled":""}>اختبار الاتصال</button><span class="nums" id="ai_r_${esc(p.id)}"></span></div>`).join("");
    logs();
  }
  async function logs(){
    const[u,e,f]=await Promise.all([
      db.from("ai_usage_log").select("created_at,task,provider,status,latency_ms,failover").order("id",{ascending:false}).limit(15),
      db.from("ai_error_log").select("created_at,provider,error_class,http_status").order("id",{ascending:false}).limit(15),
      db.from("ai_failover_log").select("created_at,from_provider,to_provider,reason").order("id",{ascending:false}).limit(10)]);
    const row=(a,b)=>`<div class="line fe"><span>${a}</span><span class="nums">${b}</span></div>`;
    $("ai_ul").innerHTML=(u.data||[]).map(r=>row(dt(r.created_at)+" · "+esc(r.task||"—"),esc(PN[r.provider]||r.provider||"—")+" · "+esc(r.status)+(r.latency_ms?" · "+r.latency_ms+"ms":"")+(r.failover?" · تحويل":""))).join("")||'<small class="hint">لا استخدام بعد.</small>';
    $("ai_el").innerHTML=(e.data||[]).map(r=>row(dt(r.created_at),esc(PN[r.provider]||r.provider||"—")+" · "+esc(r.error_class||"")+(r.http_status?" · "+r.http_status:""))).join("")||'<small class="hint">لا أخطاء.</small>';
    $("ai_fl").innerHTML=(f.data||[]).map(r=>row(dt(r.created_at),esc(r.from_provider)+" ← "+esc(r.to_provider)+" · "+esc(r.reason))).join("")||'<small class="hint">لا تحويلات.</small>';
  }
  async function save(){
    const b=$("ai_save");b.disabled=true;
    const fb=$("ai_fb").value||null;
    if(fb&&fb===$("ai_pri").value){toast("المحرك الاحتياطي يجب أن يختلف عن الأساسي","bad");b.disabled=false;return}
    const{error}=await db.from("ai_settings").update({
      enabled:$("ai_en").checked,primary_provider:$("ai_pri").value,fallback_provider:fb,auto_failover:$("ai_auto").checked,
      timeout_ms:Math.min(60,Math.max(3,+$("ai_to").value||20))*1000,
      daily_limit_user:Math.max(1,+$("ai_lu").value||30),daily_limit_total:Math.max(1,+$("ai_lt").value||300)}).eq("id",1);
    b.disabled=false;
    toast(error?"تعذر الحفظ: "+error.message:"تم حفظ إعدادات الذكاء الاصطناعي",error?"bad":undefined);
  }
  window.aiSettingsInit=function(){
    if(!ME||ME.role!=="admin"||!$("ai_card"))return;
    $("ai_card").hidden=false;
    $("ai_save").onclick=save;
    $("ai_refresh").onclick=load;
    $("ai_eng").onclick=async e=>{
      const b=e.target.closest("[data-t]");if(!b)return;
      const id=b.dataset.t,out=$("ai_r_"+id);b.disabled=true;out.textContent="جارٍ الاختبار…";
      const r=await masAi({action:"test",provider:id});
      b.disabled=false;
      out.textContent=!r.ok?"فشل: "+r.msg:r.data.ok?"يعمل ✓ "+r.data.latency_ms+"ms":"فشل: "+r.data.error_class+(r.data.http_status?" "+r.data.http_status:"");
      logs();
    };
    load();
  };
})();
