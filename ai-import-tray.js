/* ai-import-tray.js — شريط تعبئة التسجيل في صفحات الأقسام.
   يقرأ masai_import (من MAS AI CENTER) ويعبّي نافذة التسجيل العادية سطرًا سطرًا.
   لا يحفظ أي شيء: المستخدم يراجع كل سطر ويضغط حفظ بنفسه. مستخرج من mas-ai.js (الزر العائم المتوقف). */
(function () {
  "use strict";
  if (window.__masTray) return; window.__masTray = 1;
  const SEC_PAGE = { casting: "casting.html", brush: "brush.html", glaze: "glaze.html", deco: "decoration.html", spray: "spray.html", repair: "repair.html", finish: "finish.html", fire: "fire.html" };
  const PAGE = location.pathname.split("/").pop() || "index.html";
  if (typeof ME === "undefined" || !ME) return;
  const IMP_K = "masai_import";
  const impLoad = () => { try { const x = JSON.parse(sessionStorage.getItem(IMP_K) || "null"); return x && x.u === ME.id && Array.isArray(x.rows) ? x : null; } catch (e) { return null; } };
  const impSave = x => { try { x ? sessionStorage.setItem(IMP_K, JSON.stringify(x)) : sessionStorage.removeItem(IMP_K); } catch (e) { } };
  const curRow = x => x.rows.findIndex(r => !r.done);
  let tray = null, fctx = null;
  const rmTray = () => { if (tray) { tray.remove(); tray = null; } };
  if (!document.getElementById("masai-tray-css")) {
    const st = document.createElement("style"); st.id = "masai-tray-css";
    st.textContent = "#masai-tray{position:fixed;z-index:10050;top:max(8px,env(safe-area-inset-top));left:8px;right:8px;max-width:520px;margin-inline:auto;direction:rtl;font-family:inherit;background:linear-gradient(135deg,#52202c,#2b0f18);color:#fff;border-radius:16px;padding:10px 12px;box-shadow:0 12px 30px #0008;border:1px solid #d9b86a77}#masai-tray .t1{display:flex;justify-content:space-between;gap:8px;font-size:12px;opacity:.85}#masai-tray .t2{font-size:14px;margin:5px 0 8px;line-height:1.6}#masai-tray .t2 b{color:#f1d58f}#masai-tray .ta{display:flex;gap:6px}#masai-tray button{flex:1;border:0;border-radius:10px;padding:9px 6px;font:inherit;font-size:12.5px;cursor:pointer;background:#ffffff1f;color:#fff}#masai-tray button.p{background:#d9b86a;color:#2b0f18;font-weight:700}";
    st.textContent += "body:has(#masai-tray) .ov .modal{max-height:calc(100dvh - 200px)!important;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}";
    document.head.appendChild(st);
  }
  function markDone(i) { const x = impLoad(); if (!x) return; (Array.isArray(i) ? i : [i]).forEach(k => { if (x.rows[k]) x.rows[k].done = true; }); impSave(x); drawTray(); }
  function setV(ov, id, v) {
    const el = ov.querySelector("#" + id); if (!el || el.disabled || v == null || v === "") return false;
    el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true;
  }
  function pickOpt(sel, txt) {
    if (!sel || !txt) return; const t = String(txt).trim();
    const o = [...sel.options].find(o => o.text.trim() && (o.text.includes(t) || t.includes(o.text.trim())));
    if (o) { sel.value = o.value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
  }
  /* نافذة «أكتر من صنف» (تصليح / إنتاج بدون طلبية): نعبّي كل السطور المتبقية مرة واحدة، كل صنف في سطر */
  function fillMulti(ov, x) {
    const box = ov.querySelector("#mrows"); if (!box) return false;
    const idx = []; x.rows.forEach((r, k) => { if (!r.done && (r.item || r.qty != null)) idx.push(k); });
    if (!idx.length) return false;
    const set = (el, v) => { if (!el || v == null || v === "") return; el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
    let w = null;
    idx.forEach(k => {
      const r = x.rows[k];
      let el = [...box.querySelectorAll(".mrow")].find(e => !e.querySelector(".it").value.trim() && !e.querySelector(".mq2").value.trim());
      if (!el) { const add = ov.querySelector("#madd"); if (add) add.click(); el = box.lastElementChild; }
      if (!el) return;
      set(el.querySelector(".it"), r.item); set(el.querySelector(".sb"), r.color || r.sub); set(el.querySelector(".mq2"), r.qty);
      if (r.worker && !w) w = r.worker;
    });
    set(ov.querySelector("#m-d"), x.date);
    if (w) { pickOpt(ov.querySelector("#m-w"), w); const wi = ov.querySelector("#m-w"); if (wi && wi.tagName === "INPUT") set(wi, w); }
    fctx = { i: idx, clicked: false };
    ov.addEventListener("click", e => { if (fctx && e.target.closest && e.target.closest("#mSave,#mSaveMore")) fctx.clicked = true; }, true);
    return true;
  }
  function fillModal(row, x, i) {
    const ov = document.getElementById("ov"); if (!ov) return false;
    if (ov.querySelector("#mrows")) return fillMulti(ov, x);
    let n = 0;
    [["m-d", x.date], ["m-item", row.item], ["m-q", row.qty], ["m-scrap", row.scrap], ["m-n", row.note]].forEach(([id, v]) => { if (setV(ov, id, v)) n++; });
    pickOpt(ov.querySelector("#m-sh"), row.shift); pickOpt(ov.querySelector("#m-w"), row.worker);
    const w = ov.querySelector("#m-w"); if (w && w.tagName === "INPUT") setV(ov, "m-w", row.worker);
    if (n) { fctx = { i, clicked: false }; ov.addEventListener("click", e => { if (fctx && e.target.closest && e.target.closest("#mSave,#mSaveMore")) fctx.clicked = true; }, true); }
    return n > 0;
  }
  function drawTray() {
    const x = impLoad();
    if (!x || SEC_PAGE[x.sec] !== PAGE) { rmTray(); return; }
    const i = curRow(x);
    if (i < 0) { rmTray(); impSave(null); if (typeof toast === "function") toast("خلّصت كل السطور"); return; }
    const r = x.rows[i], E = typeof esc === "function" ? esc : s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    if (!tray) { tray = document.createElement("div"); tray.id = "masai-tray"; document.body.appendChild(tray); }
    tray.innerHTML = '<div class="t1"><span><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;margin-inline-end:4px"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>من مركز الذكاء الاصطناعي · ' + E((typeof SEC_AR !== "undefined" && SEC_AR[x.sec]) || x.sec) + " · " + E(x.date) + "</span><span>سطر " + (i + 1) + " من " + x.rows.length + "</span></div>" +
      '<div class="t2"><b>' + E(r.item || "—") + "</b>" + (r.qty != null ? " · العدد " + E(r.qty) : "") + (r.scrap != null ? " · هالك " + E(r.scrap) : "") + (r.worker ? " · " + E(r.worker) : "") + (x.rows.filter(z => !z.done).length > 1 ? " · +" + (x.rows.filter(z => !z.done).length - 1) + " أصناف" : "") + "</div>" +
      '<div class="ta"><button type="button" class="p" data-t="fill">تعبئة</button><button type="button" data-t="done">تم، التالي</button><button type="button" data-t="close">إغلاق</button></div>';
    tray.onclick = e => {
      const b = e.target.closest("button"); if (!b) return; const cx = impLoad(); if (!cx) return; const k = curRow(cx);
      if (b.dataset.t === "close") { impSave(null); rmTray(); }
      else if (b.dataset.t === "done") markDone(k);
      else if (b.dataset.t === "fill") { if (!fillModal(cx.rows[k], cx, k) && typeof toast === "function") toast("افتح نافذة التسجيل (زر الإضافة) وأنا أعبّيها"); }
    };
  }
  if (typeof window.openModal === "function" && !window.__masOM) {
    window.__masOM = 1; const om = window.openModal;
    window.openModal = function (title) {
      if (fctx && fctx.clicked) { const c = fctx; fctx = null; markDone(c.i); }
      const r = om.apply(this, arguments);
      try {
        const x = impLoad();
        if (x && SEC_PAGE[x.sec] === PAGE && !/تعديل|حذف|تغيير|كلمة|مرور/.test(String(title))) {
          const i = curRow(x);
          if (i >= 0) {
            if (document.getElementById("mrows")) setTimeout(() => { try { const y = impLoad(); if (y && fillModal(y.rows[curRow(y)], y, curRow(y)) && typeof toast === "function") toast("اتعبّت كل الأصناف من الاستيراد. راجع الأرقام وبعدين احفظ"); } catch (e) { } }, 120);
            else if (fillModal(x.rows[i], x, i) && typeof toast === "function") toast("اتعبّت من الاستيراد. راجع الأرقام وبعدين احفظ");
          }
        }
      } catch (e) { }
      return r;
    };
    new MutationObserver(() => { if (fctx && !document.getElementById("ov")) { const c = fctx; fctx = null; if (c.clicked) markDone(c.i); } }).observe(document.body, { childList: true });
  }
  drawTray();
})();
