// طبقة الكتابة الآمنة للمساعد: قائمة سماح صغيرة بالجداول التي تم التحقق من هيكلها، مع تحقق صارم من المدخلات.
export const WSECS: Record<string, { table: string; date: string; text: "item" | "task"; label: string; scrap: boolean; shift: boolean; qtyMin: number; note?: boolean }> = {
  casting: { table: "casting_log", date: "casting_date", text: "item", label: "الصب",   scrap: false, shift: false, qtyMin: 1 },
    brush:   { table: "brush_log",   date: "brush_date",   text: "item", label: "البرشر", scrap: true,  shift: true,  qtyMin: 0 },
      finish:  { table: "finish_log",  date: "finish_date",  text: "task", label: "التشطيب", scrap: true, shift: true,  qtyMin: 0 },
  repair:  { table: "repair_log",  date: "repair_date",  text: "item", label: "التصليح", scrap: false, shift: false, qtyMin: 1, note: false },
      };
      const SHIFTS = ["صباحي", "مسائي", "ليلي"], TASKS = ["مشرط", "مياه", "صنفرة"], MAX_ROWS = 60;
      const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

      const int = (v: unknown) => { const n = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : Math.round(n); };
      const str = (v: unknown, n: number) => { const t = typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n) : ""; return t || null; };

      export function dateInRange(d: string, today: string): boolean {
        if (!DATE_RE.test(d)) return false;
          const t = Date.parse(d + "T00:00:00Z"), now = Date.parse(today + "T00:00:00Z");
            return Number.isFinite(t) && t <= now + 864e5 && t >= now - 400 * 864e5;
            }

            export type Built = { ok: true; rows: Record<string, unknown>[] } | { ok: false; message: string };
            export function buildRows(sec: string, date: string, rows: unknown, today: string, uuid: () => string): Built {
              const c = WSECS[sec];
                if (!c) return { ok: false, message: "هذا القسم غير مدعوم للكتابة المباشرة." };
                  if (!dateInRange(String(date), today)) return { ok: false, message: "التاريخ غير صالح أو بعيد جدًا." };
                    if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_ROWS) return { ok: false, message: `عدد السطور لازم بين 1 و${MAX_ROWS}.` };
                      const out: Record<string, unknown>[] = [];
                        for (let i = 0; i < rows.length; i++) {
                            const r: any = rows[i], n = i + 1;
                                const label = str(r?.item, 120);
                                    if (!label) return { ok: false, message: `سطر ${n}: الاسم ناقص.` };
                                        if (c.text === "task" && !TASKS.includes(label)) return { ok: false, message: `سطر ${n}: النشاط لازم يكون مشرط أو مياه أو صنفرة.` };
                                            const qty = int(r?.qty);
                                                if (qty === null || qty < c.qtyMin || qty > 100000) return { ok: false, message: `سطر ${n}: العدد غير صالح.` };
                                                    const row: Record<string, unknown> = { [c.date]: date, [c.text]: label, qty, worker: str(r?.worker, 80) };
 if (c.note !== false) row.note = str(r?.note, 300);
                                                        if (c.scrap) {
                                                              const sc = int(r?.scrap) ?? 0;
                                                                    if (sc < 0 || sc > 100000) return { ok: false, message: `سطر ${n}: الهالك غير صالح.` };
                                                                          if (qty + sc <= 0) return { ok: false, message: `سطر ${n}: العدد والهالك صفر.` };
                                                                                row.scrap = sc;
                                                                                    }
                                                                                        if (c.shift) { const sh = str(r?.shift, 20); if (sh && !SHIFTS.includes(sh)) return { ok: false, message: `سطر ${n}: الوردية غير صالحة.` }; row.shift = sh; row.client_id = uuid(); }
                                                                                            out.push(row);
                                                                                              }
                                                                                                return { ok: true, rows: out };
                                                                                                }

                                                                                                export interface Filter { from: string; to: string; item: string | null; worker: string | null; limit: number }
                                                                                                export function buildFilter(f: any, today: string): { ok: true; f: Filter } | { ok: false; message: string } {
                                                                                                  const from = String(f?.from ?? f?.date ?? ""), to = String(f?.to ?? f?.date ?? from);
                                                                                                    if (!dateInRange(from, today) || !dateInRange(to, today) || from > to) return { ok: false, message: "حدّد تاريخًا أو فترة صحيحة للبحث." };
                                                                                                      if ((Date.parse(to) - Date.parse(from)) / 864e5 > 92) return { ok: false, message: "الفترة أطول من 3 شهور. قلّلها." };
                                                                                                        const esc = (s: string | null) => s ? s.replace(/[%_\\,()*]/g, " ").trim().slice(0, 80) || null : null;
                                                                                                          return { ok: true, f: { from, to, item: esc(str(f?.item, 80)), worker: esc(str(f?.worker, 80)), limit: Math.min(100, Math.max(1, int(f?.limit) ?? 100)) } };
                                                                                                          }

                                                                                                          export const cleanIds = (ids: unknown): number[] | null => {
                                                                                                            if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50) return null;
                                                                                                              const o = ids.map((x) => Number(x));
                                                                                                                return o.every((n) => Number.isInteger(n) && n > 0) ? [...new Set(o)] : null;
                                                                                                                };