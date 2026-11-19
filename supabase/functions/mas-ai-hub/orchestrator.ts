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
