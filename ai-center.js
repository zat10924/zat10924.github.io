/* ai-center.js — MAS AI CENTER
   الجزء 1: منطق الاستيراد الخارجي (JSON / CSV) → بنية المراجعة الموحدة (نفس شكل m.imp في ai.html).
   لا يكتب في أي جدول ولا يتصل بالإنترنت. كل النصوص تُعرض لاحقًا عبر esc() وليس innerHTML خام. */
(function (root) {
  "use strict";

  const LIMITS = { bytes: 1024 * 1024, rows: 500, item: 120, worker: 60, shift: 20, note: 300, notes: 500, qtyMax: 100000 };
  const SECN_DEFAULT = { casting: "الصب", brush: "البرشر", glaze: "الجليز", deco: "الزخرفة", spray: "الرش", repair: "التصليح", finish: "التشطيب", fire: "الحريق" };
  const SEC_ALIAS = { decoration: "deco", decor: "deco", glazing: "glaze", spraying: "spray", repairs: "repair", finishing: "finish" };
  const KNOWN_TOP = ["schema_version", "source", "report_type", "report_date", "date", "section", "items", "rows", "notes"];
  const KNOWN_ROW = ["item", "color", "code", "qty", "scrap", "worker", "shift", "note"];
  const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

  const norm = s => String(s == null ? "" : s).toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
    .replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d)).replace(/\s+/g, " ").trim();
  const hk = s => norm(s).replace(/[\s_\-.:]/g, "");
  const noAl = s => norm(s).replace(/^ال/, "");

  /* أسماء الأعمدة المقبولة (عربي/إنجليزي) → الحقل الداخلي */
  const HEAD = {};
  [["item", ["item", "name", "product", "الصنف", "اسم الصنف", "صنف", "الاسم", "البند"]],
   ["color", ["color", "colour", "اللون", "لون"]],
   ["code", ["code", "كود", "الكود", "كود الرسمة", "الرسمة", "رسمة", "sub"]],
   ["qty", ["qty", "quantity", "count", "العدد", "الكمية", "كمية", "عدد"]],
   ["scrap", ["scrap", "waste", "defect", "الهالك", "هالك", "التالف"]],
   ["worker", ["worker", "employee", "operator", "العامل", "عامل", "الموظف"]],
   ["shift", ["shift", "الوردية", "وردية"]],
   ["note", ["note", "notes", "remark", "ملاحظة", "ملاحظات"]],
   ["section", ["section", "القسم", "قسم"]],
   ["date", ["date", "report_date", "التاريخ", "تاريخ"]]
  ].forEach(([k, a]) => a.forEach(n => { HEAD[hk(n)] = k; }));

  /* ---------- أدوات صغيرة ---------- */
  function resolveSection(x, secn) {
    secn = secn || SECN_DEFAULT;
    if (x == null || String(x).trim() === "") return { v: "" };
    const raw = String(x).trim(), k = norm(raw);
    if (secn[k]) return { v: k };
    if (SEC_ALIAS[k]) return { v: SEC_ALIAS[k] };
    for (const key of Object.keys(secn)) if (noAl(secn[key]) === noAl(raw)) return { v: key };
    return { v: "", err: "القسم «" + raw.slice(0, 40) + "» غير معروف" };
  }

  function normDate(x) {
    if (x == null || String(x).trim() === "") return { v: "" };
    const raw = String(x).trim();
    const s = raw.replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d)).replace(/[/.]/g, "-");
    const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
    if (!m) return { v: "", err: "التاريخ «" + raw.slice(0, 30) + "» غير صالح (الصيغة المطلوبة YYYY-MM-DD)" };
    const y = +m[1], mo = +m[2], d = +m[3], t = new Date(Date.UTC(y, mo - 1, d));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return { v: "", err: "التاريخ «" + raw.slice(0, 30) + "» غير موجود في التقويم" };
    return { v: m[1] + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0") };
  }

  /* يرجع {v,err}: v=null لو فارغ. لا يقبل السالب ولا الكسر ولا غير الرقمي. */
  function toNum(x) {
    if (x == null || (typeof x === "string" && x.trim() === "")) return { v: null };
    if (typeof x === "boolean" || typeof x === "object") return { v: null, err: "قيمة غير رقمية" };
    let n;
    if (typeof x === "number") n = x;
    else {
      const s = String(x).trim().replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d)).replace(/[٬,\s]/g, "").replace(/٫/g, ".");
      if (!/^-?\d+(\.\d+)?$/.test(s)) return { v: null, err: "«" + String(x).slice(0, 20) + "» ليست رقمًا" };
      n = parseFloat(s);
    }
    if (!isFinite(n)) return { v: null, err: "قيمة غير رقمية" };
    if (n < 0) return { v: null, err: "القيمة سالبة (" + n + ")" };
    if (!Number.isInteger(n)) return { v: null, err: "القيمة ليست عددًا صحيحًا (" + n + ")" };
    if (n > LIMITS.qtyMax) return { v: null, err: "القيمة أكبر من الحد المسموح (" + LIMITS.qtyMax + ")" };
    return { v: n };
  }

  /* تنظيف نص: يشيل رموز التحكم والوسوم (لا HTML ولا JS يمر)، ويقصّ للحد. */
  function cleanText(x, max) {
    if (x == null) return { v: null, flags: [] };
    if (typeof x === "object") return { v: null, flags: [], err: "قيمة غير نصية" };
    let s = String(x), flags = [];
    s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/[\r\n\t]+/g, " ");
    if (/<[^>]*>/.test(s)) { s = s.replace(/<[^>]*>/g, ""); flags.push("أُزيلت وسوم HTML من النص"); }
    s = s.replace(/\s+/g, " ").trim();
    if (s.length > max) { s = s.slice(0, max); flags.push("قُصّ النص إلى " + max + " حرفًا"); }
    return { v: s || null, flags };
  }

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    text = String(text).replace(/^\uFEFF/, "");
    const first = text.split(/\r?\n/).find(l => l.trim() !== "") || "";
    const cnt = ch => (first.match(new RegExp(ch === "\t" ? "\\t" : "\\" + ch, "g")) || []).length;
    const ranked = [",", ";", "\t"].map(d => [d, cnt(d)]).sort((a, b) => b[1] - a[1]);
    const delim = ranked[0][1] ? ranked[0][0] : ",";
    const out = []; let row = [], cell = "", q = false, line = 1, startLine = 1, i = 0, any = false;
    const endCell = () => { row.push(cell); cell = ""; };
    const endRow = () => { endCell(); if (row.some(c => c.trim() !== "")) out.push({ line: startLine, cells: row }); row = []; any = false; };
    while (i < text.length) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i += 2; continue; } q = false; i++; continue; }
        if (c === "\n") line++;
        cell += c; i++; continue;
      }
      if (c === '"' && cell === "") { q = true; any = true; i++; continue; }
      if (c === delim) { endCell(); i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { endRow(); line++; startLine = line; i++; continue; }
      cell += c; i++;
    }
    if (q) return { error: "علامة اقتباس غير مغلقة بدءًا من السطر " + startLine };
    if (cell !== "" || row.length) endRow();
    return { rows: out, delimiter: delim };
  }

  function jsonErrPos(text, e) {
    const msg = String((e && e.message) || "");
    let m = msg.match(/line (\d+) column (\d+)/i);
    if (m) return { line: +m[1], col: +m[2] };
    m = msg.match(/position (\d+)/i);
    if (m) { const pos = +m[1], pre = text.slice(0, pos).split("\n"); return { line: pre.length, col: pre[pre.length - 1].length + 1 }; }
    return null;
  }

  /* ---------- التحويل الموحد ---------- */
  function newCtx(opts) {
    return { secn: (opts && opts.secn) || SECN_DEFAULT, notices: [], errors: [], today: (opts && opts.today) || new Date().toISOString().slice(0, 10) };
  }
  const bad = (ctx, t) => ctx.errors.push(t);
  const note = (ctx, t) => { if (ctx.notices.indexOf(t) < 0) ctx.notices.push(t); };

  /* rawRows: [{label:"السطر 7"|"العنصر 3", o:{item,qty,...}, extra:[unknown keys]}] */
  function buildRows(rawRows, ctx) {
    const rows = []; let skipped = 0; const unk = {};
    rawRows.forEach(rr => {
      const o = rr.o, r = { item: null, color: null, code: null, qty: null, scrap: null, worker: null, shift: null, note: null, _err: [] };
      const lab = " (" + rr.label + ")";
      const it = cleanText(o.item, LIMITS.item); r.item = it.v; if (it.err) r._err.push({ k: "item", t: "الصنف: " + it.err + lab }); it.flags.forEach(f => note(ctx, "الصنف — " + f + lab));
      { const c = cleanText(o.color, 80); r.color = c.v; }
      { const c = cleanText(o.code, 40); r.code = c.v; }
      ["qty", "scrap"].forEach(k => {
        const n = toNum(o[k]); r[k] = n.v;
        if (n.err) r._err.push({ k, t: (k === "qty" ? "العدد: " : "الهالك: ") + n.err + lab });
      });
      [["worker", LIMITS.worker, "العامل"], ["shift", LIMITS.shift, "الوردية"], ["note", LIMITS.note, "الملاحظة"]].forEach(([k, mx, nm]) => {
        const t = cleanText(o[k], mx); r[k] = t.v; if (t.err) r._err.push({ k, t: nm + ": " + t.err + lab }); t.flags.forEach(f => note(ctx, nm + " — " + f + lab));
      });
      const hasAny = r.item || r.code || r.qty != null || r.scrap != null || r.worker || r.shift || r.note || r._err.length;
      if (!hasAny) { skipped++; return; }
      (rr.extra || []).forEach(k => { unk[k] = (unk[k] || 0) + 1; });
      rows.push(r);
    });
    if (skipped) note(ctx, "تم تجاهل " + skipped + " صف فارغ.");
    const uk = Object.keys(unk);
    if (uk.length) note(ctx, "حقول غير معروفة لم تُستورد (راجعها): " + uk.slice(0, 8).map(k => "«" + k.slice(0, 30) + "»").join("، ") + (uk.length > 8 ? " …" : ""));
    return rows;
  }

  function finish(ctx, sec, date, rows, meta) {
    if (!rows.length && !ctx.errors.length) bad(ctx, "لا توجد أي صفوف قابلة للاستيراد في البيانات.");
    if (ctx.errors.length) return { ok: false, errors: ctx.errors, notices: ctx.notices };
    if (date.v && date.v < new Date(Date.parse(ctx.today + "T00:00:00Z") - 400 * 864e5).toISOString().slice(0, 10)) note(ctx, "التاريخ أقدم من 400 يوم، وقد يرفضه الخادم عند الحفظ المباشر.");
    return {
      ok: true, errors: [], notices: ctx.notices,
      imp: { source: "chatgpt", confidence: null, section: sec.v, date: date.v, notes: "", rows, notices: ctx.notices.slice(), meta }
    };
  }

  function fromJSON(text, ctx, opts) {
    let t = String(text).replace(/^\uFEFF/, "").trim();
    t = t.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```\s*$/, "").trim();
    if (!t) { bad(ctx, "النص فارغ."); return null; }
    let data;
    try { data = JSON.parse(t); } catch (e) {
      const p = jsonErrPos(t, e);
      bad(ctx, "JSON غير صالح" + (p ? " عند السطر " + p.line + " والعمود " + p.col : "") + ". تأكد من علامات الاقتباس والفواصل والأقواس، وأن النص JSON فقط بدون شرح.");
      return null;
    }
    let top = {}, items;
    if (Array.isArray(data)) items = data;
    else if (data && typeof data === "object") {
      top = data; items = Array.isArray(data.items) ? data.items : Array.isArray(data.rows) ? data.rows : null;
      if (!items) { bad(ctx, "الحقل items مفقود أو ليس قائمة. استخدم القالب المعروض في الصفحة."); return null; }
      const unk = Object.keys(data).filter(k => KNOWN_TOP.indexOf(k) < 0);
      if (unk.length) note(ctx, "حقول غير معروفة في أعلى الملف لم تُستورد: " + unk.slice(0, 8).map(k => "«" + k.slice(0, 30) + "»").join("، "));
      if (top.schema_version != null && String(top.schema_version) !== "1.0") note(ctx, "إصدار القالب «" + String(top.schema_version).slice(0, 10) + "» غير الإصدار المعتمد 1.0؛ راجع الحقول جيدًا.");
      if (top.source != null && String(top.source) !== "chatgpt_external") note(ctx, "قيمة source غير المتوقعة «" + String(top.source).slice(0, 30) + "».");
      if (top.report_type != null && String(top.report_type) !== "daily") note(ctx, "نوع التقرير «" + String(top.report_type).slice(0, 30) + "» غير معروف؛ يُعامل كتقرير يومي.");
    } else { bad(ctx, "الجذر يجب أن يكون كائنًا أو قائمة."); return null; }
    if (!items.length) { bad(ctx, "قائمة items فارغة."); return null; }
    if (items.length > LIMITS.rows) { bad(ctx, "عدد الصفوف " + items.length + " أكبر من الحد المسموح " + LIMITS.rows + ". قسّم الملف."); return null; }
    const raw = items.map((o, i) => {
      if (!o || typeof o !== "object" || Array.isArray(o)) { return { label: "العنصر " + (i + 1), o: {}, extra: [], _bad: true }; }
      return { label: "العنصر " + (i + 1), o, extra: Object.keys(o).filter(k => KNOWN_ROW.indexOf(k) < 0) };
    });
    const badIdx = raw.map((r, i) => r._bad ? i + 1 : 0).filter(Boolean);
    if (badIdx.length) note(ctx, "عناصر ليست كائنات وتم تجاهلها: " + badIdx.slice(0, 8).join("، "));
    const sec = resolveSection(top.section != null ? top.section : opts && opts.section, ctx.secn);
    if (sec.err) note(ctx, sec.err + " — اختر القسم يدويًا.");
    const dt = normDate(top.report_date != null ? top.report_date : top.date != null ? top.date : opts && opts.date);
    if (dt.err) note(ctx, dt.err + " — حدّد التاريخ يدويًا.");
    const rows = buildRows(raw.filter(r => !r._bad), ctx);
    return { sec, dt, rows, meta: { fileType: "json", report_type: top.report_type || "daily", schema_version: top.schema_version || "" } };
  }

  function fromCSV(text, ctx, opts) {
    const p = parseCSV(text);
    if (p.error) { bad(ctx, p.error); return null; }
    if (!p.rows.length) { bad(ctx, "الملف فارغ."); return null; }
    const head = p.rows[0].cells.map(c => c.trim()), map = head.map(h => HEAD[hk(h)] || null);
    if (map.indexOf("item") < 0) {
      bad(ctx, "العمود المطلوب «item» أو «الصنف» غير موجود في السطر الأول. الأعمدة الموجودة: " + head.slice(0, 10).map(h => "«" + h.slice(0, 30) + "»").join("، ") + ".");
      return null;
    }
    const dup = map.filter((k, i) => k && map.indexOf(k) !== i);
    if (dup.length) note(ctx, "أعمدة مكررة بنفس المعنى؛ اعتُمد أول عمود منها.");
    const unkCols = head.filter((h, i) => !map[i] && h);
    if (unkCols.length) note(ctx, "أعمدة غير معروفة لم تُستورد: " + unkCols.slice(0, 8).map(h => "«" + h.slice(0, 30) + "»").join("، "));
    if (!(map.indexOf("qty") >= 0)) note(ctx, "عمود العدد (qty / العدد) غير موجود؛ ستظهر الأعداد فارغة للمراجعة.");
    const data = p.rows.slice(1);
    if (!data.length) { bad(ctx, "الملف يحتوي على سطر العناوين فقط بلا بيانات."); return null; }
    if (data.length > LIMITS.rows) { bad(ctx, "عدد الصفوف " + data.length + " أكبر من الحد المسموح " + LIMITS.rows + ". قسّم الملف."); return null; }
    let secV = "", dateV = "";
    const raw = data.map(r => {
      const o = {}, extra = [];
      map.forEach((k, i) => {
        if (!k || (k in o)) return;
        o[k] = r.cells[i] == null ? "" : r.cells[i];
      });
      if (r.cells.length > head.length && r.cells.slice(head.length).some(c => c.trim())) extra.push("عمود بلا عنوان");
      if (o.section && !secV) secV = o.section;
      if (o.date && !dateV) dateV = o.date;
      return { label: "السطر " + r.line, o, extra };
    });
    const secs = Array.from(new Set(raw.map(r => String(r.o.section || "").trim()).filter(Boolean)));
    if (secs.length > 1) note(ctx, "الملف يحتوي أكثر من قسم (" + secs.slice(0, 4).map(s => "«" + s.slice(0, 20) + "»").join("، ") + ")؛ اعتُمد أول قسم. افصل كل قسم في ملف مستقل.");
    const dts = Array.from(new Set(raw.map(r => String(r.o.date || "").trim()).filter(Boolean)));
    if (dts.length > 1) note(ctx, "الملف يحتوي أكثر من تاريخ؛ اعتُمد أول تاريخ. افصل كل يوم في ملف مستقل.");
    const sec = resolveSection(secV || (opts && opts.section), ctx.secn);
    if (sec.err) note(ctx, sec.err + " — اختر القسم يدويًا.");
    const dt = normDate(dateV || (opts && opts.date));
    if (dt.err) note(ctx, dt.err + " — حدّد التاريخ يدويًا.");
    const rows = buildRows(raw, ctx);
    return { sec, dt, rows, meta: { fileType: "csv", report_type: "daily", delimiter: p.delimiter } };
  }

  /* الدالة الرئيسية: normalizeExternalImport(input, fileType, opts)
     input: نص JSON/CSV (أو كائن JSON جاهز). fileType: "json" | "csv" | "text" (يخمّن) | "xlsx" (غير مدعوم). */
  function normalizeExternalImport(input, fileType, opts) {
    const ctx = newCtx(opts);
    if (fileType === "xlsx") {
      bad(ctx, "ملفات Excel (XLSX) غير مدعومة حاليًا داخل البرنامج. افتح الملف في Excel واحفظه بصيغة CSV UTF-8 ثم ارفعه.");
      return { ok: false, errors: ctx.errors, notices: [] };
    }
    let text = input;
    if (input && typeof input === "object") text = JSON.stringify(input);
    if (text == null || String(text).trim() === "") { bad(ctx, "الملف أو النص فارغ."); return { ok: false, errors: ctx.errors, notices: [] }; }
    text = String(text);
    if (text.length > LIMITS.bytes) { bad(ctx, "الحجم أكبر من الحد المسموح (" + Math.round(LIMITS.bytes / 1024) + " كيلوبايت)."); return { ok: false, errors: ctx.errors, notices: [] }; }
    let ft = fileType;
    if (ft !== "json" && ft !== "csv") { const s = text.replace(/^\uFEFF/, "").trim(); ft = /^(\{|\[|```)/.test(s) ? "json" : "csv"; }
    const r = ft === "json" ? fromJSON(text, ctx, opts) : fromCSV(text, ctx, opts);
    if (!r) return { ok: false, errors: ctx.errors, notices: ctx.notices };
    return finish(ctx, r.sec, r.dt, r.rows, r.meta);
  }

  /* حقول كل قسم في القالب (تعديل هذا الجدول فقط يغيّر القالب والتعليمات) */
  const SEC_FIELDS = {
    casting: ["item", "qty", "worker", "note"],
    brush:   ["item", "qty", "scrap", "shift", "worker", "note"],
    glaze:   ["item", "color", "qty", "note"],
    deco:    ["item", "code", "qty", "worker", "note"],
    spray:   ["item", "color", "qty", "note"],
    repair:  ["item", "color", "qty", "worker"],
    finish:  ["item", "qty", "scrap", "shift", "worker", "note"],
    fire:    ["item", "color", "qty", "worker", "note"]
  };
  const SEC_HINT = {
    brush: "shift واحدة من: صباحي, مسائي, ليلي.",
    finish: "item يجب أن يكون واحدًا فقط من: مشرط, مياه, صنفرة (نوع النشاط). shift واحدة من: صباحي, مسائي, ليلي.",
    casting: "qty أكبر من صفر.",
    repair: "qty أكبر من صفر.",
    deco: "code هو كود الرسمة (مثل ما هو مكتوب في السجل) واكتبه في حقل code وليس داخل اسم الصنف."
  };
  const FIELD_DEF = { item: "اسم الصنف", color: "", code: "", qty: 0, scrap: 0, worker: "", shift: "", note: "" };
  function templateFor(sec) {
    const f = SEC_FIELDS[sec] || ["item", "color", "qty", "scrap", "worker", "shift", "note"];
    const row = {}; f.forEach(k => { row[k] = FIELD_DEF[k]; });
    if (sec === "finish") row.item = "مشرط";
    return { schema_version: "1.0", source: "chatgpt_external", report_type: "daily", report_date: "YYYY-MM-DD", section: SEC_FIELDS[sec] ? sec : "glaze", items: [row], notes: "" };
  }
  function promptFor(sec) {
    const known = !!SEC_FIELDS[sec], name = known ? (SECN_DEFAULT[sec] || sec) : "";
    const hasScrap = !known || SEC_FIELDS[sec].indexOf("scrap") >= 0;
    return "حوّل بيانات الإنتاج في الصورة المرفقة إلى JSON فقط (بدون أي شرح أو نص قبله أو بعده) بهذا القالب بالضبط.\n" +
      (known ? "القسم: " + name + " (section = " + sec + "). لا تغيّر قيمة section ولا تضف حقولًا غير الموجودة في القالب.\n"
             : "section واحد من: casting, brush, glaze, deco, spray, repair, finish, fire.\n") +
      "التاريخ بصيغة YYYY-MM-DD.\n" +
      "qty" + (hasScrap ? " و scrap" : "") + " أرقام صحيحة غير سالبة. اترك الحقل فارغًا إذا لم يظهر في الصورة، ولا تخمّن أي رقم.\n" +
      (SEC_HINT[sec] ? SEC_HINT[sec] + "\n" : "") +
      "إن لم يكن الخط واضحًا اكتب ذلك في الحقل note للسطر نفسه" + (known && SEC_FIELDS[sec].indexOf("note") < 0 ? " (أو في notes أعلى الملف)" : "") + ".\n\n" +
      JSON.stringify(templateFor(sec), null, 2);
  }
  const TEMPLATE = templateFor("glaze");
  const CHATGPT_PROMPT = promptFor("");

  const API = { LIMITS, TEMPLATE, CHATGPT_PROMPT, templateFor, promptFor, SEC_FIELDS, normalizeExternalImport, parseCSV, toNum, normDate, resolveSection, cleanText };
  root.MasAiImport = API;
  root.normalizeExternalImport = normalizeExternalImport;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);

