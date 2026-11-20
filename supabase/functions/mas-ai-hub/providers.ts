// طبقة موحدة للمزودين. لإضافة مزود جديد: انظر docs/AI_HUB_ADD_PROVIDER_AR.md
import { classifyHttp, ProviderError } from "./policy.ts";

export interface CallOpts { system: string; prompt: string; timeoutMs: number; image?: { mime: string; data: string }; json?: boolean; }
export interface CallResult { text: string; model: string; }
export interface Provider {
  id: string;            // معرّف يُخزَّن في ai_settings
    label: string;
      envKey: string;        // اسم Secret
        call(key: string, o: CallOpts, f?: typeof fetch): Promise<CallResult>;
        }

        async function post(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number, f: typeof fetch) {
          const ac = new AbortController();
            const t = setTimeout(() => ac.abort(), timeoutMs);
              try {
                  return await f(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: ac.signal });
                    } catch (e) {
                        if ((e as Error)?.name === "AbortError") throw new ProviderError("timeout", null, "timeout");
                            throw new ProviderError("transient", null, "network error");
                              } finally { clearTimeout(t); }
                              }
                              // رسالة خطأ آمنة: بلا مفاتيح ولا نص طويل
                              async function errMsg(r: Response): Promise<string> {
                                try { return (await r.text()).replace(/AIza[\w-]{20,}|gsk_[\w]{20,}/g, "[key]").slice(0, 300); } catch { return ""; }
                                }

                                export const gemini: Provider = {
                                  id: "gemini", label: "Google Gemini", envKey: "GEMINI_API_KEY",
                                    async call(key, o, f = fetch) {
                                        const model = Deno_env("GEMINI_MODEL") || "gemini-flash-latest";
                                            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
                                                const r = await post(url, { "X-goog-api-key": key },
                                                      { systemInstruction: { parts: [{ text: o.system }] },
                                                              contents: [{ parts: [{ text: o.prompt }, ...(o.image ? [{ inlineData: { mimeType: o.image.mime, data: o.image.data } }] : [])] }],
                                                                      ...(o.json ? { generationConfig: { responseMimeType: "application/json", temperature: 0 } } : {}) }, o.timeoutMs, f);
                                                                          if (!r.ok) throw new ProviderError(classifyHttp(r.status), r.status, await errMsg(r));
                                                                              const j = await r.json();
                                                                                  if (j?.promptFeedback?.blockReason) throw new ProviderError("safety", 200, "blocked: " + j.promptFeedback.blockReason);
                                                                                      const c = j?.candidates?.[0];
                                                                                          if (c?.finishReason === "SAFETY" || c?.finishReason === "PROHIBITED_CONTENT") throw new ProviderError("safety", 200, "blocked: " + c.finishReason);
                                                                                              const text = (c?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("").trim();
                                                                                                  if (!text) throw new ProviderError("empty", 200, "empty response");
                                                                                                      return { text, model };
                                                                                                        },
                                                                                                        };

                                                                                                        export const groq: Provider = {
                                                                                                          id: "groq", label: "Groq", envKey: "GROQ_API_KEY",
                                                                                                            async call(key, o, f = fetch) {
                                                                                                                const model = Deno_env("GROQ_MODEL")?.trim() || "llama-3.3-70b-versatile";
                                                                                                                    const r = await post("https://api.groq.com/openai/v1/chat/completions", { Authorization: `Bearer ${key}` },
                                                                                                                          { model, temperature: 0.2, max_completion_tokens: 1500, ...(o.json ? { response_format: { type: "json_object" } } : {}), messages: [{ role: "system", content: o.system }, { role: "user", content: o.prompt }] }, o.timeoutMs, f);
                                                                                                                              if (!r.ok) throw new ProviderError(classifyHttp(r.status), r.status, await errMsg(r));
                                                                                                                                  const j = await r.json();
                                                                                                                                      const text = String(j?.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
                                                                                                                                          if (!text) throw new ProviderError("empty", 200, "empty response");
                                                                                                                                              return { text, model };
                                                                                                                                                },
                                                                                                                                                };

                                                                                                                                                // يعمل في Deno وفي Node (للاختبار)
                                                                                                                                                function Deno_env(k: string): string | undefined {
                                                                                                                                                  // deno-lint-ignore no-explicit-any
                                                                                                                                                    const g: any = globalThis;
                                                                                                                                                      return g.Deno?.env?.get?.(k) ?? g.process?.env?.[k];
                                                                                                                                                      }

                                                                                                                                                      // مزود ثالث لاحقاً: أضِفه هنا فقط.
                                                                                                                                                      export const REGISTRY: Record<string, Provider> = { gemini, groq };
                                                                                                                                                      export const keyFor = (p: Provider) => Deno_env(p.envKey);
                                                                                                                                                      