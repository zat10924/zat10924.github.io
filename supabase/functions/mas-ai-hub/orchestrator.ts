// منسّق المحركين: الأساسي ثم الاحتياطي وفق سياسة آمنة. بلا اعتماد على Supabase (قابل للاختبار).
import { ProviderError, shouldFailover } from "./policy.ts";
import type { CallOpts, CallResult, Provider } from "./providers.ts";

export interface Hooks {
  getKey(p: Provider): string | undefined;
  onError(p: Provider, e: ProviderError): void | Promise<void>;
  onFailover(from: Provider, to: Provider, reason: string): void | Promise<void>;
}
export interface RunOk { ok: true; text: string; provider: string; model: string; failover: boolean; }
export interface RunErr { ok: false; error: ProviderError; provider: string | null; failover: boolean; }

export async function runChain(chain: Provider[], o: CallOpts, h: Hooks, f?: typeof fetch): Promise<RunOk | RunErr> {
  let failedOver = false;
  let last: { e: ProviderError; p: Provider } | null = null;
  for (let i = 0; i < chain.length; i++) {
    const p = chain[i];
    const key = h.getKey(p);
    let res: CallResult | null = null;
    let err: ProviderError;
    if (!key) {
      err = new ProviderError("no_key", null, `${p.envKey} غير مضبوط`);
    } else {
      try { res = await p.call(key, o, f); err = null as unknown as ProviderError; }
      catch (e) { err = e instanceof ProviderError ? e : new ProviderError("unknown", null, "unexpected"); }
    }
    if (res) return { ok: true, text: res.text, provider: p.id, model: res.model, failover: failedOver };
    await h.onError(p, err);
    last = { e: err, p };
    const next = chain[i + 1];
    if (!next || !shouldFailover(err.cls)) break;   // أخطاء الصلاحيات/المفتاح/الرفض الأمني: لا تحويل
    await h.onFailover(p, next, err.cls + (err.status ? `:${err.status}` : ""));
    failedOver = true;
  }
  return { ok: false, error: last!.e, provider: last!.p.id, failover: failedOver };
}

// سباق متأخر (hedged): يبدأ بالمحرك الأول؛ إن تأخر عن hedgeMs أو فشل بخطأ يسمح بالتحويل يُطلَق التالي فورًا
// دون إلغاء الأول، وأول ردّ ناجح يُعتمد. أخطاء المفتاح المرفوض/الرفض الأمني توقف إطلاق محركات جديدة فقط.
export function runHedged(chain: Provider[], o: CallOpts, h: Hooks, hedgeMs = 2000, f?: typeof fetch): Promise<RunOk | RunErr> {
  if (chain.length < 2) return runChain(chain, o, h, f);
  return new Promise((resolve) => {
    let launched = 0, pending = 0, done = false, stop = false;
    let last: { e: ProviderError; p: Provider } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (r: RunOk | RunErr) => { if (done) return; done = true; if (timer) clearTimeout(timer); resolve(r); };
    const arm = () => {
      if (timer) clearTimeout(timer);
      if (done || stop || launched >= chain.length) return;
      timer = setTimeout(() => { const prev = chain[launched - 1], next = chain[launched]; if (next) { void h.onFailover(prev, next, "slow"); } launch(); arm(); }, hedgeMs);
    };
    const launch = () => {
      if (done || stop || launched >= chain.length) return;
      const idx = launched++, p = chain[idx]; pending++;
      (async () => {
        const key = h.getKey(p);
        let res: CallResult | null = null, err: ProviderError | null = null;
        if (!key) err = new ProviderError("no_key", null, `${p.envKey} غير مضبوط`);
        else { try { res = await p.call(key, o, f); } catch (e) { err = e instanceof ProviderError ? e : new ProviderError("unknown", null, "unexpected"); } }
        pending--;
        if (done) return;                         // خسر السباق: نتجاهله
        if (res) return finish({ ok: true, text: res.text, provider: p.id, model: res.model, failover: idx > 0 });
        await h.onError(p, err!);
        last = { e: err!, p };
        // مفتاح مرفوض لمحرك لا يجب أن يعطّل المحركات الأخرى (مفاتيحها مستقلة)؛ الخطأ يُسجَّل ويظهر في لوحة المحركات
        if (!(shouldFailover(err!.cls) || err!.cls === "auth")) stop = true;
        else if (launched < chain.length) { await h.onFailover(p, chain[launched], err!.cls + (err!.status ? `:${err!.status}` : "")); launch(); arm(); }
        if (pending === 0 && (stop || launched >= chain.length)) finish({ ok: false, error: last.e, provider: last.p.id, failover: launched > 1 });
      })();
    };
    launch(); arm();
  });
}
