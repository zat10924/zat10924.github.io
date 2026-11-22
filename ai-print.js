/* ai-print.js — طباعة / PDF احترافي لتقارير الذكاء الاصطناعي.
   يستخدم نظام الطباعة الموجود في common.js (ترويسة الشعار ورقم المستند، التذييل، ترقيم الصفحات، التوقيعات) ويضيف تنسيق التقرير نفسه. */
(function (root, factory) {
  const m = factory(root);
  if (typeof module === "object" && module.exports) module.exports = m; else root.AiPrint = m;
})(typeof self !== "undefined" ? self : this, function (root) {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inl = t => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  const NUM = /^[+\-]?[\d٠-٩][\d٠-٩,.٬٫\s%]*(?:\s\S+)?$/;
  const TOT = /^(?:ال)?(?:إجمالي|اجمالي|المجموع|مجموع|الكل)/;
  const SEC_AR = { glaze: "جليز", deco: "زخرفة", spray: "رش", repair: "تصليح", casting: "الصب اليدوي", brush: "البرشر", finish: "الفنش", fire: "الحريق" };

  /* Markdown → أقسام: [{title, blocks:[{t:'p'|'ul'|'table', ...}]}] */
  function parse(md) {
    const lines = String(md || "").replace(/\r/g, "").split("\n"), secs = [{ title: "", blocks: [] }];
    let list = null, i = 0;
    const cur = () => secs[secs.length - 1].blocks;
    const flush = () => { list = null; };
    while (i < lines.length) {
      const l = lines[i].trim();
      if (/^\|.*\|$/.test(l) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
        flush();
        const row = x => x.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
        const head = row(l); i += 2; const rows = [];
        while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) { rows.push(row(lines[i])); i++; }
        cur().push({ t: "table", head, rows }); continue;
      }
      let m;
      if ((m = l.match(/^#{1,6}\s+(.+)/))) { flush(); secs.push({ title: m[1].replace(/\*\*/g, "").trim(), blocks: [] }); }
      else if ((m = l.match(/^[-*•]\s+(.+)/)) || (m = l.match(/^\d+[.)]\s+(.+)/))) { if (!list) { list = { t: "ul", items: [] }; cur().push(list); } list.items.push(m[1]); }
      else if (l === "") flush(); else { flush(); cur().push({ t: "p", text: l }); }
      i++;
    }
    return secs.filter(s => s.title || s.blocks.length);
  }
  const maxCols = secs => Math.max(0, ...secs.flatMap(s => s.blocks.filter(b => b.t === "table").map(b => b.head.length)));
  const needsLandscape = md => maxCols(parse(md)) >= 7;

  function tableHtml(b) {
    const th = b.head.map(c => "<th>" + inl(c) + "</th>").join("");
    const body = b.rows.map(r => {
      const tot = TOT.test(String(r[0] || "").replace(/\*\*/g, "").trim());
      return "<tr" + (tot ? ' class="tot"' : "") + ">" + b.head.map((_, k) => {
        const v = r[k] ?? "", plain = String(v).replace(/\*\*/g, "").trim();
        return "<td" + (k > 0 && NUM.test(plain) ? ' class="num"' : "") + ">" + inl(v) + "</td>";
      }).join("") + "</tr>";
    }).join("");
    return '<div class="ap-tw"><table><thead><tr>' + th + "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }
  function sectionHtml(s) {
    const kind = /خلاص/.test(s.title) ? "sum" : /توصي/.test(s.title) ? "rec" : "sec";
    const inner = s.blocks.map(b =>
      b.t === "p" ? "<p>" + inl(b.text) + "</p>"
        : b.t === "ul" ? (kind === "rec" ? "<ol>" : "<ul>") + b.items.map(x => "<li>" + inl(x) + "</li>").join("") + (kind === "rec" ? "</ol>" : "</ul>")
          : tableHtml(b)).join("");
    return '<section class="ap-' + kind + '">' + (s.title ? "<h3>" + inl(s.title) + "</h3>" : "") + inner + "</section>";
  }
  const dFull = d => { try { return new Date(d + "T00:00:00Z").toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); } catch (e) { return String(d); } };
  const periodText = p => !p || !p.from ? "" : (p.from === p.to || !p.to ? dFull(p.from) : dFull(p.from) + " إلى " + dFull(p.to));

  /* HTML كامل للتقرير (دالة نقية قابلة للاختبار) */
  function renderHtml(o) {
    const secs = parse(o.md), title = o.title || "تقرير الذكاء الاصطناعي";
    const secName = o.section ? (SEC_AR[o.section] || o.section) : "كل الأقسام";
    const meta = [["الفترة", periodText(o.period) || "—"], ["القسم", secName], ["السؤال", o.question || "—"]]
      .map(([k, v]) => "<div><small>" + esc(k) + "</small><b>" + esc(v) + "</b></div>").join("");
    const sign = o.sign === false ? "" : '<div class="print-sign"><div><span></span>إعداد: ' + esc(o.by || "") + "</div><div><span></span>مراجعة</div><div><span></span>اعتماد المدير</div></div>";
    return '<div class="print-head"><h2>' + esc(title) + '</h2></div><div class="ap-meta">' + meta + "</div>" +
      secs.map(sectionHtml).join("") +
      '<div class="ap-note">أُعدّ هذا التقرير بالذكاء الاصطناعي اعتمادًا على بيانات النظام وفق صلاحيات المستخدم، ويُراجَع قبل الاعتماد.</div>' + sign;
  }

  const CSS = `
  #airoot{position:fixed;left:-10000px;top:0;width:190mm;direction:rtl;background:#fff;color:#111}
  @media print{
    body.aiprint>*:not(#airoot):not(#pf):not(#pstyle){display:none!important}
    body.aiprint{padding:0!important;margin:0!important;background:#fff!important}
    body.aiprint #airoot{position:static!important;left:auto!important;width:auto!important;display:block}
    #airoot .ap-meta{display:grid;grid-template-columns:1fr 1fr 2fr;gap:8px;margin:0 0 12px}
    #airoot .ap-meta div{border:1px solid #E3D8C4;border-top:3px solid #D7B96F;border-radius:8px;padding:6px 10px;background:#FCF8F0!important;break-inside:avoid}
    #airoot .ap-meta small{display:block;color:#6b5a3a;font-weight:700;font-size:8.5pt}
    #airoot .ap-meta b{font-size:10.5pt;color:#421B24;line-height:1.5}
    #airoot section{margin:0 0 12px}
    #airoot h3{font-size:12.5pt;color:#642631;margin:0 0 7px;padding-bottom:4px;border-bottom:1.5px solid #E8DCC0;break-after:avoid}
    #airoot h3:before{content:"";display:inline-block;width:8px;height:8px;margin-inline-end:7px;background:#D7B96F;transform:rotate(45deg);vertical-align:1px}
    #airoot p{margin:4px 0;font-size:10.5pt;line-height:1.85}
    #airoot ul{margin:4px 0;padding-inline-start:20px;font-size:10.5pt;line-height:1.85}
    #airoot b{color:#421B24}
    #airoot .ap-sum{background:linear-gradient(90deg,#FBF7EE,#fff)!important;border:1px solid #E3D8C4;border-inline-start:6px solid #D7B96F;border-radius:10px;padding:10px 14px;break-inside:avoid}
    #airoot .ap-sum h3{border-bottom:0;padding-bottom:0}
    #airoot .ap-sum p{font-size:11.5pt}#airoot .ap-sum b{color:#642631;font-size:1.1em}
    #airoot .ap-rec ol{list-style:none;counter-reset:r;margin:4px 0;padding:0}
    #airoot .ap-rec li{counter-increment:r;position:relative;padding:5px 34px 5px 0;font-size:10.5pt;line-height:1.8;break-inside:avoid}
    #airoot .ap-rec li:before{content:counter(r);position:absolute;inset-inline-start:auto;right:0;top:6px;width:22px;height:22px;border-radius:50%;background:#642631!important;color:#fff;font-weight:800;font-size:9.5pt;display:grid;place-items:center;text-align:center;line-height:22px}
    #airoot .ap-tw{margin:6px 0;border:1px solid #E3D8C4;border-radius:9px;overflow:hidden}
    #airoot table{width:100%;border-collapse:collapse;font-size:9.5pt}
    #airoot thead{display:table-header-group}
    #airoot th{background:linear-gradient(180deg,#722c39,#5a2230)!important;color:#fff!important;padding:6px 8px;text-align:right;font-weight:700;border:0!important}
    #airoot td{padding:6px 8px;border-bottom:1px solid #EFE7D6;text-align:right;vertical-align:top}
    #airoot td.num{text-align:center;font-variant-numeric:tabular-nums;white-space:nowrap}
    #airoot tr{break-inside:avoid}
    #airoot tbody tr:nth-child(even) td{background:#FCF8F0!important}
    #airoot tr.tot td{background:linear-gradient(90deg,#F3EAEC,#FBF7EE)!important;font-weight:800;color:#421B24;border-top:2px solid #642631}
    #airoot .ap-note{margin-top:14px;padding-top:6px;border-top:1px dashed #cdbf9f;font-size:8.5pt;color:#6b5a3a}
    #airoot .print-sign{display:grid!important;grid-template-columns:repeat(3,1fr);gap:28px;margin-top:30px;padding-top:10px;border-top:1px solid #E3D8C4;break-inside:avoid;text-align:center;font-size:9.5pt}
    #airoot .print-sign span{display:block;height:34px;border-bottom:1.5px solid #B9984C;margin-bottom:6px}
  }`;

  /* ---------- الطباعة (متصفح فقط) ---------- */
  let busy = false;
  async function print(o) {
    if (busy || typeof document === "undefined") return;
    if (!o || !String(o.md || "").trim()) { if (typeof toast === "function") toast("مفيش تقرير يتطبع", "bad"); return; }
    busy = true;
    if (!document.getElementById("ai-print-css")) { const s = document.createElement("style"); s.id = "ai-print-css"; s.textContent = CSS; document.head.appendChild(s); }
    document.getElementById("airoot")?.remove();
    const el = document.createElement("div"); el.id = "airoot";
    const by = o.by || (typeof ME !== "undefined" && ME && ME.name) || "";
    const wantSign = typeof SET === "undefined" || SET.get("psign", true);
    el.innerHTML = renderHtml(Object.assign({}, o, { by, sign: wantSign }));
    document.body.appendChild(el); document.body.classList.add("aiprint");
    if (needsLandscape(o.md)) root.__po = "landscape";
    if (by) root.__pby = by;
    try { const im = new Image(); im.src = "logo-full.png"; await im.decode(); } catch (e) {}
    const done = () => {
      clearTimeout(guard); root.removeEventListener("afterprint", done);
      document.body.classList.remove("aiprint"); el.remove(); delete root.__po; delete root.__pby; busy = false;
    };
    const guard = setTimeout(done, 180000);   // أمان لو afterprint ما اتبعتش (بعض المتصفحات)
    root.addEventListener("afterprint", done);
    setTimeout(() => { try { root.print(); } catch (e) { done(); } }, 150);
  }
  return { print, renderHtml, parse, needsLandscape, periodText };
});
