// web.ts — وصول آمن للإنترنت للمساعد: بحث + قراءة صفحات المواقع.
// القواعد: لا وصول لشبكات داخلية (SSRF)، حدّ للحجم والوقت، والمحتوى المسترجع «بيانات» وليس تعليمات.
// مزوّد البحث بالترتيب: Tavily ثم Brave ثم Gemini (Google Search) ثم DuckDuckGo. الأول المضبوط مفتاحه يُستخدم،
// وأي فشل يحوّل تلقائيًا للتالي. يمكن إجبار مزوّد بسر WEB_SEARCH_PROVIDER = tavily | brave | gemini | ddg.

export interface WebSource { title: string; url: string; snippet?: string; text?: string }
export interface WebResult {
  used: boolean;
  engine: string;       // tavily | brave | gemini | ddg | direct | none
  queries: string[];
  sources: WebSource[];
  context: string;      // كتلة <web> للنموذج (فارغة إن لم يُستخدم)
  note?: string;
}
type F = typeof fetch;

// deno-lint-ignore no-explicit-any
const G: any = globalThis;
const env = (k: string): string | undefined => {
  const v = G.Deno?.env?.get?.(k) ?? G.process?.env?.[k];
  const s = typeof v === "string" ? v.trim().replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "").trim() : "";
  return s || undefined;
};

const UA = "Mozilla/5.0 (compatible; MAS-Assistant/1.0; +https://zat10924.github.io)";

/* ---------------------------------------------------------------- الروابط */

export function extractUrls(text: string, max = 3): string[] {
  const out: string[] = [];
  const add = (u: string) => {
    u = u.replace(/[.,;:!?؟،؛)\]}»]+$/u, "");
    if (u && !out.includes(u)) out.push(u);
  };
  for (const m of String(text).matchAll(/https?:\/\/[^\s<>"'«»]+/gi)) { add(m[0]); if (out.length >= max) return out; }
  for (const m of String(text).matchAll(/(?<![\/\w.@])www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s<>"'«»]*/gi)) {
    add("https://" + m[0]); if (out.length >= max) break;
  }
  return out.slice(0, max);
}

/* ---------------------------------------------------------------- حماية SSRF */

export function isPrivateV4(h: string): boolean {
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = +m[1], b = +m[2];
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
}
export function isPrivateV6(h: string): boolean {
  const s = h.toLowerCase();
  if (s === "::1" || s === "::" || /^f[cd]/.test(s) || /^fe[89ab]/.test(s)) return true;
  const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return m ? isPrivateV4(m[1]) : false;
}

/** يرجع URL صالحًا (http/https، اسم نطاق عام، منفذ 80/443) أو null. */
export function publicUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== "80" && u.port !== "443") return null;
  const h = u.hostname.toLowerCase();
  if (!h || h.includes(":") || h.startsWith("[")) return null;                       // IPv6 حرفي
  if (/^[\d.]+$/.test(h) || /^0x[0-9a-f]+$/i.test(h)) return null;                      // IP حرفي أو مُشفَّر
  if (!h.includes(".")) return null;                                                    // اسم داخلي بلا نطاق
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|private|test|invalid)$/.test(h)) return null;
  if (/(^|\.)(metadata\.google\.internal)$/.test(h)) return null;
  return u;
}

async function dnsSafe(host: string): Promise<boolean> {
  const r = G.Deno?.resolveDns;
  if (typeof r !== "function") return true;                                             // بيئة بلا DNS API: نكتفي بفحص الاسم
  try {
    const [a, b] = await Promise.all([
      r.call(G.Deno, host, "A").catch(() => []),
      r.call(G.Deno, host, "AAAA").catch(() => []),
    ]);
    if ((a as string[]).some(isPrivateV4)) return false;
    if ((b as string[]).some(isPrivateV6)) return false;
    return true;
  } catch { return true; }
}

