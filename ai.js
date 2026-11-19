/* ai.js — استدعاء mas-ai-hub. لا مفاتيح هنا: الجلسة تُرسل تلقائياً، والمفاتيح على الخادم فقط. */
// اسم الدالة المنشورة على Supabase (slug). موحّد مع supabase/functions/mas-ai-hub.
const MAS_AI_FN="mas-ai-hub";
const _aiWait=ms=>new Promise(r=>setTimeout(r,ms));
async function masAi(body,opt={}){
  if(!navigator.onLine)return{ok:false,msg:"مفيش اتصال بالإنترنت",code:"offline"};
  const tries=opt.retries??(body&&body.action==="ask"?1:0);
  let last={ok:false,msg:"تعذّر الاتصال بالمساعد",code:"network"};
  for(let i=0;i<=tries;i++){
    let r;
    try{r=await db.functions.invoke(MAS_AI_FN,{body})}catch(e){last={ok:false,msg:"تعذّر الاتصال بالمساعد",code:"network"};if(i<tries)await _aiWait(800*(i+1));continue}
    if(!r.error)return{ok:true,data:r.data};
    let msg="تعذّر الاتصال بالمساعد",code="",status=0;
    try{status=r.error.context.status||0;const j=await r.error.context.json();msg=j.message||msg;code=j.error||""}catch(e){}
    if(!code&&(status===404||/not.?found|404/i.test(String(r.error.message||""))))msg="الدالة "+MAS_AI_FN+" غير منشورة بعد على Supabase.";
    last={ok:false,msg,code,status};
    // نعيد المحاولة فقط للأعطال المؤقتة (502/503/504 أو شبكة)، مش للصلاحيات أو الحدود
    if(i<tries&&(status===502||status===503||status===504||!status))await _aiWait(800*(i+1));else break;
  }
  return last;
}
