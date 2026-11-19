/* ai.js — استدعاء mas-ai-hub. لا مفاتيح هنا: الجلسة تُرسل تلقائياً، والمفاتيح على الخادم فقط. */
// اسم الدالة المنشورة على Supabase (slug). غيّره هنا فقط إذا نشرتها باسم آخر.
const MAS_AI_FN="quick-function";
async function masAi(body){
  let r;
  try{r=await db.functions.invoke(MAS_AI_FN,{body})}catch(e){return{ok:false,msg:"تعذّر الاتصال بالمساعد",code:"network"}}
  if(!r.error)return{ok:true,data:r.data};
  let msg="تعذّر الاتصال بالمساعد",code="";
  try{const j=await r.error.context.json();msg=j.message||msg;code=j.error||""}catch(e){}
  if(!code&&/not.?found|404/i.test(String(r.error.message||"")))msg="الدالة "+MAS_AI_FN+" غير منشورة بعد على Supabase.";
  return{ok:false,msg,code};
}
