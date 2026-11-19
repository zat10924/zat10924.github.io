/* mas-ai-core.js — منطق المساعد بدون DOM (قابل للاختبار): فهم أوامر الفتح، القسم، الفترة، وتجهيز النص للنطق */
(function (root, factory) {
  const m = factory();
  if (typeof module === "object" && module.exports) module.exports = m; else root.MasAiCore = m;
})(typeof self !== "undefined" ? self : this, function () {
  const norm = s => String(s ?? "").toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  // إزالة «ال» و«لل» من بداية الكلمة (الحريق، للحريق → حريق)
  const strip = s => norm(s).split(" ").map(w => {
    if (w.length > 4 && w.startsWith("وال")) w = w.slice(1);   // والحريق → الحريق
    return (w.length > 3 && w.startsWith("ال")) || (w.length > 3 && w.startsWith("لل")) ? w.slice(2) : w;
  }).join(" ");
  const has = (n, w) => (" " + n + " ").includes(" " + w + " ");

  const SEC_OF = { "glaze.html": "glaze", "decoration.html": "deco", "spray.html": "spray", "repair.html": "repair",
    "casting.html": "casting", "brush.html": "brush", "finish.html": "finish", "fire.html": "fire" };
  // g: نوع الفحص — sec = قسم (canSee)، rep = صفحات التقارير (canReports)، any = متاح للجميع، admin = للمدير
  const PAGES = [
    { f: "worker-search.html", k: ["بحث عن عامل", "بحث عامل"], n: "البحث عن عامل", g: "rep" },
    { f: "production.html", k: ["تسجيل انتاج"], n: "تسجيل الإنتاج", g: "any" },
    { f: "glaze.html", k: ["جليز"], n: "الجليز", g: "sec" },
    { f: "decoration.html", k: ["زخرفه"], n: "الزخرفة", g: "sec" },
    { f: "spray.html", k: ["رش"], n: "الرش", g: "sec" },
    { f: "brush.html", k: ["برشر", "برش"], n: "البرشر", g: "sec" },
    { f: "repair.html", k: ["تصليح"], n: "التصليح", g: "sec" },
    { f: "casting.html", k: ["صب"], n: "الصب اليدوي", g: "sec" },
    { f: "finish.html", k: ["فنش"], n: "الفنش", g: "sec" },
    { f: "fire.html", k: ["حريق"], n: "الحريق", g: "sec" },
    { f: "orders.html", k: ["طلبيات", "طلبيه"], n: "الطلبيات", g: "rep" },
    { f: "reports.html", k: ["تقارير", "تقرير"], n: "التقارير", g: "rep" },
    { f: "workers.html", k: ["عمال"], n: "العمال", g: "any" },
    { f: "search.html", k: ["بحث"], n: "البحث الشامل", g: "rep" },
    { f: "catalog.html", k: ["اصناف", "كتالوج", "اكواد"], n: "الأصناف والأكواد", g: "any" },
    { f: "settings.html", k: ["اعدادات"], n: "الإعدادات", g: "any" },
    { f: "users.html", k: ["مستخدمين"], n: "المستخدمين والصلاحيات", g: "admin" },
    { f: "activity.html", k: ["نشاط"], n: "سجل النشاط", g: "any" },
    { f: "index.html", k: ["رئيسيه"], n: "الصفحة الرئيسية", g: "any" },
  ];
  const findPage = txt => { const s = strip(txt); return PAGES.find(p => p.k.some(k => has(s, k))) || null; };

  const OPEN = "(?:افتح|فتح|روح|اروح|وديني|خدني)";
  const SPLIT = /\s+و?(?=(?:اعرض|عرض|وريني|قولي|هات|طلع|كام)(?:\s|$))/;
  // «افتح لي قسم الحريق واعرض إنتاج النهارده» → {page, rest:"اعرض انتاج النهارده"}
  function parseNav(text) {
    const n = norm(text).replace(/^(?:يا )?(?:ماسي|mas) /, "");
    const m = n.match(new RegExp("^" + OPEN + "(?: لي)?(?: قسم| صفحه| شاشه)? (.+)$"));
    if (!m) return null;
    const [target, ...restParts] = m[1].split(SPLIT);
    const page = findPage(target);
    if (!page) return null;
    return { page, rest: restParts.join(" ").trim() };
  }
  // قسم مذكور صراحة في الكلام (لتوجيه السؤال)
  function detectSection(text) {
    const s = strip(text);
    const p = PAGES.find(p => p.g === "sec" && p.k.some(k => has(s, k)));
    return p ? SEC_OF[p.f] : null;
  }
  const addDays = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  function parsePeriod(text, today) {
    const n = norm(text);
    if (["النهارده", "نهارده", "انهارده", "اليوم", "دلوقتي"].some(w => has(n, w))) return { from: today, to: today };
    if (["امبارح", "امس", "الامس"].some(w => has(n, w))) { const y = addDays(today, -1); return { from: y, to: y }; }
    if (["الاسبوع", "اسبوع", "اسبوعي"].some(w => has(n, w))) return { from: addDays(today, -6), to: today };
    if (["الشهر", "شهر", "شهري"].some(w => has(n, w))) return { from: today.slice(0, 8) + "01", to: today };
    return null;
  }
  // نص مناسب للنطق: الخلاصة فقط، بدون جداول أو رموز Markdown
  function plainForSpeech(md, max = 500) {
    let t = String(md || "");
    const m = t.match(/##\s*الخلاصة\s*\n([\s\S]*?)(?=\n##|$)/);
    if (m) t = m[1];
    return t.replace(/\|[^\n]*\|/g, " ").replace(/[*#>`_|-]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  }
  function chunks(t, max = 260) {
    const parts = String(t).split(/(?<=[.!؟?،:؛])\s+/), out = [];
    let cur = "";
    for (const p of parts) {
      if ((cur + " " + p).trim().length > max) { if (cur) out.push(cur); cur = p.slice(0, max); } else cur = (cur + " " + p).trim();
    }
    if (cur) out.push(cur);
    return out.slice(0, 5);
  }
  return { norm, strip, PAGES, SEC_OF, findPage, parseNav, detectSection, parsePeriod, plainForSpeech, chunks, addDays };
});