/* ===================================================================================================
   الجزء 2: واجهة MAS AI CENTER (تبويبات، استيراد خارجي، مراجعة موحدة، سجل عمليات، نظرة عامة، المحركات)
   يعتمد على دوال ai.html الحالية (impDraw / impCheck / validate / loadCat / masAi ...) ولا يكرّرها.
   لا يكتب في جداول الإنتاج. سجل العمليات يُحفظ على هذا الجهاز فقط (ملخص بلا محتوى كامل).
   =================================================================================================== */
(function () {
  "use strict";
  if (typeof document === "undefined" || !document.getElementById("x_app")) return;
  const $ = id => document.getElementById(id);
  const MAC = window.MAC = {};
  const TABS = ["ov", "quick", "chat", "vis", "ext", "rev", "log", "eng"];
  const SRC = { internal: "مساعد داخلي", chatgpt: "ChatGPT خارجي", image: "صورة" };
  const STATS = ["قيد المراجعة", "تم التجهيز", "تم الاعتماد", "فشل", "أُلغي"];
  const SCLS = { "قيد المراجعة": "rv", "تم التجهيز": "pr", "تم الاعتماد": "ok", "فشل": "bd", "أُلغي": "cx" };
  let RVM = null, RVLOG = null, GO = false, IMB = false, VB = false, FT = "text", ENGINFO = "", curTab = "ov";
  const isAdmin = () => !!ME && ME.role === "admin";
  const secName = k => (typeof SECN !== "undefined" && SECN[k]) || k || "—";
  const fmtT = t => { try { return new Date(t).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };

  /* ---------- سجل العمليات (على هذا الجهاز، ملخص فقط) ---------- */
  const opKey = () => "mas_ai_ops_v1_" + ((ME && ME.id) || "x");
  const opsLoad = () => { try { const a = JSON.parse(localStorage.getItem(opKey()) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const opsSave = a => { try { localStorage.setItem(opKey(), JSON.stringify(a.slice(0, 200))); } catch (e) { } };
  const counts = v => { const r = validate(v); return { warn: r.W.length, err: r.E.length }; };
  function opAdd(o) {
    const a = opsLoad(), e = Object.assign({ id: uid(), t: Date.now(), user: (ME && ME.name) || "", rows: 0, warn: 0, err: 0, msg: "" }, o);
    a.unshift(e); opsSave(a); refresh(); return e.id;
  }
  function opSet(id, p) {
    if (!id) return; const a = opsLoad(), e = a.find(x => x.id === id); if (!e) return;
    Object.assign(e, p); opsSave(a); refresh();
  }
  MAC.track = (v, src, type) => { const c = counts(v); v.source = src; v._op = opAdd({ src, type, sec: v.section || "", date: v.date || "", rows: v.rows.length, warn: c.warn, err: c.err, status: "قيد المراجعة" }); };
  MAC.touch = (v, status, msg) => { if (!v || !v._op) return; const c = counts(v); opSet(v._op, { status, rows: v.rows.length, warn: c.warn, err: c.err, sec: v.section || "", date: v.date || "", msg: String(msg || "").slice(0, 200) }); };
  MAC.logFail = (src, type, msg, n) => opAdd({ src, type, rows: 0, warn: 0, err: n || 1, status: "فشل", msg: String(msg || "").slice(0, 200) });

  /* ---------- فحص التكرار مقابل السجلات المحفوظة (الجداول التي تحقق منها writer.ts فقط) ---------- */
  const DUPM = { casting: { t: "casting_log", d: "casting_date", x: "item" }, brush: { t: "brush_log", d: "brush_date", x: "item" }, finish: { t: "finish_log", d: "finish_date", x: "task" } };
  const dupCache = new Map();
  MAC.dup = async function (v, force) {
    if (!v || !v.rows) return;
    const c = DUPM[v.section];
    if (!v.section || !v.date) { v._dupInfo = ""; v.rows.forEach(r => { delete r._dup; }); return; }
    if (!c) { v._dupInfo = "فحص التكرار مقابل السجلات المحفوظة غير متاح لهذا القسم هنا؛ راجع السجلات الحالية في صفحة القسم قبل الحفظ."; v.rows.forEach(r => { delete r._dup; }); return; }
    const key = v.section + "|" + v.date, hit = dupCache.get(key);
    let list;
    if (hit && !force && Date.now() - hit.t < 60000) list = hit.rows;
    else {
      try {
        const q = await db.from(c.t).select("qty,worker," + c.x).eq(c.d, v.date).limit(500);
        if (q.error) throw q.error;
        list = q.data || []; dupCache.set(key, { t: Date.now(), rows: list });
      } catch (e) { v._dupInfo = "تعذّر فحص التكرار مقابل السجلات المحفوظة (الصلاحية أو الاتصال). راجعها يدويًا."; return; }
    }
    v._dupInfo = "";
    v.rows.forEach(r => {
      const n = list.filter(x => nz(x[c.x]) === nz(r.item) && (r.qty == null || Number(x.qty) === r.qty) && nz(x.worker) === nz(r.worker)).length;
      if (r.item && n) r._dup = n; else delete r._dup;
    });
  };
  MAC.dupThenCheck = (d, m) => { MAC.dup(m.imp).then(() => { if (d.isConnected) impCheck(d, m); }); };

  /* ---------- التبويبات ---------- */
  function tab(id, focus) {
    if (TABS.indexOf(id) < 0) return; if (id === "eng" && !isAdmin()) id = "ov";
    curTab = id;
    TABS.forEach(t => {
      const b = $("tb_" + t), p = $("tp_" + t); if (!b || !p) return; const on = t === id;
      b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; b.classList.toggle("on", on); p.hidden = !on;
      if (on) { p.classList.remove("xc-in"); void p.offsetWidth; p.classList.add("xc-in"); }
    });
    try { sessionStorage.setItem("mas_ai_tab", id); } catch (e) { }
    if (id === "chat") { const bx = $("x_msgs"); bx.scrollTop = (cur && cur.m && cur.m.length) ? bx.scrollHeight : 0; }
    if (id === "ov" || id === "log") refresh();
    if (id === "eng") { engLogs(); engHealth(); }
    if (focus) $("tb_" + id).focus();
  }
  MAC.tab = tab;
  function tabKeys(e) {
    const vis = TABS.filter(t => $("tb_" + t) && !$("tb_" + t).hidden), i = vis.indexOf(curTab); let n = -1;
    const rtl = getComputedStyle(document.documentElement).direction === "rtl";
    if (e.key === "ArrowLeft") n = rtl ? i + 1 : i - 1; else if (e.key === "ArrowRight") n = rtl ? i - 1 : i + 1;
    else if (e.key === "Home") n = 0; else if (e.key === "End") n = vis.length - 1; else return;
    e.preventDefault(); tab(vis[(n + vis.length) % vis.length], true);
  }

  /* ---------- نظرة عامة ---------- */
  function syncConn() {
    const off = $("x_st").classList.contains("off");
    $("ov_conn").textContent = off ? "غير متصل" : "متصل"; $("ov_conn_s").textContent = $("x_stt").textContent;
    $("ovc_conn").classList.toggle("bad", off);
  }
  function syncEng() {
    const le = $("x_eng").hidden ? "" : $("x_eng").textContent.replace(/^المحرك:\s*/, "");
    $("ov_eng").textContent = le || (ENGINFO ? ENGINFO.split(" · ")[0].replace("الأساسي: ", "") : "—");
    $("ov_eng_s").textContent = le ? "آخر محرك استُخدم في هذه الجلسة" : ENGINFO ? ENGINFO : "يظهر بعد أول سؤال";
  }
  MAC.onStatus = d => {
    const N = (typeof ENG !== "undefined" && ENG) || {};
    ENGINFO = "الأساسي: " + (N[d.primary] || d.primary || "—") + (d.fallback ? " · الاحتياطي: " + (N[d.fallback] || d.fallback) : "") + (d.enabled ? "" : " · المساعد موقوف");
    syncEng();
  };
  function opLine(o) {
    return '<div class="xc-ol"><span class="xc-dt">' + esc(fmtT(o.t)) + '</span><b>' + esc(SRC[o.src] || o.src) + '</b><span>' + esc(o.sec ? secName(o.sec) : "—") + ' · ' + o.rows + ' سطر</span><span class="xc-st ' + (SCLS[o.status] || "") + '">' + esc(o.status) + '</span></div>';
  }
  function refresh() {
    const a = opsLoad(), rv = a.filter(x => x.status === "قيد المراجعة").length;
    $("ov_ops").textContent = a.length; $("ov_ops_s").textContent = "على هذا الجهاز"; $("ov_rev").textContent = rv; $("ov_rev_s").textContent = rv ? "افتح السجل للتفاصيل" : "لا شيء معلّق";
    $("ov_recent").innerHTML = a.length ? a.slice(0, 5).map(opLine).join("") : '<div class="xc-empty">لا توجد عمليات بعد. ابدأ بسؤال في المحادثة أو استورد بيانات من ChatGPT.</div>';
    const dot = $("tb_rev_n"); dot.hidden = !RVM; if (RVM) dot.textContent = String(RVM.imp.rows.length);
    syncConn(); syncEng();
    if (curTab === "log") logDraw();
  }

  /* ---------- سجل العمليات ---------- */
  function logDraw() {
    const q = nz($("lg_q").value), fs = $("lg_src").value, ft = $("lg_st").value;
    const all = opsLoad(), a = all.filter(o => (!fs || o.src === fs) && (!ft || o.status === ft) && (!q || nz([SRC[o.src], o.type, secName(o.sec), o.status, o.user, o.msg, o.date].join(" ")).includes(q)));
    $("lg_n").textContent = a.length + " من " + all.length;
    $("lg_list").innerHTML = a.length ? a.map(o => '<details class="xc-op"><summary><span class="xc-dt">' + esc(fmtT(o.t)) + '</span><b>' + esc(SRC[o.src] || o.src) + '</b><span>' + esc(o.sec ? secName(o.sec) : "—") + ' · ' + o.rows + ' سطر</span><span class="xc-st ' + (SCLS[o.status] || "") + '">' + esc(o.status) + '</span></summary><dl>' +
      '<dt>نوع العملية</dt><dd>' + esc(o.type || "—") + '</dd><dt>القسم</dt><dd>' + esc(o.sec ? secName(o.sec) : "—") + '</dd><dt>تاريخ البيانات</dt><dd>' + esc(o.date || "—") + '</dd>' +
      '<dt>الصفوف</dt><dd>' + o.rows + '</dd><dt>التحذيرات / الأخطاء</dt><dd>' + o.warn + ' / ' + o.err + '</dd><dt>المستخدم</dt><dd>' + esc(o.user || "—") + '</dd>' +
      (o.msg ? '<dt>تفاصيل</dt><dd>' + esc(o.msg) + '</dd>' : '') + '</dl></details>').join("") :
      '<div class="xc-empty">' + (all.length ? "لا نتائج مطابقة للبحث أو الفلاتر." : "لا توجد عمليات مسجّلة بعد على هذا الجهاز.") + '</div>';
  }

  /* ---------- رسائل داخل التبويبات (textContent فقط) ---------- */
  function showMsg(boxId, kind, lines, title) {
    const box = $(boxId); box.innerHTML = ""; if (!lines || !lines.length) { box.hidden = true; return; }
    box.hidden = false; box.className = "xc-note " + kind;
    if (title) { const b = document.createElement("b"); b.textContent = title; box.appendChild(b); }
    const ul = document.createElement("ul"); lines.slice(0, 12).forEach(t => { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); });
    box.appendChild(ul);
  }
  const setLoad = (btn, on) => { btn.disabled = on; btn.classList.toggle("ld", on); btn.setAttribute("aria-busy", on ? "true" : "false"); };

  /* ---------- المراجعة الموحدة ---------- */
  function drawRev() {
    const host = $("rv_host"); host.innerHTML = "";
    if (!RVM) {
      host.innerHTML = '<div class="xc-empty big"><b>لا توجد بيانات قيد المراجعة</b><span>استورد نتيجة من ChatGPT أو اقرأ صورة سجل، وستظهر هنا للمراجعة قبل أي حفظ.</span><div class="xc-row"><button type="button" class="xc-b p" data-go="ext">الاستيراد الخارجي</button><button type="button" class="xc-b" data-go="vis">قراءة صورة</button></div></div>';
    } else {
      const d = document.createElement("div"); d.className = "x-m rv"; d.dataset.rv = "1"; d.innerHTML = '<div class="x-b x-imp"></div>'; host.appendChild(d); impDraw(d, RVM);
    }
    refresh();
  }
  function openReview(v) { RVM = { imp: v }; RVLOG = null; drawRev(); }
  MAC.rvMsg = () => RVM;
  MAC.rvDone = (text, log_id) => {
    RVM = null; RVLOG = log_id || null; const host = $("rv_host");
    host.innerHTML = '<div class="x-m rv"><div class="x-b ai-md"><p>' + esc(text) + '</p></div>' + (log_id ? '<div class="x-acts"><button type="button" data-rvundo="1">' + ic("refresh") + 'تراجع عن هذه العملية</button></div>' : "") + '</div>';
    refresh();
  };
  MAC.cancel = (w, m) => {
    const v = m.imp; if (!confirm("إلغاء هذه البيانات؟ لن يُحفظ أي شيء.")) return;
    MAC.touch(v, "أُلغي");
    if (w.dataset.rv) { RVM = null; drawRev(); }
    else { const i = cur.m.indexOf(m); if (i >= 0) cur.m[i] = { r: "a", t: "أُلغيت البيانات المستخرجة ولم يُحفظ أي شيء." }; save(); render(); }
    toast("تم الإلغاء. لم يُحفظ أي شيء", "ok");
  };
  /* تجهيز بيانات القسم (masai_import بنفس الشكل القديم تمامًا) ثم فتح صفحة القسم للمراجعة والحفظ هناك */
  MAC.go = async (w, m, btn) => {
    if (GO) return; GO = true; if (btn) btn.disabled = true;
    try {
      const v = m.imp, { E } = validate(v); if (E.length) { toast(E[0], "bad"); return; }
      const file = SEC_PAGE[v.section]; if (!canSee(file)) { toast("حسابك لا يملك صلاحية على " + SECN[v.section], "bad"); return; }
      await MAC.dup(v, true); impCheck(w, m);
      const { W } = validate(v), dn = v.rows.filter(r => r._dup).length;
      const rows = v.rows.filter(r => r.item || r.code || r.qty != null || r.scrap != null).map(r => ({ item: r.item, color: r.color, sub: r.code, qty: r.qty, scrap: r.scrap, worker: r.worker, shift: r.shift, note: r.note, done: false }));
      if (!confirm("سيتم تجهيز " + rows.length + " سطر لقسم " + SECN[v.section] + " بتاريخ " + v.date + " ثم فتح صفحة القسم لمراجعتها وحفظها هناك. لن يُحفظ شيء الآن." + (W.length ? "\n\nيوجد " + W.length + " تحذير." : "") + (dn ? "\nتنبيه: " + dn + " سطر يشبه سجلات محفوظة بنفس اليوم." : "") + "\n\nمتابعة؟")) return;
      try { sessionStorage.setItem("masai_import", JSON.stringify({ u: ME.id, sec: v.section, date: v.date, rows })); } catch (x) { toast("تعذّر تجهيز البيانات", "bad"); MAC.touch(v, "فشل", "تعذّر التخزين المؤقت"); return; }
      MAC.touch(v, "تم التجهيز");
      toast("جاري فتح " + SECN[v.section] + "… راجع كل سطر ثم احفظ", "ok"); setTimeout(() => { location.href = file; }, 500);
    } finally { GO = false; try { impCheck(w, m); } catch (e) { } }
  };

  /* ---------- الاستيراد الخارجي ---------- */
  async function readFile(f) {
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (ext === "xlsx" && window.MasXlsx) {
      if (f.size === 0) { showMsg("xc_msg", "bad", ["الملف فارغ."]); return; }
      try {
        const rows = await MasXlsx.readRows(await f.arrayBuffer());
        if (!rows.length) { showMsg("xc_msg", "bad", ["ملف Excel فارغ (أول شيت لا يحتوي بيانات)."]); return; }
        $("xc_txt").value = MasXlsx.toCSV(rows); FT = "csv"; $("xc_fn").textContent = f.name;
        showMsg("xc_msg", "ok", ["تم قراءة أول شيت من «" + f.name.slice(0, 60) + "» (" + (rows.length - 1) + " صف تقريبًا). اضغط «تحليل وتجهيز المراجعة» — وهيقترح عليك الأصناف الجديدة أو القريبة من المسجّل."]);
      } catch (e) { showMsg("xc_msg", "bad", ["تعذّرت قراءة ملف Excel: " + (e && e.message || "ملف غير صالح") + " — جرّب حفظه CSV UTF-8."]); }
      return;
    }
    if (ext === "xls" || (ext === "xlsx") || /spreadsheetml|ms-excel/.test(f.type)) { showMsg("xc_msg", "bad", ["ملفات Excel القديمة (xls) غير مدعومة. احفظ الملف بصيغة xlsx أو CSV UTF-8 وارفعه."], "ملف Excel"); return; }
    if (!/^(json|csv|txt)$/.test(ext)) { showMsg("xc_msg", "bad", ["نوع الملف غير مدعوم. ارفع ملف JSON أو CSV."]); return; }
    if (f.size === 0) { showMsg("xc_msg", "bad", ["الملف فارغ."]); return; }
    if (f.size > MasAiImport.LIMITS.bytes) { showMsg("xc_msg", "bad", ["حجم الملف أكبر من الحد المسموح (1 ميجابايت)."]); return; }
    let text, note_ = "";
    try { const buf = await f.arrayBuffer(); try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder("windows-1256").decode(buf); note_ = " (تم تفسير الترميز كـ Windows-1256)"; } }
    catch (e) { showMsg("xc_msg", "bad", ["تعذّرت قراءة الملف. احفظه بصيغة UTF-8 وحاول مرة أخرى."]); return; }
    $("xc_txt").value = text; FT = ext === "json" ? "json" : ext === "csv" ? "csv" : "text";
    $("xc_fn").textContent = f.name;
    showMsg("xc_msg", "ok", ["تم تحميل الملف «" + f.name.slice(0, 60) + "»" + note_ + ". اضغط «تحليل وتجهيز المراجعة»."]);
  }
  const typeAr = meta => { const t = meta && meta.report_type; return !t || t === "daily" ? "تقرير يومي" : "تقرير (" + String(t).slice(0, 20) + ")"; };
  async function runImport() {
    if (IMB) return; const b = $("xc_run"); IMB = true; setLoad(b, true);
    try {
      const r = normalizeExternalImport($("xc_txt").value, FT, { section: $("xc_sec").value, date: $("xc_date").value, secn: SECN, today: today() });
      if (!r.ok) { showMsg("xc_msg", "bad", r.errors.concat(r.notices || []), "تعذّر الاستيراد — لم يُحفظ شيء"); MAC.logFail("chatgpt", "استيراد خارجي", r.errors[0], r.errors.length); return; }
      await loadCat(); const v = r.imp; await MAC.dup(v, true);
      MAC.track(v, "chatgpt", typeAr(v.meta)); openReview(v);
      showMsg("xc_msg", "ok", ["تم تجهيز " + v.rows.length + " سطر للمراجعة. لم يُحفظ شيء بعد."]);
      tab("rev"); toast("جاهز للمراجعة — لم يُحفظ شيء بعد", "ok");
    } catch (e) { showMsg("xc_msg", "bad", ["حدث خطأ غير متوقع أثناء التحليل. تأكد من الملف وحاول مرة أخرى."]); }
    finally { IMB = false; setLoad(b, false); }
  }

  /* ---------- قراءة الصور (تمر بنفس المراجعة الموحدة) ---------- */
  async function extractToReview(payload, label) {
    if (VB || (typeof busy !== "undefined" && busy)) return; VB = true; const b1 = $("vis_pick"), b2 = $("vis_txt_go"); setLoad(b1, true); setLoad(b2, true);
    showMsg("vis_msg", "info", ["جارٍ استخراج البيانات والتحقق منها…"]);
    try {
      const [r] = await Promise.all([masAi(Object.assign({ action: "extract" }, payload), { retries: 0 }), loadCat()]);
      if (!r.ok) { showMsg("vis_msg", "bad", [r.msg || "تعذّر استخراج البيانات"], "فشلت القراءة — لم يُحفظ شيء"); MAC.logFail("image", "قراءة صورة", r.msg || "تعذّر استخراج البيانات"); return; }
      const v = r.data.vision;
      if (!v || !v.rows || !v.rows.length) { showMsg("vis_msg", "bad", [(v && v.notes) || "لم أجد بيانات إنتاج واضحة. جرّب صورة أوضح أو نصًا."], "لا توجد بيانات"); MAC.logFail("image", "قراءة صورة", "لم تُستخرج بيانات"); return; }
      if (!v.date) v.date = today();
      await MAC.dup(v, true); MAC.track(v, "image", "قراءة صورة"); openReview(v);
      showMsg("vis_msg", "ok", ["تم استخراج " + v.rows.length + " سطر للمراجعة. لم يُحفظ شيء بعد."]); tab("rev");
    } catch (e) { showMsg("vis_msg", "bad", ["حدث خطأ غير متوقع أثناء القراءة. حاول مرة أخرى."]); }
    finally { VB = false; setLoad(b1, false); setLoad(b2, false); }
  }

  /* ---------- إعدادات المحركات (للمدير) ---------- */
  const PN = { gemini: "Google Gemini", groq: "Groq", openrouter: "OpenRouter" };
  async function engLogs() {
    if (!isAdmin()) return; const box = $("eng_logs"); box.textContent = "جارٍ التحميل…";
    try {
      const [u, e, f] = await Promise.all([
        db.from("ai_usage_log").select("created_at,task,provider,status,latency_ms,failover").order("id", { ascending: false }).limit(10),
        db.from("ai_error_log").select("created_at,provider,error_class,http_status").order("id", { ascending: false }).limit(10),
        db.from("ai_failover_log").select("created_at,from_provider,to_provider,reason").order("id", { ascending: false }).limit(10)]);
      if (u.error && e.error && f.error) { box.textContent = "تعذّر تحميل السجلات (الصلاحية أو لم يُشغَّل ملف الـ Migration)."; return; }
      const sec = (t, a, fn) => '<div class="xc-lg"><b>' + t + '</b>' + ((a || []).length ? a.map(fn).join("") : '<small>لا يوجد.</small>') + '</div>';
      box.innerHTML =
        sec("آخر الاستخدام", u.data, r => '<div class="xc-ol"><span class="xc-dt">' + esc(fmtT(r.created_at)) + '</span><span>' + esc(r.task || "—") + '</span><span>' + esc(PN[r.provider] || r.provider || "—") + ' · ' + esc(r.status) + (r.latency_ms ? ' · ' + r.latency_ms + 'ms' : '') + (r.failover ? ' · تحويل' : '') + '</span></div>') +
        sec("آخر الأخطاء", e.data, r => '<div class="xc-ol"><span class="xc-dt">' + esc(fmtT(r.created_at)) + '</span><span>' + esc(PN[r.provider] || r.provider || "—") + '</span><span>' + esc(r.error_class || "") + (r.http_status ? ' · ' + r.http_status : '') + '</span></div>') +
        sec("التحويل الاحتياطي", f.data, r => '<div class="xc-ol"><span class="xc-dt">' + esc(fmtT(r.created_at)) + '</span><span>' + esc(r.from_provider) + ' إلى ' + esc(r.to_provider) + '</span><span>' + esc(r.reason || "") + '</span></div>');
    } catch (x) { box.textContent = "تعذّر تحميل السجلات."; }
  }

    /* ---------- تسجيل سريع: قسم + تاريخ + (نص / إملاء صوتي / صورة) ← مراجعة ← حفظ أو فتح القسم ---------- */
  const QORDER = ["glaze", "deco", "spray", "casting", "brush", "repair", "finish", "fire"];
  const QK = "mas_qk_sec_v1";
  let QSEC = "", QIMG = null, QB = false, QREC = null;
  const qExample = k => secName(k) + " — طقم ٦ قطع ٣٠٠ وهالك ٥ (أحمد)" + (k === "brush" || k === "finish" ? " صباحي" : "") + "\nكوب ٣٠٠ وهالك ٢ (محمد)";
  function qSecs() {
    const box = $("qk_secs"), ok = QORDER.filter(k => typeof SEC_PAGE !== "undefined" && SEC_PAGE[k] && canSee(SEC_PAGE[k]));
    if (!ok.length) { box.innerHTML = '<div class="xc-empty">حسابك لا يملك صلاحية تسجيل في أي قسم.</div>'; return; }
    box.innerHTML = ok.map(k => '<button type="button" role="radio" aria-checked="false" data-s="' + k + '">' + esc(secName(k)) + '</button>').join("");
    let last = ""; try { last = localStorage.getItem(QK + (ME && ME.id)) || ""; } catch (e) { }
    qPick(ok.indexOf(last) >= 0 ? last : "");
  }
  function qPick(k) {
    QSEC = k; document.querySelectorAll("#qk_secs button").forEach(b => b.setAttribute("aria-checked", String(b.dataset.s === k)));
    $("qk_txt").placeholder = k ? "مثال:\n" + qExample(k) : "اختر القسم أولًا لتظهر هنا صيغة مثال…";
    if (k) { try { localStorage.setItem(QK + (ME && ME.id), k); } catch (e) { } }
  }
  function qImg(img) {
    QIMG = img; $("qk_pvw").hidden = !img; if (img) $("qk_pv").src = "data:" + img.mime + ";base64," + img.image;
  }
  async function qFile(f) {
    if (!f) return;
    if (!/^image\//.test(f.type)) { showMsg("qk_msg", "bad", ["اختر صورة (JPG أو PNG)."]); return; }
    let d; try { d = await shrink(f); } catch (x) { showMsg("qk_msg", "bad", ["الصورة غير مدعومة، جرّب JPG أو PNG."]); return; }
    qImg({ image: d.split(",")[1], mime: "image/jpeg" }); showMsg("qk_msg", "ok", ["تمت إضافة الصورة. اضغط «حلّل» عندما تكون جاهزًا."]);
  }
  function qMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition, b = $("qk_mic"); if (!SR) return;
    b.hidden = false;
    b.onclick = () => {
      if (QREC) { QREC.stop(); return; }
      const r = new SR(), ta = $("qk_txt"), base = ta.value ? ta.value.replace(/\s*$/, "\n") : "";
      r.lang = "ar-EG"; r.interimResults = true; r.continuous = true; QREC = r;
      r.onresult = e => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript + " "; ta.value = (base + t).slice(0, 1500); };
      r.onerror = e => { showMsg("qk_msg", "bad", [e.error === "not-allowed" ? "لم يُسمح باستخدام الميكروفون. فعّله من إعدادات المتصفح." : "تعذّر الإملاء الصوتي، اكتب البيانات يدويًا."]); };
      r.onend = () => { QREC = null; b.classList.remove("rec"); b.querySelector("span").textContent = "إملاء صوتي"; };
      try { r.start(); b.classList.add("rec"); b.querySelector("span").textContent = "إيقاف الإملاء"; showMsg("qk_msg", "info", ["تحدّث الآن… مثال: طقم ستة قطع ثلاثمية وهالك خمسة أحمد"]); } catch (x) { QREC = null; }
    };
  }
  async function qRun() {
    if (QB || (typeof busy !== "undefined" && busy)) return;
    if (!QSEC) { showMsg("qk_msg", "bad", ["اختر القسم أولًا (الخطوة ١)."]); $("qk_secs").scrollIntoView({ block: "center", behavior: "smooth" }); return; }
    const date = $("qk_date").value || today(), text = $("qk_txt").value.trim();
    if (!text && !QIMG) { showMsg("qk_msg", "bad", ["اكتب بيانات الإنتاج أو قلها بالميكروفون، أو أضف صورة السجل."]); $("qk_txt").focus(); return; }
    if (QREC) QREC.stop();
    QB = true; const go = $("qk_go"); setLoad(go, true); showMsg("qk_msg", "info", ["جارٍ قراءة البيانات…"]);
    try {
      const payload = Object.assign({ action: "extract", hint: QSEC }, text ? { text } : {}, QIMG ? { image: QIMG.image, mime: QIMG.mime } : {});
      const [r] = await Promise.all([masAi(payload, { retries: 0 }), loadCat()]);
      if (!r.ok) { showMsg("qk_msg", "bad", [r.msg || "تعذّر استخراج البيانات الآن، حاول بعد قليل."]); MAC.logFail(QIMG ? "image" : "internal", secName(QSEC), r.msg || "فشل"); return; }
      const v = r.data.vision;
      if (!v || !v.rows || !v.rows.length) { showMsg("qk_msg", "bad", [(v && v.notes) || "لم أجد سطور إنتاج واضحة. وضّح الكتابة أو صوّر السجل بإضاءة أفضل."], "لا بيانات"); return; }
      v.notices = v.notices || [];
      if (v.section && v.section !== "unknown" && v.section !== QSEC) v.notices.push("رجّح المساعد أن البيانات تخص «" + secName(v.section) + "» لكنك اخترت «" + secName(QSEC) + "»؛ اعتمدنا اختيارك.");
      if (v.date && v.date !== date) v.notices.push("ورد في المدخل تاريخ " + v.date + " لكن التاريخ المختار " + date + "؛ اعتمدنا المختار.");
      v.section = QSEC; v.date = date;
      await MAC.dup(v, true); MAC.track(v, QIMG ? "image" : "internal", "تسجيل سريع"); openReview(v);
      showMsg("qk_msg", "ok", ["جاهز: " + v.rows.length + " سطر. راجعها ثم احفظ."]); tab("rev");
    } catch (e) { showMsg("qk_msg", "bad", ["حدث خطأ غير متوقع. حاول مرة أخرى."]); }
    finally { QB = false; setLoad(go, false); }
  }
  function qkInit() {
    qSecs(); $("qk_date").value = today(); qMic();
    $("qk_secs").addEventListener("click", e => { const b = e.target.closest("button[data-s]"); if (b) { qPick(b.dataset.s); $("qk_txt").focus({ preventScroll: true }); } });
    $("qk_ex").onclick = () => { if (!QSEC) { showMsg("qk_msg", "bad", ["اختر القسم أولًا."]); return; } $("qk_txt").value = qExample(QSEC); };
    $("qk_cam").onclick = () => $("qk_file_cam").click(); $("qk_gal").onclick = () => $("qk_file").click();
    ["qk_file_cam", "qk_file"].forEach(id => $(id).onchange = async () => { const f = $(id).files[0]; $(id).value = ""; await qFile(f); });
    $("qk_rm").onclick = () => qImg(null);
    $("qk_clear").onclick = () => { $("qk_txt").value = ""; qImg(null); $("qk_date").value = today(); showMsg("qk_msg", "", []); };
    $("qk_go").onclick = qRun;
    $("qk_txt").addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); qRun(); } });
  }

  /* ---------- لوحة حالة المحركات (آخر 24 ساعة) ---------- */
  async function engHealth() {
    if (!isAdmin()) return; const box = $("eng_health"); box.innerHTML = '<div class="eh-t">جارٍ فحص حالة المحركات…</div>';
    try {
      const since = new Date(Date.now() - 864e5).toISOString();
      const [u, e] = await Promise.all([
        db.from("ai_usage_log").select("provider,status,latency_ms,task,created_at").gte("created_at", since).order("id", { ascending: false }).limit(500),
        db.from("ai_error_log").select("provider,error_class,http_status,created_at").gte("created_at", since).order("id", { ascending: false }).limit(200)]);
      if (u.error) { box.innerHTML = '<div class="eh-t">تعذّر قراءة حالة المحركات (الصلاحية أو لم يُشغَّل ملف الـ Migration).</div>'; return; }
      const P = {}; const get = p => P[p] || (P[p] = { n: 0, ok: 0, ms: [], err: null, fo: 0 });
      (u.data || []).filter(x => x.provider && x.task !== "test").forEach(x => { const o = get(x.provider); o.n++; if (x.status === "ok") { o.ok++; if (x.latency_ms) o.ms.push(x.latency_ms); } if (x.failover) o.fo++; });
      (e.data || []).forEach(x => { if (x.provider) { const o = get(x.provider); if (!o.err) o.err = x; } });
      Object.keys(PN).forEach(k => get(k));
      const tasks = {}; (u.data || []).forEach(x => { if (x.task && x.task !== "test") tasks[x.task] = (tasks[x.task] || 0) + 1; });
      const TN = { ask: "أسئلة", extract: "استخراج بيانات", write_intent: "أوامر", tts: "صوت" };
      const cards = Object.keys(P).map(k => {
        const o = P[k], rate = o.n ? Math.round(o.ok / o.n * 100) : null, avg = o.ms.length ? Math.round(o.ms.reduce((a, b) => a + b, 0) / o.ms.length) : null;
        let cls = "", msg = "لم يُستخدم خلال 24 ساعة";
        if (rate !== null) { if (rate >= 90 && (avg === null || avg < 8000)) { cls = "g"; msg = "يعمل بشكل جيد"; } else if (rate >= 60 || (rate >= 90 && avg >= 8000)) { cls = "y"; msg = rate >= 90 ? "يعمل لكنه بطيء" : "أخطاء متقطعة"; } else { cls = "r"; msg = "أخطاء متكررة — راجع المفتاح أو الحدّ"; } }
        return '<div class="eh-c ' + cls + '"><div class="eh-h"><i class="eh-d"></i>' + esc(PN[k] || k) + '</div><div class="eh-s">' + msg + '</div><div class="eh-m">' +
          (rate !== null ? '<span>نجاح ' + rate + '%</span><span>' + o.n + ' طلب</span>' : '') + (avg !== null ? '<span>متوسط ' + (avg / 1000).toFixed(1) + ' ث</span>' : '') + (o.fo ? '<span>تحويل ' + o.fo + '</span>' : '') +
          (o.err ? '<span>آخر خطأ: ' + esc(o.err.error_class || "") + (o.err.http_status ? " " + o.err.http_status : "") + " — " + esc(fmtT(o.err.created_at)) + '</span>' : '') + '</div></div>';
      }).join("");
      const tt = Object.keys(tasks).map(k => esc(TN[k] || k) + " " + tasks[k]).join(" · ");
      box.innerHTML = cards + '<div class="eh-t">آخر 24 ساعة' + (tt ? " · " + tt : "") + '</div>';
    } catch (x) { box.innerHTML = '<div class="eh-t">تعذّر فحص حالة المحركات.</div>'; }
  }

  /* ---------- التشغيل بعد المصادقة ---------- */
  MAC.init = function () {
    // تبويبات
    $("xc_tabs").addEventListener("click", e => { const b = e.target.closest("[role=tab]"); if (b) tab(b.id.slice(3)); });
    $("xc_tabs").addEventListener("keydown", tabKeys);
    document.addEventListener("click", e => { const g = e.target.closest("[data-go]"); if (g && g.closest("#x_app")) tab(g.dataset.go); });
    if (isAdmin()) { $("tb_eng").hidden = false; const box = $("x_engp"), host = $("eng_host"); host.appendChild(box); box.hidden = false; } else { $("tb_eng").hidden = true; $("tp_eng").hidden = true; }
    // مراقبة حالة الاتصال والمحرك
    new MutationObserver(syncConn).observe($("x_st"), { attributes: true, subtree: true, childList: true, characterData: true });
    new MutationObserver(syncEng).observe($("x_eng"), { attributes: true, childList: true, characterData: true });
    // الاستيراد الخارجي
    let TSEC = "";
    const drawTpl = () => { $("xc_tpl").textContent = JSON.stringify(MasAiImport.templateFor(TSEC), null, 2); };
    $("xc_tsec").innerHTML = '<option value="">— عام (كل الحقول) —</option>' + Object.keys(SECN).map(k => '<option value="' + k + '">' + esc(SECN[k]) + '</option>').join("");
    $("xc_tsec").onchange = () => { TSEC = $("xc_tsec").value; drawTpl(); };
    drawTpl();
    $("xc_sec").innerHTML = '<option value="">— من الملف —</option>' + Object.keys(SECN).map(k => '<option value="' + k + '">' + esc(SECN[k]) + '</option>').join("");
    const cp = (t, ok) => navigator.clipboard.writeText(t).then(() => toast(ok, "ok"), () => toast("تعذّر النسخ", "bad"));
    $("xc_cp_tpl").onclick = () => cp($("xc_tpl").textContent, "تم نسخ القالب");
    $("xc_cp_prompt").onclick = () => cp(MasAiImport.promptFor(TSEC), "تم نسخ التعليمات — الصقها في ChatGPT مع الصورة");
    $("xc_dl_tpl").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([$("xc_tpl").textContent], { type: "application/json" })); a.download = "mas-import-template" + (TSEC ? "-" + TSEC : "") + ".json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
    if (navigator.clipboard && navigator.clipboard.readText) {
      $("xc_paste").hidden = false;
      $("xc_paste").onclick = async () => { try { const t = await navigator.clipboard.readText(); if (!t.trim()) { toast("الحافظة فارغة", "bad"); return; } $("xc_txt").value = t; FT = "text"; $("xc_fn").textContent = ""; showMsg("xc_msg", "ok", ["تم اللصق من الحافظة. اضغط «تحليل وتجهيز المراجعة»."]); } catch (e) { toast("تعذّرت القراءة من الحافظة. الصق يدويًا في المربع", "bad"); } };
    }
    $("xc_pickfile").onclick = () => $("xc_file").click();
    $("xc_file").onchange = async () => { const f = $("xc_file").files[0]; $("xc_file").value = ""; if (f) await readFile(f); };
    $("xc_txt").addEventListener("input", () => { FT = "text"; $("xc_fn").textContent = ""; });
    $("xc_clear").onclick = () => { $("xc_txt").value = ""; FT = "text"; $("xc_fn").textContent = ""; showMsg("xc_msg", "", []); };
    $("xc_run").onclick = runImport;
    // قراءة الصور
    $("vis_pick").onclick = () => $("vis_file").click();
    $("vis_file").onchange = async () => {
      const f = $("vis_file").files[0]; $("vis_file").value = ""; if (!f) return;
      if (!/^image\//.test(f.type)) { showMsg("vis_msg", "bad", ["اختر صورة (JPG أو PNG)."]); return; }
      let d; try { d = await shrink(f); } catch (x) { showMsg("vis_msg", "bad", ["الصورة غير مدعومة، جرّب JPG أو PNG."]); return; }
      const pv = $("vis_pv"); pv.src = d; pv.hidden = false;
      extractToReview({ image: d.split(",")[1], mime: "image/jpeg" }, f.name);
    };
    $("vis_txt_go").onclick = () => { const t = $("vis_txt").value.trim(); if (t.length < 2) { showMsg("vis_msg", "bad", ["اكتب أو الصق نص السجل أولًا."]); return; } extractToReview({ text: t.slice(0, 1500) }, "نص"); };
    // المراجعة
    $("rv_host").addEventListener("click", async e => {
      if (!e.target.closest("[data-rvundo]")) return;
      if (WBUSY || !RVLOG) return; if (!confirm("التراجع عن هذه العملية وإرجاع الوضع السابق؟")) return;
      WBUSY = true; const r = await masAi({ action: "write_undo", log_id: RVLOG }, { retries: 0 }); WBUSY = false;
      if (!r.ok) { toast(r.msg || "تعذّر التراجع", "bad"); return; }
      RVLOG = null; $("rv_host").innerHTML = '<div class="xc-note ok"><ul><li>تم التراجع عن العملية.</li></ul></div>'; toast("تم التراجع", "ok");
    });
    // السجل
    ["lg_q", "lg_src", "lg_st"].forEach(id => $(id).addEventListener("input", logDraw));
    $("lg_clear").onclick = () => { if (!opsLoad().length) return; if (confirm("مسح سجل العمليات من هذا الجهاز؟ لا يؤثر على أي بيانات في البرنامج.")) { opsSave([]); refresh(); logDraw(); toast("تم مسح السجل", "ok"); } };
    $("lg_st").innerHTML = '<option value="">كل الحالات</option>' + STATS.map(s => '<option>' + s + '</option>').join("");
    $("lg_src").innerHTML = '<option value="">كل المصادر</option>' + Object.keys(SRC).map(k => '<option value="' + k + '">' + SRC[k] + '</option>').join("");
    $("eng_refresh").onclick = () => { try { adminPanel(); } catch (e) { } engLogs(); engHealth(); };
    qkInit();
    // تبويب البداية
    let st = ""; try { st = sessionStorage.getItem("mas_ai_tab") || ""; } catch (e) { }
    const h = (location.hash || "").slice(1);
    drawRev(); refresh(); tab(TABS.indexOf(h) >= 0 ? h : TABS.indexOf(st) >= 0 ? st : "quick");
    $("xc_tabs").hidden = false;
  };
})();
