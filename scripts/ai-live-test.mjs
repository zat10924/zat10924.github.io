// اختبار اتصال حقيقي مباشر بالمحركين من جهازك (يحتاج إنترنت). لا يُشغَّل داخل المتصفح.
// الاستخدام:  GEMINI_API_KEY=... GROQ_API_KEY=... node scripts/ai-live-test.mjs
import { gemini, groq } from "../supabase/functions/mas-ai-hub/providers.ts";
import { runChain } from "../supabase/functions/mas-ai-hub/orchestrator.ts";
const O = { system: "Reply with the single word OK.", prompt: "ping", timeoutMs: 20000 };
const keys = { gemini: process.env.GEMINI_API_KEY, groq: process.env.GROQ_API_KEY };
const hooks = { getKey: (p) => keys[p.id], onError: (p, e) => console.log("  خطأ", p.id, e.cls, e.status), onFailover: (a, b, r) => console.log("  تحويل", a.id, "→", b.id, r) };
for (const p of [gemini, groq]) {
  const t = Date.now(); const r = await runChain([p], O, hooks);
  console.log(p.id, r.ok ? `OK ${Date.now() - t}ms «${r.text.slice(0, 40)}»` : `FAIL ${r.error.cls}`);
}
// اختبار التحويل الحقيقي: مفتاح Gemini خاطئ عمداً لا يجب أن يحوّل (401)، ومهلة 1ms يجب أن تحوّل إلى Groq
keys.gemini = "invalid-key-for-test";
let r = await runChain([gemini, groq], O, hooks);
console.log("مفتاح خاطئ → متوقع: فشل بلا تحويل:", r.ok ? "تحويل (غير متوقع!)" : `${r.error.cls} failover=${r.failover}`);
keys.gemini = process.env.GEMINI_API_KEY;
r = await runChain([gemini, groq], { ...O, timeoutMs: 1 }, hooks);
console.log("مهلة 1ms → متوقع: تحويل إلى Groq بنجاح (مع مهلة Groq أيضاً 1ms فقد يفشل؛ جرّب بالواجهة)", r.ok ? r.provider : r.error.cls);
