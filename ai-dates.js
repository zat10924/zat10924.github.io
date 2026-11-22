/* MAS AI — تنظيم تبويب المحادثة (التواريخ تتولاها mas-ux.js المشتركة) */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function syncChat() { var a = $("x_app"), p = $("tp_chat"); if (a && p) a.classList.toggle("chat-on", !p.hidden); }
  function dot() {
    var f = $("ai_from"), t = $("ai_to"), s = $("ai_sec"), b = $("x_flt");
    if (b && f && t) b.classList.toggle("has", !!(f.value || t.value || (s && s.value)));
  }
  function init() {
    syncChat(); dot();
    var p = $("tp_chat"); if (p) new MutationObserver(syncChat).observe(p, { attributes: true, attributeFilter: ["hidden"] });
    ["ai_from", "ai_to", "ai_sec"].forEach(function (id) { var e = $(id); if (e) e.addEventListener("change", dot); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
