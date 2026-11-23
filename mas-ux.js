/* MAS UX — تحسينات مشتركة لكل الصفحات والأقسام والتبويبات
   1) أي حقل تاريخ: مكوّن واضح (اليوم والتاريخ بالعربي + سهم السابق/التالي) + نقرة واحدة تفتح التقويم + أزرار (اليوم / أمس / قبل يومين)
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

  /* ---------- مكوّن التاريخ: حقل واضح بدل عرض المتصفح الخام (كان يظهر 232026/11/ في RTL) ---------- */
  var ICO_CAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>';
  var ICO_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  var ICO_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  var fmtLong = function (v) {
    if (!v) return "";
    var d = new Date(v + "T12:00:00"); if (isNaN(d)) return v;
    try { return d.toLocaleDateString("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace("،", ""); }
    catch (e) { return v; }
  };
  var relTag = function (v) {
    if (!v) return "";
    return v === shift(null, 0) ? "اليوم" : v === shift(null, -1) ? "أمس" : v === shift(null, 1) ? "غدًا" : "";
  };
  /* يلف الحقل الأصلي (يبقى في الصفحة بنفس الـ id والقيمة) داخل مكوّن مرئي؛ الحقل الأصلي شفاف فوقه ليفتح التقويم */
  function build(el, withSteps) {
    var box = document.createElement("div"); box.className = "xd" + (withSteps ? "" : " xd-nostep");
    var fld = document.createElement("div"); fld.className = "xd-f";
    fld.innerHTML = ICO_CAL + '<span class="xd-t"></span><span class="xd-tag"></span>';
    var txt = fld.querySelector(".xd-t"), tag = fld.querySelector(".xd-tag");
    el.parentNode.insertBefore(box, el);
    var prev, next;
    if (withSteps) {
      prev = document.createElement("button"); prev.type = "button"; prev.className = "xd-st"; prev.dataset.s = "-1"; prev.title = prev.ariaLabel = "اليوم السابق"; prev.innerHTML = ICO_R;
      next = document.createElement("button"); next.type = "button"; next.className = "xd-st"; next.dataset.s = "1"; next.title = next.ariaLabel = "اليوم التالي"; next.innerHTML = ICO_L;
      box.appendChild(prev);
    }
    fld.appendChild(el); box.appendChild(fld);
    if (withSteps) box.appendChild(next);
    function paint() {
      var v = el.value, ph = el.getAttribute("placeholder") || "اختر التاريخ";
      txt.textContent = v ? fmtLong(v) : ph; txt.classList.toggle("ph", !v);
      var r = relTag(v); tag.textContent = r; tag.hidden = !r;
      box.classList.toggle("dis", !!el.disabled);
      if (prev) { prev.disabled = next.disabled = !!el.disabled; }
    }
    /* تغيير القيمة من كود الصفحة (el.value = ...) يحدّث العرض فورًا */
    try {
      var d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      Object.defineProperty(el, "value", { configurable: true, get: function () { return d.get.call(this); }, set: function (v) { d.set.call(this, v); paint(); } });
    } catch (e) { }
    el.addEventListener("input", paint); el.addEventListener("change", paint);
    new MutationObserver(paint).observe(el, { attributes: true, attributeFilter: ["disabled", "placeholder"] });
    paint();
    return { box: box, paint: paint };
  }

  /* ---------- حقل مفرد ---------- */
  function single(el) {
    el.classList.add("xd-in");
    var c = build(el, true), box = c.box;
    var bar = document.createElement("div");
    bar.className = "xd-q"; bar.setAttribute("role", "group"); bar.setAttribute("aria-label", "اختيار سريع للتاريخ");
    bar.innerHTML = '<button type="button" data-a="0">اليوم</button><button type="button" data-a="-1">أمس</button><button type="button" data-a="-2">قبل يومين</button>';
    var click = function (e) {
      var b = e.target.closest("button"); if (!b || el.disabled) return;
      setVal(el, b.dataset.a != null ? shift(null, +b.dataset.a) : shift(el.value || iso(new Date()), +b.dataset.s));
      mark();
    };
    function mark() { [0, -1, -2].forEach(function (n) { var b = bar.querySelector('[data-a="' + n + '"]'); if (b) b.classList.toggle("on", el.value === shift(null, n)); }); }
    bar.addEventListener("click", click);
    box.addEventListener("click", function (e) { if (e.target.closest(".xd-st")) click(e); });
    el.addEventListener("change", mark);
    box.insertAdjacentElement("afterend", bar); mark();
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
    [f, t].forEach(function (el) { el.classList.add("xd-in"); });
    var bf = build(f, false), bt = build(t, false);
    f.setAttribute("placeholder", "غير محدد"); t.setAttribute("placeholder", "غير محدد"); bf.paint(); bt.paint();
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