/* ---------------------------------------------------------------- HTML إلى نص */

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", laquo: "«", raquo: "»", hellip: "...", middot: "·", rlm: "", lrm: "", copy: "" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): { title: string; text: string } {
  let h = html.slice(0, 1_600_000).replace(/<!--[\s\S]*?-->/g, "");
  const meta = (re: RegExp) => decodeEntities((h.match(re)?.[1] ?? "").replace(/\s+/g, " ").trim());
  const title = (meta(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i) || meta(/<title[^>]*>([\s\S]*?)<\/title>/i)).slice(0, 160);
  const desc = meta(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i).slice(0, 300);
  h = h.replace(/<(script|style|noscript|svg|iframe|canvas|template|form|select|button|head)\b[\s\S]*?<\/\1>/gi, " ");
  const main = h.match(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/i);
  if (main && main[2].length > 800) h = main[2];
  else h = h.replace(/<(nav|footer|aside)\b[\s\S]*?<\/\1>/gi, " ");
  h = h.replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|tr|h[1-6]|ul|ol|table|blockquote|pre|figure|article|header)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<[^>]+>/g, " ");
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const raw of decodeEntities(h).split("\n")) {
    const l = raw.replace(/[ \t\u00a0\u200f\u200e]+/g, " ").trim();
    if (l.length < 2 || seen.has(l)) continue;
    seen.add(l); lines.push(l);
  }
  let text = lines.join("\n");
  if (desc && !text.includes(desc.slice(0, 40))) text = desc + "\n" + text;
  return { title, text: text.replace(/\n{3,}/g, "\n\n").trim() };
}

/* ---------------------------------------------------------------- جلب صفحة */

async function readLimited(r: Response, max: number): Promise<Uint8Array> {
  const reader = r.body?.getReader();
  if (!reader) return new Uint8Array(await r.arrayBuffer()).slice(0, max);
  const chunks: Uint8Array[] = []; let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); n += value.length;
    if (n >= max) { try { await reader.cancel(); } catch { /* تجاهل */ } break; }
  }
  const out = new Uint8Array(Math.min(n, max)); let o = 0;
  for (const c of chunks) { const take = Math.min(c.length, out.length - o); if (take <= 0) break; out.set(c.subarray(0, take), o); o += take; }
  return out;
}
function decodeBody(buf: Uint8Array, contentType: string): string {
  let cs = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
  if (!cs) cs = new TextDecoder("latin1").decode(buf.subarray(0, 3000)).match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  try { return new TextDecoder((cs || "utf-8").toLowerCase(), { fatal: false }).decode(buf); }
  catch { return new TextDecoder("utf-8").decode(buf); }
}

export type PageResult =
  | { ok: true; url: string; title: string; text: string; truncated: boolean }
  | { ok: false; url: string; reason: string };

export async function fetchPage(raw: string, o: { timeoutMs?: number; maxChars?: number; f?: F } = {}): Promise<PageResult> {
  const f = o.f ?? fetch, maxChars = o.maxChars ?? 6000;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), o.timeoutMs ?? 9000);
  try {
    let cur = raw;
    for (let hop = 0; hop < 5; hop++) {
      const u = publicUrl(cur);
      if (!u) return { ok: false, url: raw, reason: "رابط غير مسموح" };
      if (!(await dnsSafe(u.hostname))) return { ok: false, url: raw, reason: "رابط غير مسموح" };
      const r = await f(u.toString(), {
        redirect: "manual", signal: ac.signal,
        headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,text/plain,application/json;q=0.8,*/*;q=0.3", "Accept-Language": "ar,en;q=0.8" },
      });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
        cur = new URL(r.headers.get("location")!, u).toString();
        try { await r.body?.cancel(); } catch { /* تجاهل */ }
        continue;
      }
      if (!r.ok) { try { await r.body?.cancel(); } catch { /* تجاهل */ } return { ok: false, url: raw, reason: "الموقع رفض الوصول (" + r.status + ")" }; }
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (ct && !/(text\/|application\/(json|xml|xhtml))/.test(ct)) {
        try { await r.body?.cancel(); } catch { /* تجاهل */ }
        return { ok: false, url: raw, reason: "نوع الملف غير مدعوم (يُقرأ HTML أو نص فقط)" };
      }
      const body = decodeBody(await readLimited(r, 1_500_000), ct);
      const isHtml = /html/.test(ct) || /^\s*<(!doctype|html)/i.test(body.slice(0, 200));
      const t = isHtml ? htmlToText(body) : { title: "", text: body.replace(/\s+\n/g, "\n").trim() };
      if (t.text.length < 40) return { ok: false, url: raw, reason: "لا يوجد نص قابل للقراءة (قد تكون الصفحة تعتمد على JavaScript)" };
      return { ok: true, url: u.toString(), title: t.title, text: t.text.slice(0, maxChars), truncated: t.text.length > maxChars };
    }
    return { ok: false, url: raw, reason: "تحويلات كثيرة" };
  } catch (e) {
    return { ok: false, url: raw, reason: (e as Error)?.name === "AbortError" ? "انتهت مهلة الموقع" : "تعذّر الاتصال بالموقع" };
  } finally { clearTimeout(timer); }
}

