/* MAS AI HUB — مساعد قراءة وتحليل فقط. لا يحتوي على مفاتيح مزودي الذكاء الاصطناعي. */
(() => {
  "use strict";
  const ENDPOINT = `${SUPABASE_URL}/functions/v1/mas-ai-hub`;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const css = `
  #mas-ai-launch{position:fixed;z-index:9900;bottom:20px;left:20px;border:0;border-radius:999px;background:linear-gradient(135deg,#6e2735,#35131e);color:#fff;padding:12px 17px;box-shadow:0 8px 28px #25101838;display:flex;align-items:center;gap:9px;font:inherit;font-weight:700;font-size:14px;cursor:pointer}
  #mas-ai-launch svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  #mas-ai-panel{position:fixed;z-index:9901;left:18px;bottom:78px;width:min(410px,calc(100vw - 28px));height:min(590px,calc(100dvh - 110px));background:var(--card,#fff);color:var(--txt,#241d20);border:1px solid var(--line,#e5dce0);border-radius:18px;box-shadow:0 18px 60px #180b1240;display:none;overflow:hidden;direction:rtl;font-family:inherit}
  #mas-ai-panel.open{display:flex;flex-direction:column}
  #mas-ai-panel .mah{display:flex;align-items:center;gap:10px;padding:14px 15px;background:linear-gradient(135deg,#642631,#3d1822);color:#fff}
  #mas-ai-panel .mai{width:38px;height:38px;border-radius:12px;background:#ffffff20;display:grid;place-items:center;font-size:21px}
  #mas-ai-panel .mat{flex:1;min-width:0}#mas-ai-panel .mat b{display:block;font-size:15px}#mas-ai-panel .mat small{opacity:.8;font-size:11px}
  #mas-ai-panel .maclose{border:0;background:#ffffff18;color:white;border-radius:9px;width:34px;height:34px;font-size:22px;cursor:pointer}
  #mas-ai-panel .mahint{padding:9px 13px;background:var(--soft,#f7f2f4);font-size:11px;color:var(--muted,#766b70);border-bottom:1px solid var(--line,#e5dce0)}
  #mas-ai-panel .mamsg{flex:1;overflow:auto;padding:13px;display:flex;flex-direction:column;gap:10px}
  #mas-ai-panel .mabubble{max-width:92%;padding:10px 12px;border-radius:13px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;font-size:13px}
  #mas-ai-panel .mabubble.bot{align-self:flex-start;background:var(--soft,#f6f1f3);border:1px solid var(--line,#e9e0e3)}
  #mas-ai-panel .mabubble.user{align-self:flex-end;background:#642631;color:#fff}
  #mas-ai-panel .mafoot{padding:10px;border-top:1px solid var(--line,#e5dce0);display:flex;gap:8px;align-items:flex-end}
  #mas-ai-panel textarea{flex:1;min-height:43px;max-height:110px;resize:vertical;border:1px solid var(--line,#ddd);border-radius:11px;padding:10px;background:var(--bg,#fff);color:inherit;font:inherit;font-size:13px;outline:none}
  #mas-ai-panel textarea:focus{border-color:#8b4655;box-shadow:0 0 0 3px #8b46551a}
  #mas-ai-panel .masend{height:43px;min-width:48px;border:0;border-radius:11px;background:#642631;color:#fff;font-size:18px;cursor:pointer}
  #mas-ai-panel .masend:disabled{opacity:.45;cursor:wait}
  #mas-ai-panel .maprov{font-size:10px;color:var(--muted,#766b70);padding:0 13px 8px}
  @media(max-width:520px){#mas-ai-launch{bottom:14px;left:14px;padding:11px 14px}#mas-ai-panel{left:10px;bottom:70px;width:calc(100vw - 20px);height:min(650px,calc(100dvh - 88px))}}
  `;
  function addStyles(){ if(document.getElementById("mas-ai-css"))return; const s=document.createElement("style");s.id="mas-ai-css";s.textContent=css;document.head.appendChild(s); }
  function init(){
    if(typeof ME === "undefined" || !ME || !ME.id || ME.active===false || document.getElementById("mas-ai-launch"))return;
    addStyles();
    const launch=document.createElement("button");launch.id="mas-ai-launch";launch.type="button";launch.setAttribute("aria-label","فتح مساعد MAS الذكي");
    launch.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 13.8 9.2 20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Z"/><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"/></svg><span>مساعد MAS</span>';
    const panel=document.createElement("section");panel.id="mas-ai-panel";panel.setAttribute("aria-label","مساعد MAS الذكي");
    panel.innerHTML='<header class="mah"><div class="mai">✦</div><div class="mat"><b>MAS AI HUB</b><small>مساعد التشغيل والتحليل</small></div><button class="maclose" type="button" aria-label="إغلاق">×</button></header><div class="mahint">قراءة وتحليل وتقارير فقط · يلتزم بصلاحيات حسابك الحالية</div><div class="mamsg" aria-live="polite"><div class="mabubble bot">أهلًا بك. اسألني عن الإنتاج أو الطلبيات أو الهالك أو الحريق أو التسليم، وسأجيب وفق البيانات التي تسمح صلاحياتك بقراءتها.</div></div><div class="maprov" aria-live="polite">المزود: يتم تحديده تلقائيًا عند إرسال السؤال</div><form class="mafoot"><textarea maxlength="1800" placeholder="اكتب سؤالك هنا…" aria-label="اكتب سؤالك"></textarea><button class="masend" type="submit" aria-label="إرسال">➤</button></form>';
    document.body.append(launch,panel);
    const messages=panel.querySelector(".mamsg"),form=panel.querySelector("form"),input=panel.querySelector("textarea"),send=panel.querySelector(".masend"),provider=panel.querySelector(".maprov");
    const add=(txt,who)=>{const d=document.createElement("div");d.className="mabubble "+who;d.textContent=txt;messages.appendChild(d);messages.scrollTop=messages.scrollHeight;return d;};
    const toggle=(v)=>{panel.classList.toggle("open",v);launch.style.display=v?"none":"flex";if(v)input.focus();};
    launch.addEventListener("click",()=>toggle(true));panel.querySelector(".maclose").addEventListener("click",()=>toggle(false));
    form.addEventListener("submit",async e=>{
      e.preventDefault();const message=input.value.trim();if(!message||send.disabled)return;
      add(message,"user");input.value="";send.disabled=true;provider.textContent="جارٍ قراءة البيانات المسموح بها وتحليلها…";
      const wait=add("جاري إعداد الإجابة…","bot");
      try{
        const {data:{session}}=await db.auth.getSession();
        if(!session?.access_token)throw new Error("انتهت جلسة الدخول. سجّل الدخول مجددًا.");
        const res=await fetch(ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token,"apikey":SUPABASE_KEY},body:JSON.stringify({message,page:location.pathname.split("/").pop()||"index.html"})});
        const payload=await res.json().catch(()=>({}));
        if(!res.ok)throw new Error(payload.message||"تعذر الاتصال بمساعد MAS.");
        wait.textContent=payload.answer||"لم يصل رد من المساعد.";
        provider.textContent="المزود المستخدم: "+(payload.provider==="groq"?"Groq الاحتياطي":"Gemini")+" · البيانات: "+((payload.data_tables||[]).join("، ")||"لم تتوفر بيانات مقروءة");
      }catch(err){wait.textContent=err.message||"حدث خطأ غير متوقع.";provider.textContent="تعذر إكمال الطلب";}
      finally{send.disabled=false;input.focus();messages.scrollTop=messages.scrollHeight;}
    });
    input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();form.requestSubmit();}});
  }
  let tries=0;const wait=()=>{if(typeof ME !== "undefined" && ME?.id){init();return;}if(++tries<40)setTimeout(wait,250);};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",wait,{once:true});else wait();
  // Login can happen after the initial page load; mount the assistant once the app finishes loading the profile.
  try { db.auth.onAuthStateChange((event)=>{
    if(event==="SIGNED_IN"){tries=0;setTimeout(wait,350);}
    if(event==="SIGNED_OUT"){document.getElementById("mas-ai-launch")?.remove();document.getElementById("mas-ai-panel")?.remove();}
  }); } catch (_) {}
})();
