// analytics.ts — حسابات دقيقة تُجرى في الكود (لا في النموذج): النماذج اللغوية تخطئ في الحساب والنسب.
// المدخل هو ناتج mas_ai_facts. المخرج مختصر (أقل من ~4 آلاف حرف) ويُرسل للنموذج في كتلة <insights>.
// دوال نقية بلا شبكة وقابلة للاختبار.

const SEC_AR: Record<string, string> = {
  casting: "الصب", brush: "البرشر", glaze: "الجليز", deco: "الزخرفة", spray: "الرش", repair: "التصليح", finish: "التشطيب", fire: "الحريق",
};
const DAY_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (a: number, b: number) => (b > 0 ? r1((100 * a) / b) : null);
const chg = (cur: number, prev: number) => (prev > 0 ? r1((100 * (cur - prev)) / prev) : null);
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

export function addDaysIso(iso: string, k: number): string {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 864e5) + 1;
}
/** الفترة السابقة بنفس الطول مباشرةً قبل الفترة الحالية. */
export function prevRange(from: string, to: string): { from: string; to: string } {
  const len = daysBetween(from, to);
  const pTo = addDaysIso(from, -1);
  return { from: addDaysIso(pTo, -(len - 1)), to: pTo };
}

function sectionTotals(f: any): Record<string, { total: number; entries: number; days: number; waste: number }> {
  const o: Record<string, { total: number; entries: number; days: number; waste: number }> = {};
  for (const p of arr(f?.production_by_section)) o[p.sec] = { total: n(p.total), entries: n(p.entries), days: n(p.active_days), waste: 0 };
  for (const w of arr(f?.waste_by_section)) { (o[w.sec] ??= { total: 0, entries: 0, days: 0, waste: 0 }).waste = n(w.waste_qty); }
  return o;
}

export function buildInsights(cur: any, prev?: any | null): Record<string, unknown> {
  const from: string = cur?.period?.from, to: string = cur?.period?.to;
  const span = from && to ? daysBetween(from, to) : 0;
  const secs = sectionTotals(cur);
  const psecs = prev ? sectionTotals(prev) : null;

  const prodTotal = Object.values(secs).reduce((a, s) => a + s.total, 0);
  const wasteTotal = Object.values(secs).reduce((a, s) => a + s.waste, 0);
  const pProd = psecs ? Object.values(psecs).reduce((a, s) => a + s.total, 0) : 0;
  const pWaste = psecs ? Object.values(psecs).reduce((a, s) => a + s.waste, 0) : 0;

  const by_section = Object.entries(secs)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([sec, s]) => {
      const p = psecs?.[sec];
      return {
        section: SEC_AR[sec] ?? sec, key: sec, total: s.total, share_pct: pct(s.total, prodTotal),
        active_days: s.days, avg_per_active_day: s.days ? Math.round(s.total / s.days) : null,
        waste: s.waste, waste_pct_of_production: pct(s.waste, s.total),
        ...(p ? { prev_total: p.total, change_pct: chg(s.total, p.total), prev_waste_pct: pct(p.waste, p.total) } : {}),
      };
    });

  // يومي (كل الأقسام معًا)
  const dayMap = new Map<string, number>();
  for (const d of arr(cur?.daily_production)) dayMap.set(d.d, (dayMap.get(d.d) ?? 0) + n(d.q));
  const days = [...dayMap.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, q]) => ({ d, q }));
  const active = days.filter((x) => x.q > 0);
  const mean = active.length ? active.reduce((a, x) => a + x.q, 0) / active.length : 0;
  const sd = active.length > 1 ? Math.sqrt(active.reduce((a, x) => a + (x.q - mean) ** 2, 0) / (active.length - 1)) : 0;

  const best = active.length ? active.reduce((a, x) => (x.q > a.q ? x : a)) : null;
  const low = active.length ? active.reduce((a, x) => (x.q < a.q ? x : a)) : null;
  const anomalies = sd > 0
    ? active.filter((x) => Math.abs(x.q - mean) > 2 * sd).slice(0, 5).map((x) => ({ d: x.d, q: Math.round(x.q), vs_avg_pct: chg(x.q, mean) }))
    : [];

  // اتجاه: آخر 7 أيام مقابل 7 قبلها (داخل الفترة فقط)
  let trend: Record<string, unknown> | null = null;
  if (to && span >= 14) {
    const sum = (a: string, b: string) => days.filter((x) => x.d >= a && x.d <= b).reduce((s, x) => s + x.q, 0);
    const l7 = sum(addDaysIso(to, -6), to), p7 = sum(addDaysIso(to, -13), addDaysIso(to, -7));
    trend = { last_7_days: Math.round(l7), previous_7_days: Math.round(p7), change_pct: chg(l7, p7) };
  }

  // متوسط حسب اليوم من الأسبوع (للأيام التي بها إنتاج)
  const wd: number[][] = [[], [], [], [], [], [], []];
  for (const x of active) wd[new Date(x.d + "T00:00:00Z").getUTCDay()].push(x.q);
  const weekday_avg = wd.map((a, i) => (a.length >= 2 ? { day: DAY_AR[i], avg: Math.round(a.reduce((s, v) => s + v, 0) / a.length), n: a.length } : null)).filter(Boolean);

  // أعلى الأصناف إجمالًا عبر الأقسام
  const itemMap = new Map<string, number>();
  for (const t of arr(cur?.top_items)) itemMap.set(String(t.item), (itemMap.get(String(t.item)) ?? 0) + n(t.q));
  const top_items = [...itemMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([item, q]) => ({ item, q: Math.round(q) }));

  const out: Record<string, unknown> = {
    period: { from, to, days: span },
    totals: {
      production: Math.round(prodTotal), waste: Math.round(wasteTotal), waste_pct_of_production: pct(wasteTotal, prodTotal),
      active_days: active.length, days_without_entries: Math.max(0, span - active.length),
      avg_per_active_day: active.length ? Math.round(mean) : null,
    },
    by_section,
    best_day: best ? { d: best.d, q: Math.round(best.q) } : null,
    lowest_active_day: low ? { d: low.d, q: Math.round(low.q) } : null,
    ...(anomalies.length ? { unusual_days: anomalies } : {}),
    ...(trend ? { trend_last_7_vs_previous_7: trend } : {}),
    ...(weekday_avg.length ? { weekday_avg } : {}),
    top_items,
    recent_days: days.slice(-10).map((x) => ({ d: x.d, q: Math.round(x.q) })),
  };
  if (psecs) {
    out.vs_previous_period = {
      period: prev?.period ?? null, production: Math.round(pProd), waste: Math.round(pWaste),
      production_change_pct: chg(prodTotal, pProd), waste_pct_of_production: pct(pWaste, pProd),
    };
  }
  return out;
}

/** يقلّص حمولة البيانات لحدّ حروف آمن (حدود الرموز في المزودين المجانيين ضيقة). */
export function compactFacts(facts: any, task: string, webUsed: boolean, maxChars = 18000): unknown {
  if (!facts) return null;
  if (task === "general") {
    if (webUsed) return null; // سؤال خارجي: يكفي <insights>
    return { period: facts.period, production_by_section: facts.production_by_section, waste_by_section: facts.waste_by_section };
  }
  let f = { ...facts };
  if (JSON.stringify(f).length > maxChars) f = { ...f, daily_production: [] }; // التفصيل اليومي ملخّص في insights
  if (JSON.stringify(f).length > maxChars) {
    for (const k of ["top_items", "top_colors", "top_waste_items"]) f[k] = arr(f[k]).slice(0, 12);
  }
  return f;
}