/* ---------------------------------------------------------------- مزوّدو البحث */

interface SearchOut { results: WebSource[]; digest?: string }
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

async function timed(url: string, init: RequestInit, f: F, ms: number): Promise<Response> {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { return await f(url, { ...init, signal: ac.signal }); } finally { clearTimeout(t); }
}

export async function searchTavily(q: string, key: string, f: F = fetch, max = 6): Promise<SearchOut> {
  const r = await timed("https://api.tavily.com/search", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({ query: q, max_results: max, search_depth: "basic", include_answer: false }),
  }, f, 10000);
  if (!r.ok) throw new Error("tavily " + r.status);
  const j = await r.json();
  return { results: (j?.results ?? []).map((x: any) => ({ title: String(x.title ?? hostOf(x.url)), url: String(x.url ?? ""), snippet: String(x.content ?? "").slice(0, 600) })).filter((x: WebSource) => publicUrl(x.url)) };
}

export async function searchBrave(q: string, key: string, f: F = fetch, max = 6): Promise<SearchOut> {
  const r = await timed("https://api.search.brave.com/res/v1/web/search?count=" + max + "&q=" + encodeURIComponent(q), {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
  }, f, 10000);
  if (!r.ok) throw new Error("brave " + r.status);
  const j = await r.json();
  return { results: (j?.web?.results ?? []).map((x: any) => ({ title: decodeEntities(String(x.title ?? hostOf(x.url)).replace(/<[^>]+>/g, "")), url: String(x.url ?? ""), snippet: decodeEntities(String(x.description ?? "").replace(/<[^>]+>/g, "")).slice(0, 600) })).filter((x: WebSource) => publicUrl(x.url)) };
}

/** بحث Google عبر Gemini (Grounding): يرجع ملخصًا موثقًا + مصادره. لا يحتاج مفتاحًا إضافيًا. */
export async function searchGemini(q: string, key: string, f: F = fetch): Promise<SearchOut> {
  const model = env("GEMINI_MODEL") || "gemini-flash-latest";
  const r = await timed(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: "أنت باحث دقيق. ابحث في الويب وأعد ملخصًا مختصرًا بالحقائق والأرقام والتواريخ كما وردت في المصادر، بالعربية، دون رأي ولا مقدمات. اذكر التاريخ إن ظهر. إن لم تجد معلومة موثوقة فقل ذلك." }] },
      contents: [{ parts: [{ text: q }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    }),
  }, f, 20000);
  if (!r.ok) throw new Error("gemini " + r.status);
  const j = await r.json();
  const c = j?.candidates?.[0];
  const digest = (c?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("").trim();
  const seen = new Set<string>();
  const results: WebSource[] = [];
  for (const ch of c?.groundingMetadata?.groundingChunks ?? []) {
    const url = String(ch?.web?.uri ?? "");
    if (!url || seen.has(url)) continue;
    seen.add(url); results.push({ title: String(ch?.web?.title ?? hostOf(url)), url });
  }
  if (!digest) throw new Error("gemini empty");
  return { results: results.slice(0, 8), digest };
}

/** آخر خيار بلا مفاتيح: صفحة DuckDuckGo الخفيفة. قد تُحجب أحيانًا. */
export async function searchDdg(q: string, f: F = fetch, max = 6): Promise<SearchOut> {
  const r = await timed("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q), { headers: { "User-Agent": UA, "Accept-Language": "ar,en;q=0.8" } }, f, 9000);
  if (!r.ok) throw new Error("ddg " + r.status);
  return { results: parseDdg(await r.text(), max) };
}
export function parseDdg(html: string, max = 6): WebSource[] {
  const out: WebSource[] = [];
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]+class="[^"]*result__a|$)/gi;
  for (const m of html.matchAll(re)) {
    let href = decodeEntities(m[1]);
    const ud = href.match(/[?&]uddg=([^&]+)/);
    if (ud) { try { href = decodeURIComponent(ud[1]); } catch { continue; } }
    if (href.startsWith("//")) href = "https:" + href;
    if (!publicUrl(href)) continue;
    const sn = m[3].match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/i)?.[1] ?? "";
    out.push({ title: decodeEntities(m[2].replace(/<[^>]+>/g, "")).trim() || hostOf(href), url: href, snippet: decodeEntities(sn.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 400) });
    if (out.length >= max) break;
  }
  return out;
}

