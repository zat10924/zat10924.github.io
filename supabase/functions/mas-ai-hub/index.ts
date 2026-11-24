// mas-ai-hub — بوابة الذكاء الاصطناعي لـ MAS. المفاتيح من Secrets فقط، والبيانات بصلاحية المستخدم (RLS).
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildPrompt, buildSsml, clampRate, detectTask, knowledgeBlock, safeVoice, SECTIONS, splitFollowups, stripEmoji, SYSTEM_PROMPT, validateAsk } from "./policy.ts";
import { keyFor, REGISTRY } from "./providers.ts";
import { buildFilter, buildRows, cleanIds, WSECS } from "./writer.ts";
import { runChain, runHedged } from "./orchestrator.ts";
import { buildInsights, compactFacts, prevRange, daysBetween } from "./analytics.ts";
import { extractUrls, gatherWeb, webEngineName, webIntent, type WebResult } from "./web.ts";

// مهلة بدء المحرك الاحتياطي بالتوازي (مللي ثانية). يمكن ضبطها بسر HEDGE_MS (500–10000)
const HEDGE_MS = Math.min(10000, Math.max(500, Number(Deno.env.get("HEDGE_MS")) || 2000));

// ذاكرة المساعد (مصطلحات معتمدة). أي خطأ هنا لا يعطّل الإجابة.
// deno-lint-ignore no-explicit-any
async function loadKb(admin: any): Promise<string> {
  try {
    const { data } = await admin.from("ai_knowledge").select("kind,term,meaning").eq("active", true).order("id").limit(60);
    return knowledgeBlock(data ?? []);
  } catch { return ""; }
}
// سلسلة المحركات: الأساسي ثم الاحتياطي ثم أي محرك آخر مفتاحه مضبوط (مثل OpenRouter) عند تفعيل التحويل التلقائي
// deno-lint-ignore no-explicit-any
function buildChain(s: any) {
  const first = REGISTRY[s.primary_provider];
  const chain = first ? [first] : [];
  if (s.auto_failover) {
    const second = s.fallback_provider ? REGISTRY[s.fallback_provider] : undefined;
    if (second && !chain.includes(second)) chain.push(second);
    for (const p of Object.values(REGISTRY)) if (!chain.includes(p) && keyFor(p)) chain.push(p);
  }
  return chain;
}
const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // يُحقن تلقائياً في الخادم فقط
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const ALLOWED_ROLES = ["admin", "owner", "manager"]; // manager: فقط مع view_all (نفس canReports في الواجهة)

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
  const { data: prof } = await admin.from("profiles").select("role,active,full_name").eq("id", uid).maybeSingle();
  if (!prof || prof.active === false || !ALLOWED_ROLES.includes(prof.role)) return json(req, { error: "forbidden" }, 403);
  if (prof.role === "manager") { // مسؤول القسم: لازم صلاحية التقارير. أي خطأ في القراءة = رفض
    const { data: pm, error: pe } = await admin.from("profiles").select("view_all").eq("id", uid).maybeSingle();
    if (pe || pm?.view_all !== true) return json(req, { error: "forbidden", message: "صلاحية التقارير مطلوبة لاستخدام المساعد." }, 403);
  }
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
      web_engine: webEngineName(keyFor(REGISTRY.gemini)),
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
  }  // ---- صوت المساعد: Azure Speech بصوت مصري (ar-EG-SalmaNeural افتراضيًا) ----
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


  // ---- تفويض الكتابة: شخص واحد فقط (ai_write_policy). كل كتابة بصلاحية المستخدم نفسه (RLS)، وتُسجَّل وتقبل التراجع 7 أيام ----
  if (typeof action === "string" && action.startsWith("write_")) {
    const { data: wp } = await admin.from("ai_write_policy").select("user_id,enabled").eq("id", 1).maybeSingle();
    const canWrite = !!wp && wp.enabled === true && wp.user_id === uid && (prof.role === "admin" || prof.role === "manager");
    if (action === "write_status") return json(req, { can_write: canWrite, sections: canWrite ? Object.entries(WSECS).map(([id, v]) => ({ id, label: v.label })) : [] });
    if (!canWrite) return json(req, { error: "forbidden", message: "الكتابة المباشرة مفوّضة لشخص واحد فقط." }, 403);
    const today = cairoToday();
    const sec = String(body?.sec ?? "");
    const c = WSECS[sec];
    const bad = (m: string, st = 400) => json(req, { error: "bad_request", message: m }, st);

    // أمر نصي ← نية منظّمة (للعرض والتأكيد فقط؛ لا ينفّذ شيئًا)
    if (action === "write_intent") {
      const text = typeof body?.text === "string" ? body.text.trim().slice(0, 2000) : "";
      if (text.length < 3) return bad("اكتب الأمر.");
      const sys = "أنت محلّل أوامر لنظام مصنع خزف. حوّل أمر المستخدم إلى JSON فقط، ولا تخمّن أي اسم أو رقم غير مذكور (اجعله null). الشكل: " +
        '{"op":"add|delete|none","section":"casting|brush|finish|glaze|deco|spray|repair|fire|unknown","date":"YYYY-MM-DD أو null","from":"YYYY-MM-DD أو null","to":"YYYY-MM-DD أو null","item":"اسم الصنف أو النشاط أو null","worker":"أو null","notes":"أي غموض","rows":[{"item":"","qty":0,"scrap":null,"worker":null,"shift":null,"note":null}]}. ' +
        "op=add إذا طلب تسجيل/إضافة بيانات (ضع السطور في rows). op=delete إذا طلب حذف سجلات (ضع شروط البحث date أو from/to وitem وworker ولا تضع rows). غير ذلك op=none. الأقسام: الصب=casting، البرشر=brush، التشطيب=finish، الجليز=glaze، الزخرفة=deco، الرش=spray، التصليح=repair، الحريق=fire. تاريخ اليوم " + today + ".";
      const r = await runHedged(buildChain(s), { system: sys, prompt: text, timeoutMs: Math.max(s.timeout_ms, 20000), json: true }, hooks, HEDGE_MS);
      if (!r.ok) return json(req, { error: r.error.cls, message: "تعذّر فهم الأمر الآن، حاول بعد قليل." }, 503);
      let j: any; try { j = JSON.parse(r.text.replace(/^```json|```$/g, "").trim()); } catch { j = null; }
      const sx = (v: unknown, n: number) => { const x = typeof v === "string" ? v.trim().slice(0, n) : ""; return x || null; };
      const dt = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null;
      const num = (v: unknown) => { const n = Number(v); return v == null || v === "" || !Number.isFinite(n) ? null : Math.min(1_000_000, Math.max(0, Math.round(n))); };
      const rows = (Array.isArray(j?.rows) ? j.rows : []).slice(0, 60).map((x: any) => ({ item: sx(x?.item, 120), qty: num(x?.qty), scrap: num(x?.scrap), worker: sx(x?.worker, 80), shift: sx(x?.shift, 20), note: sx(x?.note, 300) }));
      await log("ai_usage_log", { task: "intent", provider: r.provider, model: r.model, status: "ok", latency_ms: 0, failover: r.failover });
      return json(req, { intent: {
        op: ["add", "delete"].includes(j?.op) ? j.op : "none",
        section: (SECTIONS as readonly string[]).includes(j?.section) ? j.section : "unknown",
        date: dt(j?.date), from: dt(j?.from), to: dt(j?.to), item: sx(j?.item, 80), worker: sx(j?.worker, 80), notes: sx(j?.notes, 300) ?? "", rows } });
    }

    if (!c) return bad("هذا القسم غير مدعوم للكتابة المباشرة. الأقسام المدعومة: الصب والبرشر والتشطيب.");

    if (action === "write_add") {
      const b = buildRows(sec, String(body?.date ?? ""), body?.rows, today, () => crypto.randomUUID());
      if (!b.ok) return bad(b.message);
      const { data: ins, error } = await userDb.from(c.table).insert(b.rows).select("id");
      if (error) { await log("ai_error_log", { provider: "write", error_class: "add_" + (error.code ?? "x"), message: String(error.message).slice(0, 200) }); return bad("تعذّر الحفظ. راجع البيانات أو صلاحياتك على القسم.", 400); }
      const ids = (ins ?? []).map((r: any) => r.id);
      const { data: lg } = await admin.from("ai_action_log").insert({ user_id: uid, action: "add", section: sec, row_ids: ids }).select("id").single();
      return json(req, { ok: true, count: ids.length, log_id: lg?.id ?? null });
    }

    if (action === "write_find") {
      const f = buildFilter(body, today);
      if (!f.ok) return bad(f.message);
      let q = userDb.from(c.table).select("*").gte(c.date, f.f.from).lte(c.date, f.f.to)
        .order(c.date, { ascending: false }).order("id", { ascending: false }).limit(f.f.limit);
      if (f.f.item) q = q.ilike(c.text, `%${f.f.item}%`);
      if (f.f.worker) q = q.ilike("worker", `%${f.f.worker}%`);
      const { data, error } = await q;
      if (error) return bad("تعذّر البحث.", 400);
      return json(req, { sec, rows: (data ?? []).map((r: any) => ({ id: r.id, date: r[c.date], item: r[c.text], qty: r.qty, scrap: r.scrap ?? null, shift: r.shift ?? null, worker: r.worker ?? null, note: r.note ?? null })) });
    }

    if (action === "write_delete") {
      const ids = cleanIds(body?.ids);
      if (!ids || body?.confirm !== true) return bad("حدّد السجلات (حتى 50) وأكّد الحذف.");
      const { data: before, error: e1 } = await userDb.from(c.table).select("*").in("id", ids);
      if (e1 || !before?.length) return bad("لم أجد هذه السجلات (أو لا تملك صلاحية قراءتها).", 404);
      const { data: del, error: e2 } = await userDb.from(c.table).delete().in("id", before.map((r: any) => r.id)).select("id");
      if (e2) { await log("ai_error_log", { provider: "write", error_class: "del_" + (e2.code ?? "x"), message: String(e2.message).slice(0, 200) }); return bad("تعذّر الحذف.", 400); }
      const gone = new Set((del ?? []).map((r: any) => r.id));
      if (!gone.size) return bad("لم يُحذف شيء: الصلاحيات الحالية تمنع الحذف.", 403);
      const snap = before.filter((r: any) => gone.has(r.id));
      const { data: lg } = await admin.from("ai_action_log").insert({ user_id: uid, action: "delete", section: sec, row_ids: [...gone], before_data: snap }).select("id").single();
      return json(req, { ok: true, deleted: gone.size, log_id: lg?.id ?? null });
    }

    return bad("أمر كتابة غير معروف.");
  }  // التراجع عن آخر عملية كتابة (7 أيام، مرة واحدة، لصاحبها فقط)
  if (action === "write_undo") {
    const { data: wp } = await admin.from("ai_write_policy").select("user_id,enabled").eq("id", 1).maybeSingle();
    if (!wp || wp.enabled !== true || wp.user_id !== uid) return json(req, { error: "forbidden" }, 403);
    const lid = Number(body?.log_id);
    const { data: lg } = Number.isInteger(lid) ? await admin.from("ai_action_log").select("*").eq("id", lid).eq("user_id", uid).is("undone_at", null)
      .gte("at", new Date(Date.now() - 7 * 864e5).toISOString()).maybeSingle() : { data: null };
    const c = lg ? WSECS[lg.section] : null;
    if (!lg || !c) return json(req, { error: "bad_request", message: "لا يمكن التراجع (انتهت المدة أو تم التراجع من قبل)." }, 404);
    const res = lg.action === "delete"
      ? await userDb.from(c.table).insert(lg.before_data)
      : await userDb.from(c.table).delete().in("id", lg.row_ids);
    if (res.error) return json(req, { error: "db", message: "تعذّر التراجع." }, 400);
    await admin.from("ai_action_log").update({ undone_at: new Date().toISOString() }).eq("id", lid);
    return json(req, { ok: true });
  }

  // ---- تعبئة بيانات: استخراج منظّم من نص أو صورة. لا يكتب في قاعدة البيانات؛ المستخدم يراجع ويحفظ بنفسه ----
  if (action === "extract" || action === "vision") {
    if (!s.enabled) return json(req, { error: "disabled", message: "المساعد الذكي موقوف من الإعدادات." }, 503);
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, 4000) : "";
    const img = typeof body?.image === "string" ? body.image : "";
    const mime = String(body?.mime ?? "image/jpeg");
    if (!text && !img) return json(req, { error: "bad_request", message: "أرسل نصًا أو صورة." }, 400);
    if (img && (!/^image\/(jpeg|png|webp)$/.test(mime) || img.length > 3_500_000 || !/^[A-Za-z0-9+/=]+$/.test(img.slice(0, 2000))))
      return json(req, { error: "bad_request", message: "الصورة غير مدعومة أو كبيرة جدًا." }, 400);
    const since2 = cairoToday() + "T00:00:00+02:00";
    const { count: used } = await admin.from("ai_usage_log").select("id", { count: "exact", head: true })
      .eq("user_id", uid).eq("status", "ok").neq("task", "test").neq("task", "tts").gte("created_at", since2);
    if ((used ?? 0) >= s.daily_limit_user) return json(req, { error: "quota", message: "تم بلوغ حد الاستخدام اليومي." }, 429);
    const hint = SECTIONS.includes(body?.hint) ? body.hint : "";
    const sys = "أنت أداة استخراج بيانات لمصنع خزف. استخرج فقط ما هو مكتوب صراحةً في المدخل. ممنوع التخمين أو اختراع أي اسم أو رقم؛ ما لم يتضح اجعله null. أعد JSON فقط بهذا الشكل: " +
      '{"section":"casting|brush|glaze|deco|spray|repair|finish|fire|unknown","date":"YYYY-MM-DD أو null","confidence":"high|medium|low","notes":"ملاحظات عن الغموض أو الأرقام غير الواضحة","rows":[{"item":"اسم الصنف","color":"لون الصنف إن كُتب وإلا null","qty":رقم_صحيح_أو_null,"scrap":رقم_صحيح_أو_null,"worker":"اسم العامل أو null","shift":"الوردية أو null","note":"ملاحظة أو null"}]}';
    const prompt = (hint ? "القسم المرجّح: " + hint + "\n" : "") + "تاريخ اليوم: " + cairoToday() + "\n" + (await loadKb(admin)) + (text ? "النص:\n" + text : "الصورة المرفقة تحتوي سجل إنتاج. استخرج سطوره.");
    // الصور: Gemini مرتين (محاولة ثانية عند 503 العابر) ثم OpenRouter فقط إن ضُبط له نموذج رؤية OPENROUTER_VISION_MODEL
    const chain = img ? [REGISTRY.gemini, REGISTRY.gemini, ...(Deno.env.get("OPENROUTER_VISION_MODEL")?.trim() && keyFor(REGISTRY.openrouter) ? [REGISTRY.openrouter] : [])] : buildChain(s);
    const t0 = Date.now();
    const r = await runHedged(chain, { system: sys, prompt, timeoutMs: Math.max(s.timeout_ms, 30000), json: true, image: img ? { mime, data: img } : undefined }, hooks, img ? Math.max(HEDGE_MS, 8000) : HEDGE_MS);
    const ms = Date.now() - t0;
    if (!r.ok) {
      await log("ai_usage_log", { task: "extract", provider: r.provider, status: "error", latency_ms: ms });
      return json(req, { error: r.error.cls, message: "تعذّر استخراج البيانات الآن، حاول بعد قليل." }, 503);
    }
    let j: any; try { j = JSON.parse(r.text.replace(/^```json|```$/g, "").trim()); } catch { j = null; }
    const int = (v: unknown) => { const n = Number(v); return v == null || v === "" || !Number.isFinite(n) ? null : Math.min(1_000_000, Math.max(0, Math.round(n))); };
    const str = (v: unknown, n: number) => { const t = typeof v === "string" ? v.trim().slice(0, n) : ""; return t || null; };
    const rows = (Array.isArray(j?.rows) ? j.rows : []).slice(0, 60).map((x: any) => ({
      item: str(x?.item, 80), color: str(x?.color, 60), qty: int(x?.qty), scrap: int(x?.scrap), worker: str(x?.worker, 60), shift: str(x?.shift, 30), note: str(x?.note, 120),
    })).filter((x: any) => x.item || x.qty !== null || x.scrap !== null);
    const vision = {
      section: (SECTIONS as readonly string[]).includes(j?.section) ? j.section : "unknown",
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(j?.date ?? "")) ? j.date : null,
      confidence: ["high", "medium", "low"].includes(j?.confidence) ? j.confidence : "low",
      notes: str(j?.notes, 300) ?? "", rows,
    };
    await log("ai_usage_log", { task: "extract", provider: r.provider, model: r.model, status: "ok", latency_ms: ms, response_chars: r.text.length, failover: r.failover });
    return json(req, { vision, provider: r.provider, failover: r.failover });
  }

  if (action !== "ask") return json(req, { error: "unknown_action" }, 400);  // ---- سؤال ----
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
  // بيانات بصلاحية المستخدم: RLS تُطبَّق لأن الاستدعاء بتوكنه (لا service role).
  // الفترة السابقة للمقارنة اختيارية: أي فشل فيها لا يعطّل الإجابة.
  const span = daysBetween(v.from, v.to);
  const pr = prevRange(v.from, v.to);
  const noPrev = Promise.resolve({ data: null, error: null });
  const [fr, pv] = await Promise.all([
    userDb.rpc("mas_ai_facts", { p_from: v.from, p_to: v.to, p_secs: v.secs }),
    task !== "general" && span <= 92 ? userDb.rpc("mas_ai_facts", { p_from: pr.from, p_to: pr.to, p_secs: v.secs }) : noPrev,
  ]);
  const { data: facts, error: fe } = fr;
  if (fe) {
    await log("ai_error_log", { provider: null, error_class: "data", message: fe.message?.slice(0, 300) });
    return json(req, { error: "data", message: "تعذّر تحميل بيانات المصنع." }, 502);
  }
  const insights = buildInsights(facts, pv?.error ? null : pv?.data ?? null);

  // الإنترنت: بحث وقراءة مواقع. تفعيله من الواجهة، والقرار بالاستخدام ذكي من الخادم (أو إجباري بزر «ابحث»)
  let webRes: WebResult | null = null;
  if (v.web) {
    const urls = extractUrls(v.q);
    const wi = v.web === "force" ? { use: true } : webIntent(v.q, task, urls.length > 0);
    if (wi.use) {
      try { webRes = await gatherWeb(v.q, { urls, geminiKey: keyFor(REGISTRY.gemini) }); }
      catch (e) { webRes = { used: false, engine: "none", queries: [], sources: [], context: "<web>\nتعذّر الوصول للإنترنت الآن.\n</web>", note: String((e as Error)?.message ?? "").slice(0, 120) }; }
    }
  }

  let notes: string[] = [];
  // هوية المستخدم من حسابه على الخادم (لا من المتصفح): للمخاطبة بالاسم فقط
  const ROLE_AR: Record<string, string> = { admin: "مدير النظام", owner: "المالك", manager: "مسؤول قسم", worker: "عامل" };
  const who = String(prof?.full_name ?? "").replace(/[<>\r\n]+/g, " ").trim().slice(0, 60);
  if (who) notes.push(`المستخدم الحالي (من حسابه في النظام): الاسم «${who}»، الدور: ${ROLE_AR[prof?.role ?? ""] ?? "مستخدم"}. خاطبه باسمه عند الترحيب أو عندما يسأل من هو. لا تذكر عنه أي معلومة أخرى لا تعرفها.`);
  notes.push(`تاريخ اليوم (القاهرة): ${cairoToday()}.`);
  if (task === "inventory") notes.push("تنبيه: لا توجد في النظام حالياً جداول أرصدة مخزون؛ لا تذكر أي أرصدة.");
  if (task === "orders") notes.push("تنبيه: بيانات الطلبيات غير مرفقة في هذه النسخة؛ اعتمد على الإنتاج فقط وصرّح بالنقص.");
  if (!v.web && /(ابحث|على (ال)?(انترنت|إنترنت|نت)|https?:\/\/)/i.test(v.q)) notes.push("تنبيه: زر الإنترنت مغلق الآن؛ لا تدّعِ أنك بحثت أو فتحت أي رابط، واطلب من المستخدم تفعيله.");
  const payload = compactFacts(facts, task, !!webRes?.used);
  const kb = await loadKb(admin);
  const prompt = buildPrompt(v.q, task, payload, notes.join("\n"), kb, { insights, web: webRes?.context, history: v.history });

  const chain = buildChain(s);
  if (!chain[0]) return json(req, { error: "config", message: "المحرك الأساسي غير معرّف." }, 500);

  const t0 = Date.now();
  const r = await runHedged(chain, { system: SYSTEM_PROMPT, prompt, timeoutMs: webRes?.used ? Math.max(s.timeout_ms, 30000) : s.timeout_ms }, hooks, webRes?.used ? Math.max(HEDGE_MS, 6000) : HEDGE_MS);
  const ms = Date.now() - t0;
  if (r.ok) {
    await log("ai_usage_log", { task, provider: r.provider, model: r.model, status: "ok", latency_ms: ms,
      prompt_chars: prompt.length, response_chars: r.text.length, failover: r.failover });
    const { answer, followups } = splitFollowups(stripEmoji(r.text));
    const web = webRes ? { used: webRes.used, engine: webRes.engine, queries: webRes.queries, note: webRes.note ?? null,
      sources: webRes.sources.slice(0, 8).map((x) => ({ title: stripEmoji(x.title).slice(0, 140), url: x.url })) } : null;
    return json(req, { answer, followups: followups.map(stripEmoji), provider: r.provider, failover: r.failover, period: { from: v.from, to: v.to }, task, web });
  }
  await log("ai_usage_log", { task, provider: r.provider, status: r.error.cls === "safety" ? "blocked" : "error", latency_ms: ms,
    prompt_chars: prompt.length, failover: r.failover });
  const msg = r.error.cls === "safety" ? "رفض المحرك الطلب لأسباب أمنية."
    : r.error.cls === "auth" || r.error.cls === "no_key" ? "إعدادات المحرك غير صحيحة، راجع المدير."
    : "الخدمة غير متاحة مؤقتاً، حاول بعد قليل.";
  return json(req, { error: r.error.cls, message: msg }, r.error.cls === "auth" || r.error.cls === "no_key" ? 502 : 503);
});