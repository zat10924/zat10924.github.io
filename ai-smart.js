/* ai-smart.js — ذكاء الاستيراد: مطابقة الأصناف/الألوان/العمال/الوردية، تصحيح تلقائي قابل للتراجع، تعلّم من تصحيحاتك،
   كشف الأرقام الشاذة، دمج المكرر، وقوائم معتمدة تُلصق مع تعليمات ChatGPT.
   لا يكتب أي شيء في قاعدة البيانات: قراءة فقط + ذاكرة التصحيحات في هذا الجهاز. */
(function (root) {
  "use strict";
  const nz = s => String(s == null ? "" : s).toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
    .replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/ک/g, "ك").replace(/ی/g, "ي")
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/\s+/g, " ").trim();
  const toks = s => nz(s).replace(/[^\u0600-\u06FFa-z0-9 ]/g, " ").split(" ").filter(Boolean).map(w => w.length > 3 ? w.replace(/^ال/, "") : w);
  const lev = (a, b) => { if (a === b) return 0; const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let p = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c } return p[n] };
  const tsim = (a, b) => a === b ? 1 : Math.max(0, 1 - lev(a, b) / Math.max(a.length, b.length));

  /* مرادفات ألوان واضحة (تُستعمل فقط لو الاسم المكتوب غير موجود حرفيًا في القائمة) */
  const GROUPS = [["موف", "موفي", "بنفسجي", "بنفسج"], ["روز", "وردي", "زهري", "بينك"], ["رمادي", "جراي", "رصاصي"], ["بيج", "بيجي"], ["ذهبي", "دهبي", "جولد"], ["فضي", "سلفر"], ["كحلي", "نيلي"], ["برتقالي", "اورنج"], ["اسود", "بلاك"], ["ابيض", "وايت"], ["احمر", "ريد"], ["ازرق", "بلو"], ["اصفر", "ييلو"], ["اخضر", "جرين"], ["بني", "قهوي", "قهوه"]];
  const G = {}; GROUPS.forEach((g, i) => g.forEach(w => { G[nz(w)] = "g" + i }));
  const ckey = s => toks(s).map(t => G[t] || t).sort().join(" ");
  const SHIFTS = { "صباحي": ["صباحي", "صباح", "صباحا", "ص", "نهاري", "نهار", "الصباح"], "مسائي": ["مسائي", "مساء", "مساءا", "م", "المساء"], "ليلي": ["ليلي", "ليل", "ل", "الليل", "سهر"] };
  const SHIFT_MAP = {}; Object.keys(SHIFTS).forEach(k => SHIFTS[k].forEach(w => { SHIFT_MAP[nz(w)] = k }));
  const SKIP_ITEM = { finish: 1, fire: 1 };
  const HIST_T = { casting: ["casting_log", "casting_date"], brush: ["brush_log", "brush_date"], repair: ["repair_log", "repair_date"] };
  const AKEY = "masai_alias_v1";

  const S = { items: [], colors: [], workers: [], hist: {}, hcount: {}, alias: { item: {}, color: {}, worker: {} }, base: false, p: null, hp: {}, seeded: false, orders: {}, op: {} };
  const ORD_T = { casting: "casting_status", brush: "brush_status", spray: "spray_status" };
  try { const a = JSON.parse(localStorage.getItem(AKEY) || "null"); if (a && typeof a === "object") S.alias = Object.assign({ item: {}, color: {}, worker: {} }, a) } catch (e) { }
  const saveAlias = () => { try { localStorage.setItem(AKEY, JSON.stringify(S.alias)) } catch (e) { } };
  const list = k => k === "item" ? S.items : k === "color" ? S.colors : S.workers;
  const LBL = { item: "الصنف", color: "اللون", worker: "العامل", shift: "الوردية" };

  function score(a, c, kind) {
    const A = toks(a), B = toks(c); if (!A.length || !B.length) return 0;
    const used = new Set(); let sum = 0;
    A.forEach(x => { let bi = -1, bs = 0; B.forEach((y, i) => { if (used.has(i)) return; const s = tsim(x, y); if (s > bs) { bs = s; bi = i } }); if (bi >= 0 && bs >= 0.6) { used.add(bi); sum += bs } });
    let sc = sum / Math.max(A.length, B.length);
    const x = nz(a), y = nz(c); if (x && y && (x.includes(y) || y.includes(x))) sc = Math.max(sc, 0.7);
    if (kind === "color" && ckey(a) === ckey(c)) sc = Math.max(sc, 0.95);
    return sc;
  }
  /* يرجّع: ok (مطابق حرفيًا) | auto (واثق: صحّحه) | near (اقتراحات) | no | unk (مفيش قائمة) */
  function resolve(kind, text, sec) {
    const L = list(kind); const raw = String(text == null ? "" : text).trim();
    if (!raw || !L.length) return { s: "unk" };
    const n = nz(raw);
    const ex = L.find(c => nz(c) === n); if (ex) return { s: "ok", val: ex };
    const al = S.alias[kind] && S.alias[kind][n]; if (al && L.includes(al)) return { s: "auto", val: al, sc: 1, why: "alias" };
    const hc = (kind === "item" && S.hcount[sec]) || null; const mx = hc ? Math.max(1, ...Object.values(hc)) : 1;
    const ranked = L.map(c => ({ c, sc: score(raw, c, kind), b: hc ? 0.04 * ((hc[nz(c)] || 0) / mx) : 0 })).filter(x => x.sc >= (kind === "item" ? 0.5 : 0.6))
      .sort((a, b) => (b.sc + b.b) - (a.sc + a.b)).slice(0, 3);
    if (!ranked.length) return { s: "no" };
    const t = ranked[0], second = ranked[1];
    const th = kind === "worker" ? 0.9 : 0.85, mg = kind === "worker" ? 0.15 : 0.12;
    if (t.sc >= th && (!second || t.sc - second.sc >= mg)) return { s: "auto", val: t.c, sc: t.sc, alts: ranked.map(x => x.c) };
    return { s: "near", val: t.c, sc: t.sc, alts: ranked.map(x => x.c) };
  }
  const matchItem = (item, sec) => {
    if (!item) return { s: "unk" }; if (SKIP_ITEM[sec] || !S.items.length) return { s: "unk" };
    const r = resolve("item", item, sec);
    if (r.s === "ok" || r.s === "unk" || r.s === "no") return { s: r.s };
    return { s: "near", sug: r.val, sc: r.sc, alts: r.alts || [r.val] };
  };
  const shiftOf = t => { const k = SHIFT_MAP[nz(t)]; return k || null };

  /* لون ملتصق باسم الصنف («بهار كبير مضلع اسود») → افصله */
  function splitColor(item, sec) {
    const t = nz(item).split(" "); if (t.length < 3) return null;
    const known = new Set(S.colors.map(nz)); Object.keys(G).forEach(k => known.add(k));
    if (S.items.some(c => nz(c) === nz(item))) return null;
    for (const n of [2, 1]) {
      if (t.length - n < 2) continue;
      const ph = t.slice(-n).join(" "); if (!known.has(ph)) continue;
      const rest = t.slice(0, -n).join(" "); const r = resolve("item", rest, sec);
      if (r.s === "ok" || (r.s === "auto" && r.sc >= 0.85)) { const c = resolve("color", ph, sec); return { item: r.val, color: c.val || ph, rawItem: item } }
    }
    return null;
  }

  function median(a) { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

  /* تطبيق التصحيحات التلقائية مرة واحدة لكل حقل (ولا يُعاد لو المستخدم عدّله أو تراجع) */
  function run(v) {
    if (!S.base || !v || !Array.isArray(v.rows)) return;
    const sec = v.section;
    v.rows.forEach(r => {
      r._sm = r._sm || { done: {} }; r._auto = r._auto || {};
      const d = r._sm.done;
      if (!d.note && r.note) { r.note = String(r.note).replace(/^\s*مكتوب\s*بجانب\s*السطر\s*[:：]\s*/, "").trim() || null; d.note = true }
      if (!d.shift && r.shift) { const k = shiftOf(r.shift); if (k && k !== r.shift) { r._auto.shift = { from: r.shift, to: k }; r.shift = k } d.shift = true }
      if (!d.color && !r.color && r.item && !SKIP_ITEM[sec] && !d.item) { const sp = splitColor(r.item, sec); if (sp) { r._auto.item = { from: sp.rawItem, to: sp.item, note: "فُصل اللون «" + sp.color + "»" }; r.item = sp.item; r.color = sp.color; d.item = true; d.color = true } }
      if (!d.item && r.item && !SKIP_ITEM[sec] && S.items.length) {
        const x = resolve("item", r.item, sec);
        if (x.s === "ok" && x.val !== r.item) r.item = x.val;
        else if (x.s === "auto") { r._auto.item = { from: r.item, to: x.val, why: x.why }; r.item = x.val }
        d.item = true;
      }
      if (!d.color && r.color && S.colors.length) {
        const x = resolve("color", r.color, sec);
        if (x.s === "ok" && x.val !== r.color) r.color = x.val;
        else if (x.s === "auto") { r._auto.color = { from: r.color, to: x.val, why: x.why }; r.color = x.val }
        d.color = true;
      }
      if (!d.worker && r.worker && S.workers.length) {
        const x = resolve("worker", r.worker, sec);
        if (x.s === "ok" && x.val !== r.worker) r.worker = x.val;
        else if (x.s === "auto") { r._auto.worker = { from: r.worker, to: x.val, why: x.why }; r.worker = x.val }
        d.worker = true;
      }
    });
  }
  const touched = (r, k) => { r._sm = r._sm || { done: {} }; r._sm.done[k] = true; if (r._auto) delete r._auto[k] };
  function undo(r, k) { const a = r._auto && r._auto[k]; if (!a) return; if (a.why === "alias") forget(k, a.from); r[k] = a.from; delete r._auto[k]; r._sm.done[k] = true; if (k === "item" && a.note) { r._sm.done.color = true; r.color = null } }
  function learn(kind, raw, canon) {
    const n = nz(raw); if (!n || !canon || nz(canon) === n) return; S.alias[kind] = S.alias[kind] || {}; S.alias[kind][n] = canon; saveAlias();
    try { const db = root.db; if (db) Promise.resolve(db.from("ai_item_aliases").upsert({ kind, raw_norm: n, canonical: canon, updated_at: new Date().toISOString() }, { onConflict: "kind,raw_norm" })).catch(() => { }) } catch (e) { }
  }
  function forget(kind, raw) {
    const n = nz(raw); if (S.alias[kind]) delete S.alias[kind][n]; saveAlias();
    try { const db = root.db; if (db) Promise.resolve(db.from("ai_item_aliases").delete().eq("kind", kind).eq("raw_norm", n)).catch(() => { }) } catch (e) { }
  }
  function pick(v, r, k, j) {
    const x = resolve(k, r[k], v.section); const alts = x.alts || (x.val ? [x.val] : []); const to = alts[j]; if (!to) return;
    learn(k, r[k], to); r[k] = to; touched(r, k); delete r._dup;
  }

  /* وسوم صغيرة تحت كل سطر */
  function chipsHtml(v, r, i, esc) {
    const sec = v.section, out = [];
    ["item", "color", "worker", "shift"].forEach(k => {
      const a = r._auto && r._auto[k];
      if (a) out.push('<span class="sm-c ok">' + LBL[k] + ': صُحّح «' + esc(a.from) + '» ← «' + esc(a.to) + '»' + (a.note ? " (" + esc(a.note) + ")" : "") + ' <button type="button" data-undo="' + i + "|" + k + '">تراجع</button></span>');
    });
    ["item", "color", "worker"].forEach(k => {
      if (!r[k] || (k === "item" && SKIP_ITEM[sec])) return;
      const x = resolve(k, r[k], sec);
      if (x.s === "near" || x.s === "auto") out.push('<span class="sm-c">' + LBL[k] + ' — أقرب: ' + (x.alts || [x.val]).map((a, j) => '<button type="button" data-sfix="' + i + "|" + k + "|" + j + '">' + esc(a) + "</button>").join("") + "</span>");
      else if (x.s === "ok" && k === "item") out.push('<span class="sm-c ok2">✓ صنف مسجّل</span>');
      else if (x.s === "no" && k !== "worker") {
        /* اسم جديد مفيش له شبيه: اقتراح صريح بدل تحذير ساكت */
        const can = !(typeof itemsLocked === "function" && itemsLocked());
        out.push('<span class="sm-c new">' + (k === "item" ? "صنف جديد" : "لون جديد") + ' «' + esc(r[k]) + '» مش موجود في الكتالوج' + (can ? ' <button type="button" data-newcat="' + i + "|" + k + '">إضافته للكتالوج</button>' : " — اطلب من المدير إضافته أو اختر صنفًا مسجّلًا") + "</span>");
      } else if (x.s === "no" && k === "worker") out.push('<span class="sm-c new">العامل «' + esc(r[k]) + '» مش في قائمة العمال — راجع الاسم أو أضفه من صفحة العمال</span>');
    });
    const oi = (ordersInfo(v) || [])[i];
    if (oi) {
      if (oi.none && !oi.colorMiss) out.push('<span class="sm-c">بدون طلبية مفتوحة — هيتسجل حر</span>');
      else if (oi.alloc.length) out.push('<span class="sm-c ok">' + oi.alloc.map(a => "طلبية #" + a.id + " (متبقي " + a.rem + (a.due ? " · تسليم " + esc(a.due) : "") + ")" + (a.full ? " ✓ تكتمل" : "")).join(" + ") + "</span>");
    }
    return out.join("");
  }
  /* ملاحظات للتحقق (تُضاف للتحذيرات) */
  function check(v, r, n) {
    const W = [], sec = v.section;
    if (r.color && S.colors.length) { const x = resolve("color", r.color, sec); if (x.s === "no") W.push("سطر " + n + ": اللون «" + r.color + "» غير مسجّل في قائمة الألوان.") }
    if (r.worker && S.workers.length) { const x = resolve("worker", r.worker, sec); if (x.s === "no") W.push("سطر " + n + ": العامل «" + r.worker + "» غير موجود في قائمة العمال.") }
    const h = r.item && S.hist[sec] && S.hist[sec][nz(r.item)];
    if (h && h.length >= 5 && r.qty != null && r.qty > 0) {
      const md = median(h), mx = Math.max.apply(null, h);
      if (r.qty > Math.max(md * 4, mx * 1.5)) {
        const t = Math.round(r.qty / 10); const hint = r.qty >= 20 && Math.abs(t - md) <= md * 0.4 ? " — هل المقصود " + t + "؟" : "";
        W.push("سطر " + n + ": العدد " + r.qty + " أكبر بكثير من المعتاد لهذا الصنف (المتوسط حوالي " + Math.round(md) + ")" + hint);
      } else if (h.length >= 8 && md >= 20 && r.qty < md / 10) W.push("سطر " + n + ": العدد " + r.qty + " أقل بكثير من المعتاد (المتوسط حوالي " + Math.round(md) + ").");
    }
    const oi = (ordersInfo(v) || [])[n - 1];
    if (oi) {
      if (oi.colorMiss) W.push("سطر " + n + ": مفيش طلبية رش مفتوحة للصنف «" + r.item + "» بلون «" + r.color + "».");
      else if (!oi.none && oi.over > 0) W.push("سطر " + n + ": العدد " + r.qty + " أكبر من المتبقي في الطلبيات المفتوحة لهذا الصنف (" + oi.total + ") بمقدار " + oi.over + ".");
    }
    return W;
  }
  /* ربط الاستيراد بالطلبيات المفتوحة: يوزّع الكمية على أقدم طلبية تسليمًا ويكشف الزيادة عن المتبقي */
  function ordersInfo(v) {
    const sec = v.section, O = S.orders[sec]; if (!O) return null; const used = {};
    return v.rows.map(r => {
      if (!r.item || !(r.qty > 0)) return null;
      const n = nz(r.item); let cand = O.filter(o => nz(o.item) === n), colorMiss = false;
      if (sec === "spray" && r.color) { const c = cand.filter(o => !o.color || nz(o.color) === nz(r.color)); colorMiss = cand.length > 0 && !c.length; cand = c }
      cand = cand.map(o => ({ o, rem: Math.max(o.req - o.done - (used[o.id] || 0), 0) })).filter(x => x.rem > 0).sort((a, b) => (a.o.due || "9999").localeCompare(b.o.due || "9999") || a.o.id - b.o.id);
      let left = r.qty; const alloc = [];
      cand.forEach(x => { if (left <= 0) return; const t = Math.min(left, x.rem); alloc.push({ id: x.o.id, take: t, rem: x.rem, due: x.o.due, full: t >= x.rem }); used[x.o.id] = (used[x.o.id] || 0) + t; left -= t });
      return { alloc, over: left, total: cand.reduce((a, x) => a + x.rem, 0), none: !cand.length, colorMiss };
    });
  }
  const dupKey = r => [nz(r.item), nz(r.color), nz(r.worker), nz(r.shift)].join("|");
  function dupCount(v) { const s = new Set(); let c = 0; v.rows.forEach(r => { if (!r.item) return; const k = dupKey(r); if (s.has(k)) c++; else s.add(k) }); return c }
  function merge(v) {
    const map = new Map(), out = []; let c = 0;
    v.rows.forEach(r => {
      if (!r.item) { out.push(r); return }
      const k = dupKey(r), p = map.get(k);
      if (p) { p.qty = (p.qty == null && r.qty == null) ? null : (p.qty || 0) + (r.qty || 0); if (r.scrap != null) p.scrap = (p.scrap || 0) + r.scrap; if (r.note && p.note !== r.note) p.note = [p.note, r.note].filter(Boolean).join(" + "); delete p._dup; c++ }
      else { map.set(k, r); out.push(r) }
    });
    v.rows = out; return c;
  }
  function fixAll(v) { let c = 0; v.rows.forEach(r => { ["item", "color", "worker"].forEach(k => { if (!r[k] || (k === "item" && SKIP_ITEM[v.section])) return; const x = resolve(k, r[k], v.section); if (x.s === "near" && x.sc >= 0.75) { learn(k, r[k], x.val); r[k] = x.val; touched(r, k); delete r._dup; c++ } }) }); return c }
  function stats(v) { let a = 0; v.rows.forEach(r => { a += Object.keys(r._auto || {}).length }); return { auto: a, dups: dupCount(v) } }

  /* قوائم تُضاف لتعليمات ChatGPT كي يكتب الأسماء مطابقة للكتالوج من البداية */
  function promptExtra() {
    if (!S.base || !S.items.length) return "";
    const cut = (a, m) => a.slice(0, m).join(" | ");
    return "\n\nقوائم معتمدة: لو الاسم المكتوب بخط اليد يشبه اسمًا في القائمة (حتى لو ترتيب الكلمات أو الإملاء مختلف) اكتب الاسم من القائمة حرفيًا. لو لا يوجد ما يشبهه اكتب ما تراه كما هو ولا تخترع اسمًا. اللون اكتبه في حقل color وليس داخل اسم الصنف. الوردية واحدة من: صباحي | مسائي | ليلي.\n" +
      "الأصناف: " + cut(S.items, 300) + (S.colors.length ? "\nالألوان: " + cut(S.colors, 60) : "") + (S.workers.length ? "\nالعمال: " + cut(S.workers, 80) : "");
  }

  /* تحميل البيانات (قراءة فقط) */
  async function load(sec) {
    const db = root.db; if (!db) return;
    if (!S.p) S.p = (async () => {
      try {
        const c = await db.from("catalog").select("kind,name");
        if (!c.error && Array.isArray(c.data)) {
          S.items = c.data.filter(x => x.kind === "item" && x.name).map(x => x.name);
          S.colors = c.data.filter(x => x.kind === "color" && x.name).map(x => x.name);
        }
      } catch (e) { }
      try { const w = await db.from("workers").select("name").eq("active", true); if (!w.error && Array.isArray(w.data)) S.workers = w.data.map(x => String(x.name || "").trim()).filter(Boolean) } catch (e) { }
      try { // ألوان مستخدمة فعلًا في التصليح (تكمّل قائمة الكتالوج)
        const u = await db.from("repair_log").select("color").not("color", "is", null).order("id", { ascending: false }).limit(400);
        if (!u.error && Array.isArray(u.data)) { const have = new Set(S.colors.map(nz)); u.data.forEach(x => { const c = String(x.color || "").trim(); if (c && !have.has(nz(c))) { have.add(nz(c)); S.colors.push(c) } }) }
      } catch (e) { }
      try { // تصحيحات كتبها المدير في «ذاكرة المساعد» (تُستعمل فقط لو المعنى صنف موجود فعلًا)
        const k = await db.from("ai_knowledge").select("term,meaning").eq("active", true).eq("kind", "correction");
        if (!k.error && Array.isArray(k.data)) k.data.forEach(x => { const m = S.items.find(i => nz(i) === nz(x.meaning)); if (m && x.term && !S.alias.item[nz(x.term)]) S.alias.item[nz(x.term)] = m });
      } catch (e) { }
      try { // ذاكرة التصحيحات المشتركة بين كل الأجهزة (setup_ai_aliases.sql)
        const a = await db.from("ai_item_aliases").select("kind,raw_norm,canonical").limit(2000);
        if (!a.error && Array.isArray(a.data)) a.data.forEach(x => { if (S.alias[x.kind]) S.alias[x.kind][x.raw_norm] = x.canonical });
      } catch (e) { }
      S.base = S.items.length > 0 || S.colors.length > 0 || S.workers.length > 0;
      if (!S.base) S.p = null; // نعيد المحاولة لاحقًا لو فشل التحميل
    })();
    await S.p;
    if (sec && HIST_T[sec] && !S.hp[sec]) S.hp[sec] = (async () => {
      try {
        const [t, d] = HIST_T[sec]; const r = await db.from(t).select("item,qty").order("id", { ascending: false }).limit(800);
        if (!r.error && Array.isArray(r.data)) { const h = {}, cnt = {}; r.data.forEach(x => { const k = nz(x.item); if (!k) return; cnt[k] = (cnt[k] || 0) + 1; if (x.qty > 0) (h[k] = h[k] || []).push(+x.qty) }); S.hist[sec] = h; S.hcount[sec] = cnt }
      } catch (e) { }
    })();
    if (sec && ORD_T[sec] && !S.op[sec]) S.op[sec] = (async () => {
      try {
        const r = await db.from(ORD_T[sec]).select("id,item,status,due_date,qty_required,produced").eq("status", "open").limit(1000);
        if (r.error || !Array.isArray(r.data)) return;
        const cm = {};
        if (sec === "spray") { try { const c = await db.from("spray_orders").select("id,spray_color").limit(2000); if (!c.error && c.data) c.data.forEach(x => { cm[x.id] = x.spray_color || "" }) } catch (e) { } }
        S.orders[sec] = r.data.map(o => ({ id: o.id, item: o.item || "", color: cm[o.id] || "", req: +o.qty_required || 0, done: +o.produced || 0, due: o.due_date || "" }));
      } catch (e) { }
    })();
    if (sec && S.hp[sec]) await S.hp[sec];
    if (sec && S.op[sec]) await S.op[sec];
  }

  const css = document.createElement("style");
  css.textContent = ".sm-c.new{border-style:solid;border-color:var(--warn,#c28a00);color:var(--warn,#c28a00)}.sm-c.new button{font:inherit;cursor:pointer;border:1px solid currentColor;background:transparent;color:inherit;border-radius:999px;padding:0 8px}" + ".sm-c{display:inline-flex;flex-wrap:wrap;gap:4px;align-items:center;font-size:12.5px;padding:2px 8px;border-radius:999px;border:1px dashed var(--pri,#642631);color:var(--pri,#642631)}.sm-c.ok{border-style:solid;border-color:var(--ok,#2e7d4f);color:var(--ok,#2e7d4f);background:color-mix(in srgb,var(--ok,#2e7d4f) 9%,transparent)}.sm-c.ok2{border:0;color:var(--ok,#2e7d4f);padding:0}.sm-c button{border:1px solid currentColor;background:none;color:inherit;border-radius:8px;padding:0 7px;font:inherit;cursor:pointer}";
  (document.head || document.documentElement).appendChild(css);

  /* بعد إضافة اسم للكتالوج: يعتبره معروف فورًا */
  function addKnown(kind, name) { const L = list(kind); if (name && !L.some(c => nz(c) === nz(name))) L.push(name); }
  /* أسماء غير معروفة (مفيش لها شبيه) في الصفوف: [{kind,name,rows:[i..]}] */
  function unknowns(v) {
    const m = {}; (v.rows || []).forEach((r, i) => ["item", "color"].forEach(k => {
      if (!r[k] || (k === "item" && SKIP_ITEM[v.section])) return;
      if (resolve(k, r[k], v.section).s !== "no") return;
      const key = k + "|" + nz(r[k]); (m[key] = m[key] || { kind: k, name: r[k], rows: [] }).rows.push(i);
    })); return Object.keys(m).map(k => m[k]);
  }
  root.MasSmart = {
    addKnown, unknowns,
    ready: sec => load(sec).catch(() => { }), isReady: () => S.base, run, touched, undo, pick, learn, chipsHtml, check, merge, fixAll, stats, dupCount, matchItem, promptExtra, ordersInfo,
    _t: { resolve, splitColor, shiftOf, seed: o => { Object.assign(S, o); S.base = true }, S }
  };
})(typeof window !== "undefined" ? window : globalThis);