/** اسم محرك البحث الذي سيُستخدم أولًا (للعرض في لوحة المدير). */
export function webEngineName(geminiKey?: string): string {
  const forced = env("WEB_SEARCH_PROVIDER")?.toLowerCase();
  if (forced && ["tavily", "brave", "gemini", "ddg"].includes(forced)) return forced;
  if (env("TAVILY_API_KEY")) return "tavily";
  if (env("BRAVE_API_KEY")) return "brave";
  if (geminiKey) return "gemini";
  return "ddg";
}

/* ---------------------------------------------------------------- متى نستخدم الإنترنت؟ */

const FACTORY_TASKS = ["production", "waste", "colors", "orders", "inventory", "compare", "summary"];
const SMALLTALK = /^(مرحبا|مرحباً|اهلا|أهلا|أهلاً|اهلًا|سلام|السلام|صباح|مساء|هاي|هلا|كيف حالك|ازيك|إزيك|شكرا|شكراً|تمام|عرّف|عرف بنفسك|من انت|من أنت|انت مين|أنت مين)/;
const EXPLICIT = /(ابحث|دوّر|دور (لي )?(على|عن)|فتّش|على (ال)?(انترنت|إنترنت|نت|ويب|الويب|جوجل|قوقل)|أونلاين|اونلاين|تصفح|افتح (لي )?(ال)?(موقع|رابط|صفحة)|من (ال)?(موقع|مواقع|الرابط)|آخر (ال)?(أخبار|اخبار|مستجدات)|اخر (ال)?(أخبار|اخبار|مستجدات)|search|google|latest news)/i;
const EXTERNAL = /(سعر|أسعار|اسعار|الدولار|اليورو|الذهب|بورصة|السوق|الأسواق|منافس|مستورد|استيراد|تصدير|جمارك|جمركي|قانون|لائحة|قرار|ضريبة|ضرائب|تعريفة|ترند|موضة|اتجاهات|تصميمات عالمية|معرض|معارض|مواصفات|معيار|ISO|ASTM|شهادة|كاولين|فريت|أكاسيد|اكاسيد|طريقة (تصنيع|عمل)|أفضل (طريقة|ممارسات)|معلومات عن|ما هو|ما هي|ماهو|ماهي|ما هى|اشرح لي|شرح|ليه|لماذا|كيف يتم|ازاي)/;

export function webIntent(q: string, task: string, hasUrl: boolean): { use: boolean; reason: string } {
  const t = q.trim();
  if (hasUrl) return { use: true, reason: "url" };
  if (EXPLICIT.test(t)) return { use: true, reason: "explicit" };
  if (SMALLTALK.test(t) && t.length < 40) return { use: false, reason: "smalltalk" };
  if (EXTERNAL.test(t)) {
    // أسئلة المصنع الصرفة (إنتاج/هالك...) لا تحتاج إنترنت حتى لو احتوت «ما هو»
    const internal = /(إنتاج|انتاج|هالك|قسم|الأقسام|الاقسام|عامل|عمال|طلبية|ورديه|وردية|اليوم|الأسبوع|الشهر|فترة)/.test(t);
    if (!(internal && FACTORY_TASKS.includes(task) && !/(سعر|أسعار|اسعار|السوق|منافس|معيار|مواصفات|قانون|جمارك|تصدير|استيراد)/.test(t))) return { use: true, reason: "external" };
  }
  if (task === "general" && t.length > 25 && /[؟?]/.test(t)) return { use: true, reason: "general-question" };
  return { use: false, reason: "factory" };
}

/* ---------------------------------------------------------------- التجميع */

export function searchQuery(q: string): string {
  let s = q.replace(/https?:\/\/\S+/gi, " ").replace(/\bwww\.\S+/gi, " ");
  s = s.replace(/(على|في|من) (ال)?(انترنت|إنترنت|نت|ويب|الويب|جوجل|قوقل)/g, " ").replace(/\b(أونلاين|اونلاين)\b/g, " ");
  s = s.replace(/^(?:(?:من فضلك|لو سمحت|ممكن|عايز|عاوز|أريد|اريد|أود|ابحث(?:ي)?(?: لي)?(?: عن)?|دوّر(?: لي)?(?: على| عن)?|دور(?: لي)?(?: على| عن)?)\s+)+/, "");
  s = s.replace(/\s+/g, " ").trim().slice(0, 180);
  return s.length >= 3 ? s : q.replace(/\s+/g, " ").trim().slice(0, 180);
}

