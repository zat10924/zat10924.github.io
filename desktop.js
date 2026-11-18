/* MAS Manager 4.9.0 — طبقة تحسينات اللابتوب والكمبيوتر.
   بتشتغل فقط على الشاشات 1024px فأكثر، ومبتغيّرش أي حاجة على الهاتف.
   مفيش فيها اتصال بقاعدة البيانات ولا تعديل على منطق الصفحات: كلها تحسينات على الواجهة. */
(() => {
  "use strict";
  const wide = () => !!(window.matchMedia && matchMedia("(min-width: 1024px)").matches);
  if (!wide()) return;
  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  /* ---------- 1) اتصال أسرع بالسيرفر ---------- */
  try {
    if (typeof SUPABASE_URL === "string" && !document.querySelector('link[rel=preconnect][href^="' + SUPABASE_URL + '"]')) {
      const l = document.createElement("link");
      l.rel = "preconnect"; l.href = SUPABASE_URL; l.crossOrigin = "anonymous";
      document.head.appendChild(l);
    }
  } catch (e) {}

  /* ---------- 2) القائمة الجانبية: تتصغّر تلقائي على الشاشات الصغيرة لو المستخدم ما اختارش ---------- */
  const autoRail = () => {
    try {
      if (LS.get("navhide") === null && innerWidth < 1280 && document.body.classList.contains("hasside")) {
        document.body.classList.add("navhide");
      }
    } catch (e) {}
  };
  document.addEventListener("DOMContentLoaded", () => { autoRail(); setTimeout(autoRail, 700); setTimeout(autoRail, 1800); });

  /* ---------- 3) تذكّر آخر صفحة والرجوع لها عند فتح البرنامج ---------- */
  const PAGE = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const isHome = PAGE === "" || PAGE === "index.html";
  const loggedIn = () => {
    try { return Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k)); } catch (e) { return false; }
  };
  const remember = () => {
    if (isHome || PAGE === "download.html") return;
    LS.set("mas_last_page", JSON.stringify({ u: PAGE + location.search + location.hash, t: Date.now() }));
  };
  remember();
  addEventListener("hashchange", remember);
  addEventListener("pagehide", remember);
  try {
    // فتح جديد للبرنامج (من غير تنقّل داخلي) → كمّل من آخر صفحة. للإلغاء: localStorage.mas_resume_off = "1"
    if (isHome && !location.hash && !location.search && !document.referrer &&
        !sessionStorage.getItem("mas_resumed") && LS.get("mas_resume_off") !== "1" && loggedIn()) {
      sessionStorage.setItem("mas_resumed", "1");
      const v = JSON.parse(LS.get("mas_last_page") || "null");
      if (v && v.u && Date.now() - v.t < 12 * 3600 * 1000 && /^[a-z0-9_-]+\.html([?#].*)?$/i.test(v.u)) {
        location.replace(v.u);
        return;
      }
    }
  } catch (e) {}

  /* ---------- 4) الجداول: فرز + فلتر سريع + تصدير Excel + عرض على دفعات ---------- */
  const AR = "٠١٢٣٤٥٦٧٨٩", norm = s => String(s == null ? "" : s).replace(/[٠-٩]/g, d => AR.indexOf(d)).replace(/[\u064B-\u065F\u0670\u0640]/g, "").trim();
  const BATCH = 100, BATCH_MIN = 150;
  const cellText = td => (td ? td.textContent.replace(/\s+/g, " ").trim() : "");
  const sortKey = txt => {
    const t = norm(txt);
    const d = t.match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})/);
    if (d) return { n: +d[3] * 10000 + +d[2] * 100 + +d[1], num: true };
    const x = t.replace(/[,٬\s%]/g, "").replace(/٫/g, ".");
    if (x !== "" && /^-?\d+(\.\d+)?$/.test(x)) return { n: parseFloat(x), num: true };
    return { s: t, num: false };
  };
  const csvEsc = v => '"' + String(v).replace(/"/g, '""') + '"';

  function enhanceTable(tb) {
    if (tb.dataset.dt) return;
    const scroll = tb.closest(".scroll");
    const body = tb.tBodies && tb.tBodies[0];
    if (!scroll || !body) return;
    const rows0 = [...body.rows];
    if (rows0.length < 6) return;
    if (rows0.some(r => [...r.cells].some(c => c.colSpan > 1))) return;   // جداول فيها صفوف إجمالي/دمج: ما نلمسهاش
    const heads = tb.tHead ? [...tb.tHead.rows[tb.tHead.rows.length - 1].cells] : [];
    if (!heads.length) return;
    tb.dataset.dt = "1";
    tb.classList.add("mdt");

    const state = { col: -1, dir: 1, q: "", limit: rows0.length >= BATCH_MIN ? BATCH : Infinity };
    let all = rows0.slice();
    all.forEach((r, i) => { r._i = i; });

    // شريط الأدوات
    let bar = scroll.previousElementSibling;
    if (!(bar && bar.classList && bar.classList.contains("mdt-bar"))) {
      bar = document.createElement("div");
      bar.className = "mdt-bar";
      bar.innerHTML = '<input type="search" class="mdt-q" placeholder="فلترة سريعة داخل الجدول…" aria-label="فلترة الجدول" autocomplete="off">' +
        '<span class="mdt-n" aria-live="polite"></span><button type="button" class="btn ghost mdt-x">تصدير Excel</button>';
      scroll.before(bar);
    }
    const q = bar.querySelector(".mdt-q"), n = bar.querySelector(".mdt-n"), x = bar.querySelector(".mdt-x");
    if (all.length < 10) q.style.display = "none";

    let more = scroll.nextElementSibling;
    if (!(more && more.classList && more.classList.contains("mdt-more"))) {
      more = document.createElement("div");
      more.className = "mdt-more"; more.hidden = true;
      more.innerHTML = '<button type="button" class="btn ghost">عرض المزيد</button>';
      scroll.after(more);
    }

    const render = () => {
      // لو الصفحة أعادت رسم الجدول من جديد: نبدأ من الصفوف الحالية بدل القديمة
      if (tb.tBodies[0] !== body) { delete tb.dataset.dt; schedule(); return; }
      if ([...body.rows].some(r => r._i === undefined)) {
        all = [...body.rows]; all.forEach((r, i) => { r._i = i; });
      }
      const qq = norm(state.q).toLowerCase();
      let list = all.filter(r => !qq || norm(r.textContent).toLowerCase().includes(qq));
      if (state.col >= 0) {
        const keys = new Map(list.map(r => [r, sortKey(cellText(r.cells[state.col]))]));
        const allNum = [...keys.values()].every(k => k.num || k.s === "");
        list.sort((a, b) => {
          const ka = keys.get(a), kb = keys.get(b);
          let c;
          if (allNum) c = (ka.num ? ka.n : -Infinity) - (kb.num ? kb.n : -Infinity);
          else c = String(ka.s != null ? ka.s : ka.n).localeCompare(String(kb.s != null ? kb.s : kb.n), "ar");
          return (c || a._i - b._i) * state.dir;
        });
      } else list.sort((a, b) => a._i - b._i);
      const shown = new Set(list.slice(0, state.limit));
      const frag = document.createDocumentFragment();
      list.forEach(r => frag.appendChild(r));
      all.forEach(r => { if (!list.includes(r)) frag.appendChild(r); });
      body.appendChild(frag);
      all.forEach(r => { r.hidden = !shown.has(r); });
      n.textContent = qq ? list.length + " من " + all.length : all.length + " صف";
      more.hidden = list.length <= shown.size;
      if (!more.hidden) more.firstChild.textContent = "عرض المزيد (" + (list.length - shown.size) + " متبقي)";
      heads.forEach((h, i) => {
        h.setAttribute("aria-sort", i === state.col ? (state.dir === 1 ? "ascending" : "descending") : "none");
      });
    };

    heads.forEach((h, i) => {
      h.classList.add("mdt-h"); h.tabIndex = 0; h.title = "اضغط للترتيب";
      const go = () => { state.dir = state.col === i ? -state.dir : 1; state.col = i; render(); };
      h.addEventListener("click", go);
      h.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
    q.addEventListener("input", () => { state.q = q.value; state.limit = all.length >= BATCH_MIN ? BATCH : Infinity; render(); });
    more.firstChild.addEventListener("click", () => { state.limit += BATCH * 2; render(); });
    x.addEventListener("click", () => {
      const qq = norm(state.q).toLowerCase();
      const list = [...body.rows].filter(r => !qq || norm(r.textContent).toLowerCase().includes(qq));
      const lines = [heads.map(h => csvEsc(cellText(h))).join(",")]
        .concat(list.map(r => [...r.cells].map(c => csvEsc(cellText(c))).join(",")));
      const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      a.href = URL.createObjectURL(blob);
      a.download = (document.title || "table").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60) + " " + d + ".csv";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
    const sticky = () => tb.classList.toggle("mdt-sticky", scroll.scrollWidth > scroll.clientWidth + 2);
    addEventListener("resize", sticky);
    render();
    sticky();
  }

  let pending = false;
  const scan = () => {
    pending = false;
    document.querySelectorAll(".scroll table:not([data-dt])").forEach(t => { try { enhanceTable(t); } catch (e) {} });
  };
  const schedule = () => { if (!pending) { pending = true; setTimeout(scan, 60); } };
  const start = () => {
    scan();
    try { new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
