# إضافة محرك ذكاء اصطناعي جديد

1. في `providers.ts` أنشئ كائنًا من نوع `Provider`:
   ```ts
   export const mistral: Provider = {
     id: "mistral", label: "Mistral", envKey: "MISTRAL_API_KEY",
     async call(key, o, f = fetch) {
       const r = await post("https://api.mistral.ai/v1/chat/completions", { Authorization: `Bearer ${key}` },
         { model: "...", messages: [{ role: "system", content: o.system }, { role: "user", content: o.prompt }] }, o.timeoutMs, f);
       if (!r.ok) throw new ProviderError(classifyHttp(r.status), r.status, await errMsg(r));
       const text = String((await r.json())?.choices?.[0]?.message?.content ?? "").trim();
       if (!text) throw new ProviderError("empty", 200, "empty response");
       return { text, model: "..." };
     },
   };
   ```
2. سجّله: `REGISTRY = { gemini, groq, mistral }`.
3. `supabase secrets set MISTRAL_API_KEY=...` ثم أعد نشر الدالة.
4. أضف اختبارين في `tests/ai-hub.test.mjs` (نجاح + تحويل عند 503).
5. يظهر المحرك تلقائيًا في الإعدادات. (لا يلزم تعديل SQL: قيد الأسماء عام.)
6. لسلسلة من ثلاثة محركات: أضف مزودًا ثالثًا في `chain` داخل `index.ts`؛ `runChain` يدعم أي طول.
