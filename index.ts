// mas-ai-hub — بوابة الذكاء الاصطناعي لـ MAS. المفاتيح من Secrets فقط، والبيانات بصلاحية المستخدم (RLS).
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildPrompt, buildSsml, clampRate, detectTask, safeVoice, SYSTEM_PROMPT, validateAsk } from "./policy.ts";
import { keyFor, REGISTRY } from "./providers.ts";
import { runChain } from "./orchestrator.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // يُحقن تلقائياً في الخادم فقط
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const ALLOWED_ROLES = ["admin", "owner"]; // للتوسيع لاحقاً أضف "manager" هنا وفي canSee بـ common.js

function cors(req: Request) {
  const o = req.headers.get("origin") ?? "";
  const allow = ORIGINS.length === 0 ? "*" : ORIGINS.includes(o) ? o : ORIGINS[0];
  return { "Access-Control-Allow-Origin": allow, "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS" };
}
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json; charset=utf-8" } });

const cairoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method" }, 405);

  // 1) الجلسة
  const auth = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(auth)) return json(req, { error: "unauthenticated" }, 401);
  const userDb = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u, error: ue } = await userDb.auth.getUser();
  if (ue || !u?.user) return json(req, { error: "unauthenticated" }, 401);
  const uid = u.user.id;
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  // 2) الصلاحية
  const { data: prof } = await admin.from("profiles").select("role,active").eq("id", uid).maybeSingle();
  if (!prof || prof.active === false || !ALLOWED_ROLES.includes(prof.role)) return json(req, { error: "forbidden" }, 403);
  const isAdmin = prof.role === "admin";

  let body: any;
  try { body = await req.json(); } catch { return json(req, { error: "bad_json" }, 400); }
  const action = body?.action ?? "ask";

  const log = async (table: string, row: Record<string, unknown>) => {
    try { await admin.from(table).insert({ user_id: uid, ...row }); } catch (_) { /* لا نكسر الطلب بسبب التسجيل */ }
  };
  const { data: st } = await admin.from("ai_settings").select("*").eq("id", 1).maybeSingle();
  const s = st ?? { enabled: true, primary_provider: "gemini", fallback_provider: "groq", auto_failover: true,
    timeout_ms: 20000, daily_limit_user: 30, daily_limit_total: 300 };

  const hooks = {
    getKey: keyFor,
    onError: (p: any, e: any) => log("ai_error_log", { provider: p.id, error_class: e.cls, http_status: e.status, message: String(e.message).slice(0, 300) }),
    onFailover: (a: any, b: any, reason: string) => log("ai_failover_log", { from_provider: a.id, to_provider: b.id, reason }),
  };

  // ---- الإدارة: حالة المحركات (دون كشف أي مفتاح) ----
  if (action === "status") {
    if (!isAdmin) return json(req, { error: "forbidden" }, 403);
    return json(req, {
      enabled: s.enabled, primary: s.primary_provider, fallback: s.fallback_provider, auto_failover: s.auto_failover,
      providers: Object.values(REGISTRY).map((p) => ({ id: p.id, label: p.label, key_configured: !!keyFor(p) })),
    });
  }

  // ---- الإدارة: اختبار اتصال حقيقي بمحرك ----
  if (action === "test") {
    if (!isAdmin) return json(req, { error: "forbidden" }, 403);
    const p = REGISTRY[String(body?.provider ?? "")];
    if (!p) return json(req, { error: "unknown_provider" }, 400);
    const t0 = Date.now();
    const r = await runChain([p], { system: "Reply with the single word OK.", prompt: "ping", timeoutMs: s.timeout_ms }, hooks);
    const ms = Date.now() - t0;
    await log("ai_usage_log", { task: "test", provider: p.id, model: r.ok ? r.model : null, status: r.ok ? "ok" : "error", latency_ms: ms });
    return json(req, r.ok ? { ok: true, provider: p.id, latency_ms: ms }
                          : { ok: false, provider: p.id, latency_ms: ms, error_class: r.error.cls, http_status: r.error.status });
  }

  // ---- صوت المساعد: Azure Speech بصوت مصري (ar-EG-SalmaNeural افتراضيًا) ----
  if (action === "speak") {
    const key = Deno.env.get("AZURE_SPEECH_KEY")?.trim();
    const region = Deno.env.get("AZURE_SPEECH_REGION")?.trim() ?? "";
    if (!key || !/^[a-z0-9-]{3,30}$/i.test(region)) return json(req, { error: "no_key", message: "الصوت المصري غير مفعّل بعد." }, 503);
    const text = String(body?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
    if (text.length < 2) return json(req, { error: "bad_request", message: "لا يوجد نص." }, 400);
    const voice = safeVoice(body?.voice ?? Deno.env.get("AZURE_TTS_VOICE"));
    const ssml = buildSsml(text, voice, clampRate(body?.rate));
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: "POST", signal: ctl.signal,
        headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "mas-ai-hub" },
        body: ssml,
      });
      if (!r.ok) {
        await log("ai_error_log", { provider: "azure", error_class: "tts_" + r.status, http_status: r.status, message: (await r.text()).slice(0, 200) });
        return json(req, { error: "tts_failed", message: "تعذّر توليد الصوت." }, 503);
      }
      const buf = new Uint8Array(await r.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      await log("ai_usage_log", { task: "tts", provider: "azure", model: voice, status: "ok", response_chars: text.length });
      return json(req, { audio: btoa(bin), mime: "audio/mpeg", voice });
    } catch (_) {
      return json(req, { error: "tts_failed", message: "تعذّر توليد الصوت." }, 503);
    } finally { clearTimeout(to); }
  }

  if (action !== "ask") return json(req, { error: "unknown_action" }, 400);

  // ---- سؤال ----
  if (!s.enabled) return json(req, { error: "disabled", message: "المساعد الذكي موقوف من الإعدادات." }, 503);
  const v = validateAsk(body, cairoToday());
  if (!v.ok) return json(req, { error: "bad_request", message: v.error }, 400);

  // حدود الاستهلاك
  const since = cairoToday() + "T00:00:00+02:00";
  const cnt = async (user?: string) => {
    let q = admin.from("ai_usage_log").select("id", { count: "exact", head: true }).eq("status", "ok").neq("task", "test").neq("task", "tts").gte("created_at", since);
    if (user) q = q.eq("user_id", user);
    return (await q).count ?? 0;
  };
  const [mine, all] = await Promise.all([cnt(uid), cnt()]);
  if (mine >= s.daily_limit_user || all >= s.daily_limit_total) {
    await log("ai_usage_log", { task: "quota", status: "quota" });
    return json(req, { error: "quota", message: "تم بلوغ حد الاستخدام اليومي." }, 429);
  }

  const task = detectTask(v.q);
  // بيانات بصلاحية المستخدم: RLS تُطبَّق لأن الاستدعاء بتوكنه (لا service role)
  const { data: facts, error: fe } = await userDb.rpc("mas_ai_facts", { p_from: v.from, p_to: v.to, p_secs: v.secs });
  if (fe) {
    await log("ai_error_log", { provider: null, error_class: "data", message: fe.message?.slice(0, 300) });
    return json(req, { error: "data", message: "تعذّر تحميل بيانات المصنع." }, 502);
  }
  let notes: string[] = [];
  if (task === "inventory") notes.push("تنبيه: لا توجد في النظام حالياً جداول أرصدة مخزون؛ لا تذكر أي أرصدة.");
  if (task === "orders") notes.push("تنبيه: بيانات الطلبيات غير مرفقة في هذه النسخة؛ اعتمد على الإنتاج فقط وصرّح بالنقص.");
  let payload = facts;
  if (JSON.stringify(payload).length > 60000) { payload = { ...facts, daily_production: [] }; notes.push("حُذف التفصيل اليومي لضيق الحجم."); }
  const prompt = buildPrompt(v.q, task, payload, notes.join("\n"));

  const chain = [REGISTRY[s.primary_provider]];
  if (s.auto_failover && s.fallback_provider && REGISTRY[s.fallback_provider]) chain.push(REGISTRY[s.fallback_provider]);
  if (!chain[0]) return json(req, { error: "config", message: "المحرك الأساسي غير معرّف." }, 500);

  const t0 = Date.now();
  const r = await runChain(chain, { system: SYSTEM_PROMPT, prompt, timeoutMs: s.timeout_ms }, hooks);
  const ms = Date.now() - t0;
  if (r.ok) {
    await log("ai_usage_log", { task, provider: r.provider, model: r.model, status: "ok", latency_ms: ms,
      prompt_chars: prompt.length, response_chars: r.text.length, failover: r.failover });
    return json(req, { answer: r.text, provider: r.provider, failover: r.failover, period: { from: v.from, to: v.to }, task });
  }
  await log("ai_usage_log", { task, provider: r.provider, status: r.error.cls === "safety" ? "blocked" : "error", latency_ms: ms,
    prompt_chars: prompt.length, failover: r.failover });
  const msg = r.error.cls === "safety" ? "رفض المحرك الطلب لأسباب أمنية."
    : r.error.cls === "auth" || r.error.cls === "no_key" ? "إعدادات المحرك غير صحيحة، راجع المدير."
    : "الخدمة غير متاحة مؤقتاً، حاول بعد قليل.";
  return json(req, { error: r.error.cls, message: msg }, r.error.cls === "auth" || r.error.cls === "no_key" ? 502 : 503);
});
