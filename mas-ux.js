/* MAS UX — تحسينات مشتركة لكل الصفحات والأقسام والتبويبات
   1) أي حقل تاريخ: نقرة واحدة تفتح التقويم + أزرار (اليوم / أمس / قبل يومين / ±1 يوم)
   2) أي زوج من/إلى: فترات جاهزة (اليوم، أمس، آخر 7 أيام، هذا الشهر، الشهر الماضي، الكل)
   يعمل تلقائيًا على الحقول الثابتة وعلى النوافذ التي تُنشأ لاحقًا. يُحمَّل من common.js */
(function () {
  "use strict";
  if (window.__masUxDates) return; window.__masUxDates = 1;
  var $ = function (id) { return document.getElementById(id); };
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var iso = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  var shift = function (base, days) { var d = base ? new Date(base + "T12:00:00") : new Date(); if (isNaN(d)) d = new Date(); d.setDate(d.getDate() + days); return iso(d); };
  var fire = function (el) { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
  var clamp = function (el, v) { if (el.max && v > el.max) v = el.max; if (el.min && v < el.min) v = el.min; return v; };
  var setVal = function (el, v) { el.value = clamp(el, v); fire(el); };

  var PAIRS = { f: "t", wkF: "wkT" };
  function partnerOf(el) {
    var id = el.id; if (!id) return null;
    if (PAIRS[id]) return $(PAIRS[id]);
    var m = id.match(/^(.*)from$/i);
    return m ? $(m[1] + (/FROM$/.test(id) ? "TO" : "to")) : null;
  }
  var isTo = function (el) {
    var id = el.id || ""; if (/to$/i.test(id) && partnerOfRev(id)) return true;
    return id === "t" && $("f") && $("f").type === "date" || id === "wkT" && !!$("wkF");
  };
  function partnerOfRev(id) { var m = id.match(/^(.*)to$/i); return m ? $(m[1] + (/TO$/.test(id) ? "FROM" : "from")) : null; }

  /* ---------- حقل مفرد ---------- */
  function single(el) {
    el.classList.add("xd-in"); el.setAttribute("dir", "ltr");
    var bar = document.createElement("div");
    bar.className = "xd-q"; bar.setAttribute("role", "group"); bar.setAttribute("aria-label", "اختيار سريع للتاريخ");
    bar.innerHTML = '<button type="button" data-s="-1" title="اليوم السابق" aria-label="اليوم السابق">−١</button>' +
      '<button type="button" data-a="0">اليوم</button><button type="button" data-a="-1">أمس</button>' +
      '<button type="button" data-a="-2">قبل يومين</button>' +
      '<button type="button" data-s="1" title="اليوم التالي" aria-label="اليوم التالي">+١</button>';
    bar.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b || el.disabled) return;
      setVal(el, b.dataset.a != null ? shift(null, +b.dataset.a) : shift(el.value || iso(new Date()), +b.dataset.s));
      mark();
    });
    function mark() { [0, -1, -2].forEach(function (n) { var b = bar.querySelector('[data-a="' + n + '"]'); if (b) b.classList.toggle("on", el.value === shift(null, n)); }); }
    el.addEventListener("change", mark);
    el.insertAdjacentElement("afterend", bar); mark();
  }

  /* ---------- زوج من/إلى ---------- */
  function range(kind) {
    var t = new Date(), y = t.getFullYear(), m = t.getMonth();
    if (kind === "today") return [iso(t), iso(t)];
    if (kind === "yday") { var d = shift(null, -1); return [d, d]; }
    if (kind === "w") return [shift(null, -6), iso(t)];
    if (kind === "m") return [iso(new Date(y, m, 1)), iso(t)];
    if (kind === "pm") return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    return ["", ""];
  }
  function pair(f, t) {
    [f, t].forEach(function (el) { el.classList.add("xd-in"); el.setAttribute("dir", "ltr"); });
    var bar = document.createElement("div");
    bar.className = "xd-r"; bar.setAttribute("role", "group"); bar.setAttribute("aria-label", "فترات جاهزة");
    bar.innerHTML = '<button type="button" data-r="today">اليوم</button><button type="button" data-r="yday">أمس</button>' +
      '<button type="button" data-r="w">آخر 7 أيام</button><button type="button" data-r="m">هذا الشهر</button>' +
      '<button type="button" data-r="pm">الشهر الماضي</button><button type="button" data-r="all">الكل</button>';
    function mark() {
      bar.querySelectorAll("button").forEach(function (b) {
        var r = range(b.dataset.r);
        b.classList.toggle("on", f.value === r[0] && t.value === r[1] && (b.dataset.r !== "all" || (!f.value && !t.value)));
      });
    }
    bar.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var r = range(b.dataset.r); f.value = clamp(f, r[0]); t.value = clamp(t, r[1]); fire(f); fire(t); mark();
    });
    [f, t].forEach(function (el) { el.addEventListener("change", mark); });
    /* مكان الشريط: بعد العنصر الذي يضم حقل «إلى» داخل أقرب أب مشترك مع «من» */
    var c = f.parentElement; while (c && !c.contains(t)) c = c.parentElement;
    var anchor = t; while (anchor && anchor.parentElement !== c) anchor = anchor.parentElement;
    (anchor || t).insertAdjacentElement("afterend", bar); mark();
  }

  function scan() {
    document.querySelectorAll('input[type="date"]:not(.xd-in)').forEach(function (el) {
      if (el.classList.contains("xd-in") || el.disabled || el.readOnly) return;
      var p = partnerOf(el);
      if (p && p.type === "date" && !p.classList.contains("xd-in")) { pair(el, p); return; }
      if (isTo(el)) return; /* سيُعالج مع «من» */
      single(el);
    });
  }

  /* نقرة واحدة تفتح التقويم على اللابتوب */
  document.addEventListener("click", function (e) {
    var el = e.target;
    if (!(el instanceof HTMLInputElement) || el.type !== "date" || el.readOnly || el.disabled) return;
    try { if (el.showPicker && matchMedia("(pointer:fine)").matches) el.showPicker(); } catch (x) { }
  });

  var q = 0;
  function init() {
    scan();
    new MutationObserver(function () { clearTimeout(q); q = setTimeout(scan, 80); }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