const flat = (s: string) => s.replace(/[<>]/g, " ").replace(/\n{3,}/g, "\n\n");

export async function gatherWeb(q: string, o: { urls?: string[]; geminiKey?: string; f?: F; budgetMs?: number } = {}): Promise<WebResult> {
  const f = o.f ?? fetch;
  const urls = (o.urls ?? []).filter((u) => publicUrl(u)).slice(0, 3);
  const sources: WebSource[] = [];
  const queries: string[] = [];
  const notes: string[] = [];
  let engine = urls.length ? "direct" : "none";
  let digest = "";

  // 1) الروابط التي ألصقها المستخدم: تُقرأ مباشرة
  const direct = await Promise.all(urls.map((u) => fetchPage(u, { f, maxChars: 7000 })));
  direct.forEach((p, i) => {
    if (p.ok) sources.push({ title: p.title || hostOf(p.url), url: p.url, text: p.text });
    else notes.push(`تعذّر فتح ${hostOf(urls[i])}: ${p.reason}`);
  });

  // 2) البحث: إلا إذا كان السؤال عن الرابط الملصوق فقط
  const rest = q.replace(/https?:\/\/\S+|\bwww\.\S+/gi, "").replace(/\s+/g, " ").trim();
  const onlyAboutLink = urls.length > 0 && sources.length > 0 && rest.length < 90 && !EXPLICIT.test(rest);
  if (!onlyAboutLink) {
    const sq = searchQuery(q);
    queries.push(sq);
    const order: string[] = [];
    const forced = env("WEB_SEARCH_PROVIDER")?.toLowerCase();
    if (forced && ["tavily", "brave", "gemini", "ddg"].includes(forced)) order.push(forced);
    for (const p of ["tavily", "brave", "gemini", "ddg"]) if (!order.includes(p)) order.push(p);
    let found: SearchOut | null = null;
    for (const p of order) {
      try {
        if (p === "tavily" && env("TAVILY_API_KEY")) found = await searchTavily(sq, env("TAVILY_API_KEY")!, f);
        else if (p === "brave" && env("BRAVE_API_KEY")) found = await searchBrave(sq, env("BRAVE_API_KEY")!, f);
        else if (p === "gemini" && o.geminiKey) found = await searchGemini(sq, o.geminiKey, f);
        else if (p === "ddg") found = await searchDdg(sq, f);
        else continue;
        if (found.results.length || found.digest) { engine = p; break; }
        found = null;
      } catch { found = null; }
    }
    if (found) {
      digest = found.digest ?? "";
      const have = new Set(sources.map((s) => s.url));
      const fresh = found.results.filter((r) => !have.has(r.url));
      // نقرأ أول 3 صفحات فعليًا (ما عدا روابط تحويل Google) ونكتفي بالمقتطف للباقي
      const readable = fresh.filter((r) => !/vertexaisearch\.cloud\.google\.com|google\.com\/grounding/.test(r.url)).slice(0, 3);
      const pages = await Promise.all(readable.map((r) => fetchPage(r.url, { f, timeoutMs: 8000, maxChars: 4500 })));
      const textOf = new Map<string, string>();
      pages.forEach((p, i) => { if (p.ok) textOf.set(readable[i].url, p.text); });
      for (const r of fresh.slice(0, 8)) sources.push({ ...r, text: textOf.get(r.url) });
    } else if (!sources.length) {
      notes.push("تعذّر الوصول لمحرك البحث الآن.");
    }
  }

  if (!sources.length && !digest) {
    return { used: false, engine, queries, sources: [], context: "<web>\n" + (notes.join("\n") || "لم يُعثر على نتائج.") + "\n</web>", note: notes[0] || "لم يُعثر على نتائج" };
  }

  // 3) بناء كتلة السياق بميزانية حروف
  const n = Math.max(1, sources.length);
  const per = Math.min(4500, Math.floor(13000 / n));
  const parts: string[] = ["<web>"];
  if (notes.length) parts.push("ملاحظات: " + notes.join(" | "));
  if (digest) parts.push("[ملخص بحث Google]\n" + flat(digest).slice(0, 4000));
  sources.forEach((s, i) => {
    const body = flat(s.text || s.snippet || "").slice(0, per);
    parts.push(`[${i + 1}] ${flat(s.title)} — ${s.url}\n${body || "(لا يوجد نص، العنوان فقط)"}`);
  });
  parts.push("</web>");
  return { used: true, engine, queries, sources, context: parts.join("\n"), note: notes[0] };
}
