/* mas-xlsx.js — قارئ ملفات Excel (.xlsx) بدون أي مكتبة خارجية.
   بيفتح الـ ZIP، يقرأ أول شيت (النصوص المشتركة + الأرقام + التواريخ)، ويرجّع مصفوفة صفوف.
   قراءة فقط: لا يكتب شيء ولا يتصل بالإنترنت. يشتغل في المتصفح (DecompressionStream) وفي Node 18+ للاختبار. */
(function (root) {
  "use strict";
  const MAX_FILE = 5 * 1024 * 1024, MAX_XML = 25 * 1024 * 1024, MAX_ROWS = 5000, MAX_COLS = 60;
  const u16 = (d, o) => d[o] | (d[o + 1] << 8), u32 = (d, o) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
  const dec = b => new TextDecoder("utf-8").decode(b);

  async function inflate(raw) {
    if (typeof DecompressionStream === "undefined") throw new Error("المتصفح قديم ولا يدعم قراءة Excel. احفظ الملف CSV أو الصق البيانات.");
    const ds = new DecompressionStream("deflate-raw");
    const w = ds.writable.getWriter(); w.write(raw); w.close();
    const out = [], rd = ds.readable.getReader(); let n = 0;
    for (;;) { const r = await rd.read(); if (r.done) break; n += r.value.length; if (n > MAX_XML) throw new Error("الملف بعد الفك أكبر من المسموح."); out.push(r.value); }
    const all = new Uint8Array(n); let p = 0; out.forEach(c => { all.set(c, p); p += c.length; }); return all;
  }

  /* ZIP: يرجّع خريطة اسم الملف ← دالة تفك محتواه */
  function zipIndex(d) {
    let e = -1;
    for (let i = d.length - 22; i >= Math.max(0, d.length - 65557); i--) if (u32(d, i) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error("الملف ليس ملف Excel (xlsx) صالحًا.");
    const cnt = u16(d, e + 10); let p = u32(d, e + 16); const map = {};
    for (let i = 0; i < cnt; i++) {
      if (u32(d, p) !== 0x02014b50) break;
      const method = u16(d, p + 10), csz = u32(d, p + 20), nl = u16(d, p + 28), el = u16(d, p + 30), cl = u16(d, p + 32), lo = u32(d, p + 42);
      const name = dec(d.subarray(p + 46, p + 46 + nl));
      map[name] = async () => {
        const ln = u16(d, lo + 26), le = u16(d, lo + 28), s = lo + 30 + ln + le, raw = d.subarray(s, s + csz);
        return method === 0 ? raw : method === 8 ? inflate(raw) : Promise.reject(new Error("طريقة ضغط غير مدعومة."));
      };
      p += 46 + nl + el + cl;
    }
    return map;
  }

  const unesc = s => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const attr = (tag, name) => { const m = tag.match(new RegExp("\\b" + name + '="([^"]*)"')); return m ? unesc(m[1]) : null; };
  const textOf = x => { let s = ""; x.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, (_, t) => { s += unesc(t); return ""; }); return s; };

  function colIdx(ref) { const m = /^([A-Z]+)/.exec(ref || ""); if (!m) return -1; let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; }

  const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
  function dateStyles(xml) {
    const custom = {}; (xml.match(/<numFmt\b[^>]*>/g) || []).forEach(t => { const id = attr(t, "numFmtId"), c = attr(t, "formatCode"); if (id != null) custom[id] = c || ""; });
    const cx = (xml.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/) || [""])[0], isD = [];
    (cx.match(/<xf\b[^>]*>/g) || []).forEach(t => {
      const id = +attr(t, "numFmtId"); let d = BUILTIN_DATE.has(id);
      if (!d && custom[id] != null) d = /[dmyhs]/i.test(custom[id].replace(/"[^"]*"|\[[^\]]*\]|\\./g, "")) && !/^(0|#|General)/i.test(custom[id]);
      isD.push(d);
    });
    return isD;
  }
  function serialToISO(n) { if (!(n > 0 && n < 2958466)) return null; const t = new Date(Math.round((n - 25569) * 864e5)); return t.toISOString().slice(0, 10); }

  async function readRows(input) {
    const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (buf.length > MAX_FILE) throw new Error("حجم ملف Excel أكبر من 5 ميجابايت.");
    if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error("الملف ليس بصيغة xlsx (الملفات القديمة .xls غير مدعومة، احفظه كـ xlsx أو CSV).");
    const z = zipIndex(buf), get = async n => z[n] ? dec(await z[n]()) : null;
    // اختيار أول شيت من workbook.xml
    let sheetPath = "xl/worksheets/sheet1.xml";
    const wb = await get("xl/workbook.xml"), rels = await get("xl/_rels/workbook.xml.rels");
    if (wb && rels) {
      const sh = (wb.match(/<sheet\b[^>]*>/g) || []).find(t => !/state="(hidden|veryHidden)"/.test(t));
      const rid = sh && (attr(sh, "r:id") || attr(sh, "id"));
      const rel = rid && (rels.match(/<Relationship\b[^>]*>/g) || []).find(t => attr(t, "Id") === rid);
      if (rel) { let tg = attr(rel, "Target") || ""; tg = tg.replace(/^\//, ""); sheetPath = /^xl\//.test(tg) ? tg : "xl/" + tg; }
    }
    if (!z[sheetPath]) { const any = Object.keys(z).find(n => /^xl\/worksheets\/[^/]+\.xml$/.test(n)); if (!any) throw new Error("لا يوجد شيت داخل الملف."); sheetPath = any; }
    const sheet = await get(sheetPath), ss = await get("xl/sharedStrings.xml"), st = await get("xl/styles.xml");
    const strings = ss ? (ss.match(/<si\b[\s\S]*?<\/si>|<si\s*\/>/g) || []).map(textOf) : [];
    const isDate = st ? dateStyles(st) : [];
    const rows = [];
    (sheet.match(/<row\b[\s\S]*?<\/row>|<row\b[^>]*\/>/g) || []).forEach(rx => {
      const rn = attr(rx.match(/^<row\b[^>]*>/)[0], "r"), ri = rn ? +rn - 1 : rows.length;
      if (ri >= MAX_ROWS) return;
      const row = [];
      (rx.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || []).forEach((cx, k) => {
        const head = cx.match(/^<c\b[^>]*>/)[0], ref = attr(head, "r"); let ci = ref ? colIdx(ref) : k; if (ci < 0 || ci >= MAX_COLS) return;
        const t = attr(head, "t"), s = attr(head, "s"), v = (cx.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let val = "";
        if (t === "s") val = strings[+v] || "";
        else if (t === "inlineStr") val = textOf(cx);
        else if (t === "str" || t === "e") val = v == null ? "" : unesc(v);
        else if (t === "b") val = v === "1" ? "TRUE" : "FALSE";
        else if (v != null && v !== "") {
          const n = Number(v);
          if (isFinite(n) && s != null && isDate[+s]) val = serialToISO(n) || v;
          else if (isFinite(n)) val = String(Math.round(n * 1e9) / 1e9);
          else val = unesc(v);
        }
        row[ci] = val;
      });
      for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = "";
      rows[ri] = row;
    });
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    while (rows.length && rows[rows.length - 1].every(c => String(c).trim() === "")) rows.pop();
    return rows;
  }

  const csvCell = c => { const s = String(c == null ? "" : c); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const toCSV = rows => rows.map(r => r.map(csvCell).join(",")).join("\n");
  /* نص بفواصل Tab (للصقه في خانة «الصق من Excel») */
  const toTSV = rows => rows.map(r => r.map(c => String(c == null ? "" : c).replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");

  root.MasXlsx = { readRows, toCSV, toTSV, isXlsx: f => /\.xlsx$/i.test(f.name || "") || /spreadsheetml\.sheet/.test(f.type || "") };
})(typeof window !== "undefined" ? window : globalThis);
