/* MAS AI — المساعد العائم. لا مفاتيح هنا؛ كل شيء عبر الدالة mas-ai-hub بجلسة المستخدم (RLS).
   يعتمد على: common.js (ME, db, canSee, canReports, today, esc, toast) + ai.js (masAi) + mas-ai-core.js */
(() => {
  "use strict";
  if (window.__masAi) return;
  const C = window.MasAiCore;
  if (!C || typeof ME === "undefined" || !ME || !ME.id || typeof masAi !== "function") return;
  const PAGE = location.pathname.split("/").pop() || "index.html";
  if (PAGE === "ai.html") return;
  window.__masAi = 1;

  /* ---------- حالة محفوظة لكل مستخدم ---------- */
  const K = k => "mas_ai_" + k + "_" + ME.id;
  const get = (k, d) => { try { const v = localStorage.getItem(K(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const put = (k, v) => { try { localStorage.setItem(K(k), JSON.stringify(v)); } catch (e) {} };
  const cfg = Object.assign({ open: false, full: false, pos: null }, get("cfg", {}));
  const saveCfg = () => put("cfg", cfg);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const NEWT = "محادثة جديدة", IMGT = "صورة مرفقة"; // IMGT: تُعرض بأيقونة كاميرا بدل الإيموجي
  const titleOf = ms => { const u = (ms || []).find(m => m.r === "u" && m.t && m.t !== IMGT && m.t !== "📷 صورة"); return u ? String(u.t).replace(/\s+/g, " ").slice(0, 46) : NEWT; };
  let convs = get("convs", null);
  if (!Array.isArray(convs)) { const old = get("hist", []); convs = old.length ? [{ id: uid(), title: "", ts: old[old.length - 1].ts || Date.now(), msgs: old }] : []; } // ترحيل السجل القديم لمحادثة واحدة
  convs = convs.filter(c => c && c.id && Array.isArray(c.msgs));
  convs.forEach(c => { c.ts = c.ts || Date.now(); c.title = c.title && c.title !== NEWT ? c.title : titleOf(c.msgs); });
  let curId = get("cur", null);
  if (!convs.some(c => c.id === curId)) curId = convs.length ? convs.slice().sort((a, b) => b.ts - a.ts)[0].id : null;
  let hist = curId ? convs.find(c => c.id === curId).msgs : [];
  const saveHist = () => {
    let list = convs.map(c => ({ id: c.id, title: c.title, ts: c.ts, msgs: c.msgs.slice(-50) }));
    for (let n = 0; n < 6; n++) {
      try { localStorage.setItem(K("convs"), JSON.stringify(list)); put("cur", curId); try { localStorage.removeItem(K("hist")); } catch (e) {} return; }
      catch (e) { const o = list.filter(c => c.id !== curId).sort((a, b) => a.ts - b.ts)[0]; if (!o) return; list = list.filter(c => c !== o); } // الذاكرة ممتلئة: نحذف أقدم محادثة
    }
  };
  if (convs.length && get("convs", null) === null) saveHist(); // تثبيت الترحيل من السجل القديم فورًا

  /* ---------- أيقونات ---------- */
  const IC = {
    spark: '<path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3z"/>',
    mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    send: '<path d="M4 12l16-8-6 16-2.5-6.5L4 12z"/>',
    min: '<path d="M5 12h14"/>', full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    snd: '<path d="M4 9v6h4l5 4V5L8 9H4zM16 9a4 4 0 0 1 0 6"/>', mute: '<path d="M4 9v6h4l5 4V5L8 9H4zM17 9l4 6M21 9l-4 6"/>',
    cam: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4V8z"/><circle cx="12" cy="13" r="3.5"/>',
    trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', warn: '<path d="M12 4l9 16H3L12 4zM12 10v4M12 17.5v.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', list: '<path d="M5 7h14M5 12h14M5 17h14"/>', search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>', redo: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
    up: '<path d="M7 11v9H4v-9h3zM7 11l4-7c1.6 0 2.6 1 2.3 2.6L12.7 9H19a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 18 19H7"/>',
    down: '<g transform="rotate(180 12 12)"><path d="M7 11v9H4v-9h3zM7 11l4-7c1.6 0 2.6 1 2.3 2.6L12.7 9H19a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 18 19H7"/></g>', pause: '<path d="M8 5v14M16 5v14"/>', play: '<path d="M7 4l12 8-12 8V4z"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  };
  const ic = (k, c) => `<svg viewBox="0 0 24 24" aria-hidden="true"${c ? ` class="${c}"` : ""}>${IC[k]}</svg>`;

  /* ---------- تنسيق ---------- */
  const css = `
  #masai-orb,#masai-panel{font-family:inherit;box-sizing:border-box}
  #masai-orb *,#masai-panel *{box-sizing:border-box}
  #masai-orb{position:fixed;z-index:9900;width:62px;height:62px;border-radius:50%;border:0;padding:0;cursor:grab;touch-action:none;-webkit-tap-highlight-color:transparent;
    background:radial-gradient(circle at 32% 26%,#ffffffb0 0,#ffffff00 30%),radial-gradient(circle at 50% 58%,#c85a74 0,#7a2a3c 56%,#35131e 100%);
    box-shadow:0 12px 26px #2510188c,inset -7px -9px 15px #1a0a1099,inset 6px 7px 12px #ffffff38;color:#fff;display:grid;place-items:center;animation:masai-float 4.5s ease-in-out infinite}
  #masai-orb svg{width:26px;height:26px;fill:none;stroke:#fff;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 1px 2px #0006);position:relative;z-index:2}
  #masai-orb::before{content:"";position:absolute;inset:-5px;border-radius:50%;border:2px solid transparent;pointer-events:none}
  #masai-orb.drag{cursor:grabbing;animation:none;transform:scale(1.06)}
  #masai-orb.st-listening{animation:masai-listen 1.1s ease-out infinite}
  #masai-orb.st-thinking::before{border-top-color:#d9b86a;border-right-color:#d9b86a66;animation:masai-spin 1s linear infinite}
  #masai-orb.st-error{background:radial-gradient(circle at 32% 26%,#ffffffa0 0,#fff0 30%),radial-gradient(circle at 50% 58%,#e5534b 0,#8e2420 60%,#3d0f0d 100%);animation:masai-shake .5s}
  #masai-orb.st-done{box-shadow:0 12px 26px #2510188c,0 0 0 6px #46d48344,inset -7px -9px 15px #1a0a1099,inset 6px 7px 12px #ffffff38}
  #masai-orb .dot{position:absolute;top:2px;right:2px;width:13px;height:13px;border-radius:50%;background:#46d483;border:2px solid #fff;z-index:3;display:none}
  #masai-orb.unread .dot{display:block}
  @keyframes masai-float{50%{transform:translateY(-4px)}}
  @keyframes masai-listen{0%{box-shadow:0 12px 26px #2510188c,0 0 0 0 #d9b86aaa}100%{box-shadow:0 12px 26px #2510188c,0 0 0 20px #d9b86a00}}
  @keyframes masai-spin{to{transform:rotate(360deg)}}
  @keyframes masai-talk{50%{transform:scale(1.09)}}
  @keyframes masai-shake{20%,60%{transform:translateX(-4px)}40%,80%{transform:translateX(4px)}}
  #masai-panel{position:fixed;z-index:9901;display:none;flex-direction:column;overflow:hidden;direction:rtl;background:var(--card,#fffdfb);color:var(--txt,#241d20);
    border:1px solid #d9b86a55;border-radius:22px;box-shadow:0 24px 70px #180b1266,0 0 0 1px #ffffff55 inset;width:410px;height:620px;max-width:calc(100vw - 16px)}
  #masai-panel.open{display:flex;animation:masai-in .22s ease-out}
  @keyframes masai-in{from{opacity:0;transform:translateY(14px) scale(.98)}}
  #masai-panel .h{position:relative;display:flex;align-items:center;gap:10px;padding:14px 12px 13px;color:#fff;
    background:radial-gradient(120% 140% at 100% 0,#8f3a50 0,#6e2735 45%,#35131e 100%)}
  #masai-panel .h::after{content:"";position:absolute;inset:auto 0 0 0;height:2px;background:linear-gradient(90deg,transparent,#d9b86a,transparent)}
  #masai-panel .av{position:relative;width:42px;height:42px;border-radius:50%;flex:none;display:grid;place-items:center;
    background:radial-gradient(circle at 32% 26%,#ffffffb0 0,#fff0 32%),radial-gradient(circle at 50% 58%,#d4687f 0,#8a3045 56%,#3d1522 100%);box-shadow:0 4px 12px #0006,inset -3px -4px 8px #1a0a1066}
  #masai-panel .av svg{width:21px;height:21px;fill:none;stroke:#fff;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
  #masai-panel .av i{position:absolute;bottom:0;left:0;width:12px;height:12px;border-radius:50%;background:#46d483;border:2px solid #4a1b28}
  #masai-panel.s-error .av i{background:#e5534b}#masai-panel.s-thinking .av i{background:#d9b86a;animation:masai-pulse 1s infinite}
  @keyframes masai-pulse{50%{opacity:.35}}
  #masai-panel .h .t{flex:1;min-width:0}#masai-panel .h b{display:block;font-size:16.5px;letter-spacing:.2px}#masai-panel .h small{display:block;font-size:11.5px;opacity:.82;margin-top:1px}
  #masai-panel .ib{width:34px;height:34px;border:0;border-radius:11px;background:#ffffff1a;color:#fff;display:grid;place-items:center;cursor:pointer;flex:none;transition:background .15s}
  #masai-panel .ib svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  #masai-panel .ib:hover{background:#ffffff36}
  #masai-panel .m{flex:1;overflow:auto;padding:14px 12px;display:flex;flex-direction:column;gap:10px;overscroll-behavior:contain;
    background:radial-gradient(circle at 100% 0,#f6e9ec 0,transparent 42%),var(--bg,#faf6f3)}
  #masai-panel .b{max-width:92%;padding:10px 13px;border-radius:16px;line-height:1.8;font-size:13.5px;overflow-wrap:anywhere;animation:masai-pop .2s ease-out}
  @keyframes masai-pop{from{opacity:0;transform:translateY(6px)}}
  #masai-panel .b.bot{align-self:flex-start;background:var(--card,#fff);border:1px solid var(--line,#eadfe3);border-inline-start:3px solid #c9a24f;border-top-right-radius:6px;box-shadow:0 2px 10px #3a1a2412}
  #masai-panel .b.user{align-self:flex-end;background:linear-gradient(135deg,#7c2d3d,#52202c);color:#fff;white-space:pre-wrap;border-top-left-radius:6px;box-shadow:0 4px 12px #52202c44}
  #masai-panel .b.wait::after{content:"";display:inline-block;width:18px;height:4px;margin-inline-start:8px;vertical-align:middle;border-radius:2px;background:linear-gradient(90deg,#c9a24f 30%,#0000 0) 0/9px 4px;animation:masai-dots 1s steps(3) infinite}
  @keyframes masai-dots{to{background-position:-27px 0}}
  #masai-panel .b.pic{padding:5px}#masai-panel .b.pic img{display:block;max-width:100%;max-height:200px;border-radius:12px}
  #masai-panel .b small.meta{display:block;margin-top:6px;font-size:10.5px;color:var(--muted,#8a7f84)}
  #masai-panel .b h2{font-size:14.5px;margin:10px 0 4px;color:#7a2a3c;padding-bottom:3px;border-bottom:1px dashed #d9b86a88}#masai-panel .b p{margin:4px 0}#masai-panel .b ul{margin:4px 0;padding-inline-start:18px}
  #masai-panel .b .tw{overflow-x:auto;margin:6px 0;border-radius:10px;border:1px solid var(--line,#e5dce0)}#masai-panel .b table{border-collapse:collapse;font-size:12px;min-width:240px;width:100%}
  #masai-panel .b th,#masai-panel .b td{border-bottom:1px solid var(--line,#eee2e6);padding:6px 8px;text-align:right;white-space:nowrap}
  #masai-panel .b th{background:#6e2735;color:#fff;font-weight:600}#masai-panel .b tr:nth-child(even) td{background:#f8f1f3}
  #masai-panel .b .retry{margin-top:7px;border:1px solid #7a2a3c;background:none;color:#7a2a3c;border-radius:10px;padding:6px 13px;font:inherit;font-size:12px;cursor:pointer}
  #masai-panel .hero{align-self:stretch;border-radius:18px;padding:16px 14px;color:#fff;background:radial-gradient(120% 120% at 0 0,#8f3a50 0,#52202c 60%,#2b0f18 100%);box-shadow:0 8px 22px #52202c44}
  #masai-panel .hero b{display:block;font-size:16px;margin-bottom:4px}#masai-panel .hero p{margin:0 0 10px;font-size:12.5px;opacity:.9;line-height:1.7}
  #masai-panel .hero ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}#masai-panel .hero li{font-size:12.5px;display:flex;gap:8px;align-items:center}
  #masai-panel .hero li::before{content:"";width:6px;height:6px;border-radius:50%;background:#d9b86a;flex:none}
  #masai-panel .chips{display:flex;gap:7px;overflow-x:auto;padding:8px 12px 2px;scrollbar-width:none;border-top:1px solid var(--line,#eadfe3);background:var(--card,#fff)}
  #masai-panel .chips::-webkit-scrollbar{display:none}
  #masai-panel .chip{flex:none;border:1px solid #d9b86a99;background:#fbf5e8;color:#5a2230;border-radius:999px;padding:7px 13px;font:inherit;font-size:12.5px;cursor:pointer;white-space:nowrap}
  #masai-panel .chip.cam{background:#6e2735;color:#fff;border-color:#6e2735}
  #masai-panel form{display:flex;gap:7px;align-items:flex-end;padding:8px 10px 11px;background:var(--card,#fff)}
  #masai-panel textarea{flex:1;min-height:44px;max-height:110px;resize:none;border:1px solid var(--line,#ddd);border-radius:14px;padding:11px 12px;background:var(--bg,#faf6f3);color:inherit;font:inherit;font-size:14px;outline:none}
  #masai-panel textarea:focus{border-color:#8b4655;box-shadow:0 0 0 3px #8b46551f}
  #masai-panel .fb{width:44px;height:44px;border:0;border-radius:14px;display:grid;place-items:center;cursor:pointer;flex:none}
  #masai-panel .fb svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  #masai-panel .mic,#masai-panel .att{background:var(--soft,#f4ecef);color:#6e2735;border:1px solid var(--line,#e2d6da)}#masai-panel .mic.on{background:#c0392b;color:#fff;border-color:#c0392b;animation:masai-listen 1.1s infinite}
  #masai-panel .mic.na{opacity:.45}
  #masai-panel .snd{background:linear-gradient(135deg,#7c2d3d,#52202c);color:#fff;box-shadow:0 4px 10px #52202c44}#masai-panel .snd:disabled{opacity:.45}
  /* بطاقة بيانات الصورة */
  #masai-panel .imp{display:grid;gap:8px;min-width:260px}
  #masai-panel .imp-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap}#masai-panel .imp-h b{font-size:13.5px}
  #masai-panel .bdg{font-size:11px;padding:2px 9px;border-radius:999px;background:#e6f4ea;color:#1e6b3a}#masai-panel .bdg.medium{background:#fff4d6;color:#8a5a00}#masai-panel .bdg.low{background:#fde3e1;color:#a12a22}
  #masai-panel .imp-m{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  #masai-panel .imp label{display:block;font-size:11px;color:var(--muted,#8a7f84);margin-bottom:2px}
  #masai-panel .imp input,#masai-panel .imp select{width:100%;min-width:0;border:1px solid var(--line,#ddd);border-radius:10px;padding:7px 8px;background:var(--bg,#faf6f3);color:inherit;font:inherit;font-size:13px}
  #masai-panel .imp-r{display:grid;grid-template-columns:1fr 1fr auto;gap:6px;padding:8px;border:1px solid var(--line,#eadfe3);border-radius:12px;background:var(--bg,#faf6f3)}
  #masai-panel .imp-r .it{grid-column:1/-1}#masai-panel .imp-r .x{align-self:end;width:34px;height:34px;border:0;border-radius:10px;background:#fde3e1;color:#a12a22;cursor:pointer;font-size:16px}
  #masai-panel .imp-n{font-size:12px;color:#8a5a00;background:#fff8e6;border-radius:10px;padding:7px 10px}
  #masai-panel .imp-a{display:flex;gap:7px;flex-wrap:wrap}
  #masai-panel .imp-a button{flex:1;min-width:120px;border:0;border-radius:12px;padding:10px 12px;font:inherit;font-size:13px;cursor:pointer;background:linear-gradient(135deg,#7c2d3d,#52202c);color:#fff}
  #masai-panel .imp-a button.g{background:var(--soft,#f4ecef);color:#6e2735;border:1px solid var(--line,#e2d6da)}
  /* شريط تعبئة التسجيل من الصورة (فوق أي نافذة) */
  #masai-tray{position:fixed;z-index:10050;top:max(8px,env(safe-area-inset-top));left:8px;right:8px;max-width:520px;margin-inline:auto;direction:rtl;font-family:inherit;
    background:linear-gradient(135deg,#52202c,#2b0f18);color:#fff;border-radius:16px;padding:10px 12px;box-shadow:0 12px 30px #0008;border:1px solid #d9b86a77}
  #masai-tray .t1{display:flex;justify-content:space-between;gap:8px;font-size:12px;opacity:.85}
  #masai-tray .t2{font-size:14px;margin:5px 0 8px;line-height:1.6}#masai-tray .t2 b{color:#f1d58f}
  #masai-tray .ta{display:flex;gap:6px}#masai-tray button{flex:1;border:0;border-radius:10px;padding:9px 6px;font:inherit;font-size:12.5px;cursor:pointer;background:#ffffff1f;color:#fff}
  #masai-tray button.p{background:#d9b86a;color:#2b0f18;font-weight:700}
  @media(max-width:600px){#masai-panel{width:auto;left:8px;right:8px;border-radius:20px}}
  #masai-panel .acts{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px}
  #masai-panel .ab{width:36px;height:36px;border:1px solid var(--line,#e2d6da);border-radius:11px;background:var(--soft,#f4ecef);color:#6e2735;display:grid;place-items:center;cursor:pointer;padding:0}
  #masai-panel .ab svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  #masai-panel .ab.on{background:#6e2735;color:#fff;border-color:#6e2735}
  #masai-panel .ab[hidden]{display:none}
  #masai-panel .acts .prt{margin-top:0;padding:7px 12px}
  #masai-panel .snd.stp{background:linear-gradient(135deg,#c0392b,#8e2420)}
  #masai-panel .dr-wrap{display:none;flex:1;flex-direction:column;min-height:0;background:var(--bg,#faf6f3)}
  #masai-panel.dr .dr-wrap{display:flex}
  #masai-panel.dr .m,#masai-panel.dr .chips,#masai-panel.dr form{display:none}
  #masai-panel .dr-top{display:flex;gap:8px;padding:10px;border-bottom:1px solid var(--line,#eadfe3);background:var(--card,#fff)}
  #masai-panel .dr-s{flex:1;display:flex;align-items:center;gap:6px;border:1px solid var(--line,#ddd);border-radius:12px;padding:0 10px;background:var(--bg,#faf6f3);min-width:0}
  #masai-panel .dr-s svg{width:17px;height:17px;flex:none;fill:none;stroke:#8a7f84;stroke-width:1.8;stroke-linecap:round}
  #masai-panel .dr-s input{flex:1;min-width:0;border:0;background:none;color:inherit;font:inherit;font-size:14px;padding:11px 0;outline:none}
  #masai-panel .dr-new{flex:none;display:flex;align-items:center;gap:6px;border:0;border-radius:12px;padding:0 12px;background:linear-gradient(135deg,#7c2d3d,#52202c);color:#fff;font:inherit;font-size:12.5px;cursor:pointer}
  #masai-panel .dr-new svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
  #masai-panel .dr-l{flex:1;overflow:auto;padding:8px 10px;display:flex;flex-direction:column;gap:7px;overscroll-behavior:contain}
  #masai-panel .dr-e{text-align:center;color:var(--muted,#8a7f84);font-size:13px;padding:28px 8px}
  #masai-panel .ci{display:flex;gap:6px;align-items:stretch}
  #masai-panel .co{flex:1;min-width:0;text-align:right;border:1px solid var(--line,#eadfe3);border-radius:13px;background:var(--card,#fff);color:inherit;font:inherit;padding:9px 12px;cursor:pointer}
  #masai-panel .ci.on .co{border-color:#c9a24f;box-shadow:0 0 0 2px #c9a24f33}
  #masai-panel .co b{display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #masai-panel .co small{display:block;font-size:11px;color:var(--muted,#8a7f84);margin-top:2px}
  #masai-panel .cd{width:42px;flex:none;border:1px solid var(--line,#eadfe3);border-radius:13px;background:#fde3e1;color:#a12a22;display:grid;place-items:center;cursor:pointer;padding:0}
  #masai-panel .cd svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  #masai-panel .i,#masai-tray .i{width:1.15em;height:1.15em;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;vertical-align:-.2em;flex:none}
  #masai-panel .hero b .i{color:#d9b86a;width:1.2em;height:1.2em;margin-inline-end:4px}
  #masai-panel .chip .i{vertical-align:-.25em;margin-inline-end:3px}
  #masai-panel .imp-r .x{display:grid;place-items:center;padding:0}
  #masai-panel .b.user .i{margin-inline-end:4px}
  #masai-panel.full{inset:10px!important;width:auto!important;height:auto!important;max-width:none}
  @media(prefers-reduced-motion:reduce){#masai-orb,#masai-orb::before,#masai-panel *{animation:none!important}}
  `;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  /* ---------- عناصر الواجهة ---------- */
  const orb = document.createElement("button");
  orb.id = "masai-orb"; orb.type = "button"; orb.setAttribute("aria-label", "فتح المساعد ماسي");
  orb.innerHTML = ic("spark") + '<span class="dot"></span>';
  const panel = document.createElement("section");
  panel.id = "masai-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "المساعد ماسي");
  panel.innerHTML = `
    <header class="h"><div class="av">${ic("spark")}<i></i></div><div class="t"><b>ماسي</b><small id="mai-sub">مساعد المصنع الذكي</small></div>
      <button class="ib" id="mai-new" type="button" aria-label="محادثة جديدة">${ic("plus")}</button>
      <button class="ib" id="mai-list" type="button" aria-label="المحادثات السابقة">${ic("list")}</button>
      <button class="ib" id="mai-full" type="button" aria-label="حجم كامل">${ic("full")}</button>
      <button class="ib" id="mai-min" type="button" aria-label="تصغير">${ic("min")}</button></header>
    <div class="m" id="mai-msgs" aria-live="polite"></div>
    <div class="dr-wrap" id="mai-drawer"><div class="dr-top"><label class="dr-s">${ic("search")}<input id="mai-q" type="search" placeholder="ابحث في المحادثات…" aria-label="بحث في المحادثات" autocomplete="off"></label><button type="button" class="dr-new" id="mai-new2">${ic("plus")}<span>جديدة</span></button></div><div class="dr-l" id="mai-convs"></div></div>
    <div class="chips" id="mai-chips"><button class="chip cam" type="button" data-cam="1">${ic("cam", "i")} اقرأ صورة</button>
      <button class="chip" type="button" data-q="ملخص إنتاج النهارده">ملخص النهارده</button>
      <button class="chip" type="button" data-q="أعلى نسب الهالك الشهر ده">أعلى هالك</button>
      <button class="chip" type="button" data-q="قارن بين الأقسام الشهر ده">قارن الأقسام</button></div>
    <form id="mai-form"><button class="fb att" id="mai-att" type="button" aria-label="إرفاق صورة">${ic("cam")}</button>
      <textarea id="mai-in" rows="1" maxlength="1500" placeholder="اكتب سؤالك أو ارفع صورة…" aria-label="رسالتك"></textarea>
      <button class="fb mic" id="mai-mic" type="button" aria-label="إملاء بالصوت">${ic("mic")}</button>
      <button class="fb snd" id="mai-send" type="submit" aria-label="إرسال">${ic("send")}</button></form>
    <input type="file" id="mai-file" accept="image/*" hidden>`;
  document.body.append(orb, panel);
  const $ = id => panel.querySelector("#" + id);
  const msgs = $("mai-msgs"), input = $("mai-in"), sendB = $("mai-send"), micB = $("mai-mic"), sub = $("mai-sub"), stT = document.createElement("span");

  /* ---------- عرض Markdown آمن ---------- */
  function md(src) {
    const lines = String(src || "").replace(/\r/g, "").split("\n"), inl = t => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    let out = "", list = false, i = 0; const cl = () => { if (list) { out += "</ul>"; list = false; } };
    while (i < lines.length) {
      const l = lines[i].trim();
      if (/^\|.*\|$/.test(l) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
        cl(); const row = x => x.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim()); const head = row(l); i += 2; let body = "";
        while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) { body += "<tr>" + row(lines[i]).map(c => "<td>" + inl(c) + "</td>").join("") + "</tr>"; i++; }
        out += '<div class="tw"><table><thead><tr>' + head.map(c => "<th>" + inl(c) + "</th>").join("") + "</tr></thead><tbody>" + body + "</tbody></table></div>"; continue;
      }
      let m;
      if ((m = l.match(/^#{1,6}\s+(.+)/))) { cl(); out += "<h2>" + inl(m[1]) + "</h2>"; }
      else if ((m = l.match(/^[-*•]\s+(.+)/)) || (m = l.match(/^\d+[.)]\s+(.+)/))) { if (!list) { out += "<ul>"; list = true; } out += "<li>" + inl(m[1]) + "</li>"; }
      else if (l === "") cl(); else { cl(); out += "<p>" + inl(l) + "</p>"; }
      i++;
    }
    cl(); return out;
  }
  const scroll = () => { msgs.scrollTop = msgs.scrollHeight; };
  function bubble(who, text, o = {}) {
    const d = document.createElement("div"); d.className = "b " + who;
    if (who === "user" && (text === IMGT || text === "📷 صورة")) d.innerHTML = ic("cam", "i") + " " + IMGT;
    else if (who === "bot" && !o.plain) d.innerHTML = md(text); else d.textContent = text;
    if (o.meta) { const s = document.createElement("small"); s.className = "meta"; s.textContent = o.meta; d.appendChild(s); }
    if (o.rec && o.rec.c) addActions(d, o.rec);
    if (o.ctx) addPrint(d, text, o.ctx);
    msgs.appendChild(d); scroll(); return d;
  }
  function addPrint(d, text, ctx) {
    if (!window.AiPrint || d.querySelector(".prt")) return;
    const b = document.createElement("button"); b.type = "button"; b.className = "retry prt"; b.textContent = "طباعة / PDF";
    b.onclick = () => AiPrint.print({ md: text, question: ctx.q, period: ctx.period, section: ctx.section });
    (d.querySelector(".acts") || d).appendChild(b);
  }
  function copyText(t) {
    const ok = () => toast("اتنسخ"), bad = () => toast("تعذّر النسخ", "bad");
    const fb = () => { try { const ta = document.createElement("textarea"); ta.value = t; ta.style.cssText = "position:fixed;opacity:0;top:0"; document.body.appendChild(ta); ta.select(); const r = document.execCommand("copy"); ta.remove(); r ? ok() : bad(); } catch (e) { bad(); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, fb); else fb();
  }
  /* أزرار الإجابة: نسخ · إعادة توليد (لآخر إجابة فقط) · تقييم */
  function addActions(d, rec) {
    if (d.querySelector(".acts")) return;
    const row = document.createElement("div"); row.className = "acts";
    const mk = (cls, icon, label) => { const b = document.createElement("button"); b.type = "button"; b.className = "ab " + cls; b.setAttribute("aria-label", label); b.title = label; b.innerHTML = ic(icon); row.appendChild(b); return b; };
    const cp = mk("cp", "copy", "نسخ الإجابة"), rg = mk("rg", "redo", "إعادة توليد الإجابة"), up = mk("up", "up", "إجابة مفيدة"), dn = mk("dn", "down", "إجابة غير مفيدة");
    const paint = () => { up.classList.toggle("on", rec.fb === 1); dn.classList.toggle("on", rec.fb === -1); up.setAttribute("aria-pressed", String(rec.fb === 1)); dn.setAttribute("aria-pressed", String(rec.fb === -1)); };
    paint();
    cp.onclick = () => copyText(rec.t);
    const rate = v => { rec.fb = rec.fb === v ? 0 : v; paint(); saveHist(); if (rec.fb) toast("تم حفظ تقييمك"); };
    up.onclick = () => rate(1); dn.onclick = () => rate(-1);
    rg.onclick = () => regen(rec, d);
    d.appendChild(row); refreshRegen();
  }
  function refreshRegen() { const all = msgs.querySelectorAll(".rg"); all.forEach((b, i) => { b.hidden = i !== all.length - 1; }); }
  function regen(rec, d) {
    if (busy || !rec.c || !rec.c.q) return;
    const i = hist.indexOf(rec); if (i >= 0) hist.splice(i, 1); saveHist(); d.remove(); refreshRegen();
    ask(rec.c.q, { silentUser: true, sec: rec.c.section || null });
  }
  function ensureConv() {
    let c = convs.find(x => x.id === curId);
    if (!c) {
      if (convs.length >= 20) { const o = convs.filter(x => x.id !== curId).sort((a, b) => a.ts - b.ts)[0]; if (o) convs.splice(convs.indexOf(o), 1); }
      c = { id: uid(), title: NEWT, ts: Date.now(), msgs: [] }; convs.push(c); curId = c.id;
    }
    hist = c.msgs; return c;
  }
  function remember(who, text, meta, ctx) {
    const c = ensureConv();
    const rec = { id: uid(), r: who, t: String(text).slice(0, 6000), m: meta || "", c: ctx || null, ts: Date.now() };
    c.msgs.push(rec); if (c.msgs.length > 50) c.msgs.splice(0, c.msgs.length - 50);
    hist = c.msgs; c.ts = rec.ts; if (c.title === NEWT && who === "u") c.title = titleOf([rec]);
    saveHist(); return rec;
  }

  /* ---------- الحالات ---------- */
  const LABEL = { ready: "جاهز أساعدك", listening: "بسمعك…", thinking: "بحلل البيانات…", error: "حصل خطأ", done: "تمام، خلصت" };
  let state = "ready", stTimer = 0;
  function setState(s, txt) {
    state = s; clearTimeout(stTimer);
    orb.className = orb.className.replace(/\bst-\w+/g, "").trim() + " st-" + s;
    panel.className = panel.className.replace(/\bs-\w+/g, "").trim() + " s-" + s;
    const label = txt || LABEL[s]; stT.textContent = label; sub.textContent = label;
    if (s === "done") stTimer = setTimeout(() => setState("ready"), 2500);
  }

  /* ---------- مكان الكرة والنافذة ---------- */
  const S = 62, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const defPos = () => ({ l: 14, t: Math.max(80, innerHeight - S - 96) });
  function layout() {
    const W = innerWidth, H = innerHeight, p = cfg.pos || defPos();
    const l = clamp(p.l, 6, W - S - 6), t = clamp(p.t, 6, H - S - 6);
    orb.style.left = l + "px"; orb.style.top = t + "px";
    if (cfg.full) { panel.style.cssText = ""; panel.classList.add("full"); return; }
    panel.classList.remove("full");
    const vv = window.visualViewport, vh = vv ? vv.height : H, vt = vv ? vv.offsetTop : 0;
    panel.style.cssText = "";
    if (W < 600) {   // شاشة هاتف: ورقة سفلية تتفادى الكيبورد
      const h = Math.min(680, vh - 16); panel.style.height = h + "px"; panel.style.top = (vt + vh - h - 8) + "px";
    } else {
      panel.style.height = Math.min(600, H - 24) + "px";
      if (l + S / 2 < W / 2) panel.style.left = Math.max(12, l) + "px"; else panel.style.right = Math.max(12, W - l - S) + "px";
      if (t > H / 2) panel.style.bottom = Math.max(12, H - t + 10) + "px"; else panel.style.top = Math.min(H - 200, t + S + 10) + "px";
    }
  }
  let drag = null;
  orb.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, l: parseFloat(orb.style.left), t: parseFloat(orb.style.top), moved: false }; try { orb.setPointerCapture(e.pointerId); } catch (_) {} });
  orb.addEventListener("pointermove", e => {
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 7) return;
    drag.moved = true; orb.classList.add("drag"); cfg.pos = { l: drag.l + dx, t: drag.t + dy }; layout();
  });
  const endDrag = () => { if (!drag) return; const mv = drag.moved; drag = null; orb.classList.remove("drag"); if (mv) { saveCfg(); orb._moved = Date.now(); } };
  orb.addEventListener("pointerup", endDrag); orb.addEventListener("pointercancel", endDrag);
  orb.addEventListener("click", () => { if (orb._moved && Date.now() - orb._moved < 350) return; toggle(true); });
  addEventListener("resize", layout); if (window.visualViewport) visualViewport.addEventListener("resize", layout);

  function toggle(v) {
    panel.classList.toggle("open", v); cfg.open = v; saveCfg();
    if (v) { orb.classList.remove("unread"); layout(); scroll(); if (innerWidth >= 600) input.focus(); } else { stopListen(); }
  }
  $("mai-min").onclick = () => toggle(false);
  $("mai-full").onclick = () => { cfg.full = !cfg.full; saveCfg(); layout(); };
  addEventListener("keydown", e => { if (e.key === "Escape" && panel.classList.contains("open")) { if (panel.classList.contains("dr")) drawer(false); else toggle(false); } });

  /* ---------- الصوت: الاستماع ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false;
  if (!SR) micB.classList.add("na");
  function stopListen() { if (rec) { try { rec.stop(); } catch (e) {} } }
  micB.onclick = () => {
    if (!SR) { toast("المتصفح أو التطبيق ده مش بيدعم الميكروفون. اكتب رسالتك، أو افتح البرنامج من Chrome.", "bad"); return; }
    if (listening) { stopListen(); return; }
    rec = new SR(); rec.lang = "ar-EG"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    const base = input.value.trim(); let finalT = "";
    rec.onstart = () => { listening = true; micB.classList.add("on"); setState("listening"); };
    rec.onresult = e => { let it = ""; for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) finalT += r[0].transcript + " "; else it += r[0].transcript; }
      input.value = (base ? base + " " : "") + (finalT + it).trim(); grow(); };
    rec.onerror = e => { const M = { "not-allowed": "اسمح للميكروفون من إعدادات المتصفح", "service-not-allowed": "اسمح للميكروفون من إعدادات المتصفح", "no-speech": "ما سمعتش حاجة، جرّب تاني", "network": "الميكروفون محتاج إنترنت", "audio-capture": "مفيش ميكروفون متاح" };
      setState("error", M[e.error] || "تعذّر التسجيل، جرّب تاني"); };
    rec.onend = () => { listening = false; micB.classList.remove("on"); if (state === "listening") setState("ready"); input.focus(); };
    try { rec.start(); } catch (e) { setState("error", "تعذّر تشغيل الميكروفون"); }
  };

  /* ---------- الإرسال والفهم ---------- */
  let busy = false, reqSeq = 0, curWait = null;
  function setBusy(v) { busy = v; sendB.disabled = false; sendB.innerHTML = ic(v ? "stop" : "send"); sendB.setAttribute("aria-label", v ? "إيقاف التوليد" : "إرسال"); sendB.classList.toggle("stp", v); }
  function stopGen() { // الإيقاف يفك الواجهة فورًا ويتجاهل رد الخادم المتأخر
    if (!busy) return; reqSeq++; setBusy(false);
    if (curWait) { curWait.classList.remove("wait"); curWait.textContent = "تم إيقاف الإجابة."; curWait = null; }
    setState("done", "تم الإيقاف");
  }
  const grow = () => { input.style.height = "auto"; input.style.height = Math.min(110, input.scrollHeight) + "px"; };
  input.addEventListener("input", grow);
  input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && innerWidth >= 600) { e.preventDefault(); if (!busy) $("mai-form").requestSubmit(); } });
  const allowed = p => p.g === "any" || (p.g === "sec" && canSee(p.f)) || (p.g === "rep" && canReports()) || (p.g === "admin" && ME.role === "admin");
  function say(text, o) { const d = bubble("bot", text, o); remember("b", text, o && o.meta); return d; }

  async function ask(q, ctx) {
    q = q.trim(); if (!q || busy) return;
    input.value = ""; grow(); if (panel.classList.contains("dr")) drawer(false);
    if (!(ctx && ctx.silentUser)) { bubble("user", q); remember("u", q); }
    // 1) أوامر الفتح محلية (بدون استهلاك من حد الاستخدام) وبحسب الصلاحية
    const nav = C.parseNav(q);
    if (nav) {
      if (!allowed(nav.page)) { say("معلش، حسابك مالهوش صلاحية يفتح " + nav.page.n + "."); setState("error", "مش مسموح"); return; }
      if (nav.page.f === PAGE && !nav.rest) { say("إنت فعلًا في " + nav.page.n + "."); return; }
      if (nav.rest) { try { sessionStorage.setItem("masai_pending", JSON.stringify({ u: ME.id, q: nav.rest, sec: C.SEC_OF[nav.page.f] || null })); } catch (e) {} }
      if (nav.page.f === PAGE) { if (nav.rest) { try { sessionStorage.removeItem("masai_pending"); } catch (e) {} return ask(nav.rest, { sec: C.SEC_OF[PAGE] || null, silentUser: true }); } return; }
      say("حاضر، بفتحلك " + nav.page.n + (nav.rest ? " وأجيبلك المطلوب" : "") + "…");
      cfg.open = true; saveCfg(); setTimeout(() => { location.href = nav.page.f; }, 500); return;
    }
    // 2) سؤال للذكاء الاصطناعي: القسم من الكلام أو من الصفحة الحالية، والفترة من الكلام
    const my = ++reqSeq; setBusy(true); setState("thinking");
    const body = { action: "ask", question: q };
    const sec = C.detectSection(q) || (ctx && ctx.sec) || C.SEC_OF[PAGE] || null; if (sec) body.sections = [sec];
    const per = C.parsePeriod(q, today()); if (per) { body.from = per.from; body.to = per.to; }
    const wait = bubble("bot", "ثانية واحدة أراجع البيانات…", { plain: true }); wait.classList.add("wait"); curWait = wait;
    const r = await masAi(body);
    if (my !== reqSeq) return; // اتوقفت الإجابة أثناء الانتظار
    setBusy(false); curWait = null;
    if (!r.ok) {
      wait.classList.remove("wait"); wait.textContent = r.msg; setState("error", r.msg);
      const b = document.createElement("button"); b.type = "button"; b.className = "retry"; b.textContent = "إعادة المحاولة";
      b.onclick = () => { wait.remove(); busy = false; ask(q, Object.assign({}, ctx, { silentUser: true })); }; wait.appendChild(document.createElement("br")); wait.appendChild(b); remember("b", r.msg); scroll(); return;
    }
    const PN = { gemini: "Gemini", groq: "Groq" };
    const meta = "المحرك: " + (PN[r.data.provider] || r.data.provider) + (r.data.failover ? " (تحويل تلقائي)" : "") + " · " + r.data.period.from + " ← " + r.data.period.to + (sec ? " · " + (SEC_AR[sec] || sec) : "");
    const pctx = { q, period: r.data.period, section: sec };
    wait.classList.remove("wait"); wait.innerHTML = md(r.data.answer); const s = document.createElement("small"); s.className = "meta"; s.textContent = meta; wait.appendChild(s);
    const rec = remember("b", r.data.answer, meta, pctx); addActions(wait, rec); addPrint(wait, r.data.answer, pctx); scroll(); setState("done");
    if (!panel.classList.contains("open")) orb.classList.add("unread");
  }
  $("mai-form").addEventListener("submit", e => { e.preventDefault(); if (busy) { stopGen(); return; } ask(input.value); });
  const ask_confirm = (m, y) => (typeof window.ask === "function" ? window.ask(m, y) : Promise.resolve(confirm(m)));
  const fmt = ts => { try { return new Date(ts).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };
  function drawer(v) { panel.classList.toggle("dr", v); if (v) { $("mai-q").value = ""; drawConvs(); } }
  function renderConv() {
    msgs.innerHTML = "";
    if (!hist.length) greet(); else hist.forEach(h => { if (h.r === "u") bubble("user", h.t); else bubble("bot", h.t, { meta: h.m, ctx: h.c, rec: h }); });
    refreshRegen(); scroll();
  }
  function newConv() {
    if (busy) stopGen();
    const c = convs.find(x => x.id === curId);
    if (!c || c.msgs.length) { curId = null; hist = []; saveHist(); }
    drawer(false); renderConv(); if (innerWidth >= 600) input.focus();
  }
  function openConv(id) { const c = convs.find(x => x.id === id); if (!c) return; if (busy) stopGen(); curId = id; hist = c.msgs; saveHist(); drawer(false); renderConv(); }
  function deleteConv(id) {
    const i = convs.findIndex(x => x.id === id); if (i < 0) return; convs.splice(i, 1);
    const was = id === curId;
    if (was) { if (busy) stopGen(); const n = convs.slice().sort((a, b) => b.ts - a.ts)[0]; curId = n ? n.id : null; hist = n ? n.msgs : []; }
    saveHist(); drawConvs(); if (was) renderConv();
  }
  function drawConvs() {
    const q = C.norm($("mai-q").value), box = $("mai-convs");
    const list = convs.filter(c => !q || C.norm(c.title).includes(q) || c.msgs.some(m => C.norm(m.t).includes(q))).sort((a, b) => b.ts - a.ts);
    box.innerHTML = list.length ? "" : '<div class="dr-e">' + (q ? "مفيش نتيجة للبحث" : "لسه مفيش محادثات محفوظة") + "</div>";
    list.forEach(c => {
      const row = document.createElement("div"); row.className = "ci" + (c.id === curId ? " on" : "");
      const o = document.createElement("button"); o.type = "button"; o.className = "co"; o.innerHTML = "<b></b><small></small>";
      o.firstChild.textContent = c.title; o.lastChild.textContent = fmt(c.ts) + " · " + c.msgs.filter(m => m.r === "u").length + " سؤال";
      const d = document.createElement("button"); d.type = "button"; d.className = "cd"; d.setAttribute("aria-label", "حذف المحادثة"); d.innerHTML = ic("trash");
      o.onclick = () => openConv(c.id);
      d.onclick = async () => { if (await ask_confirm("تحذف المحادثة دي؟", "نعم، احذف")) deleteConv(c.id); };
      row.append(o, d); box.appendChild(row);
    });
  }
  $("mai-new").onclick = newConv; $("mai-new2").onclick = newConv;
  $("mai-list").onclick = () => drawer(!panel.classList.contains("dr"));
  $("mai-q").addEventListener("input", drawConvs);
  window.addEventListener("online", () => { if (state === "error") setState("ready"); });
  window.addEventListener("offline", () => setState("error", "مفيش اتصال بالإنترنت"));

  function greet() {
    const d = document.createElement("div"); d.className = "hero";
    d.innerHTML = "<b>" + ic("spark", "i") + " أهلًا، أنا ماسي</b><p>مساعدك الذكي في المصنع: بحلّل الإنتاج والهالك، وبقرأ الصور وأوجّهها لقسمها.</p><ul><li>اسألني عن الإنتاج والهالك والأقسام</li><li>صوّر ورقة التسجيل وأنا أحوّلها لبيانات</li><li>قول «افتح قسم الحريق» وأفتحه لك</li></ul>";
    msgs.appendChild(d);
  }

  /* ---------- قراءة الصور وتوجيهها للقسم ---------- */
  const SEC_PAGE = { casting: "casting.html", brush: "brush.html", glaze: "glaze.html", deco: "decoration.html", spray: "spray.html", repair: "repair.html", finish: "finish.html", fire: "fire.html" };
  const fileIn = $("mai-file");
  const pickImg = () => { if (busy) return; fileIn.value = ""; fileIn.click(); };
  $("mai-att").onclick = pickImg;
  $("mai-chips").addEventListener("click", e => { const b = e.target.closest(".chip"); if (!b) return; if (b.dataset.cam) pickImg(); else ask(b.dataset.q); });

  async function shrink(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      let max = 1500, q = 0.82, out = "";
      for (let k = 0; k < 4; k++) {
        const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        out = c.toDataURL("image/jpeg", q);
        if (out.length < 2400000) break; max *= 0.75; q -= 0.07;
      }
      return out;
    } finally { URL.revokeObjectURL(url); }
  }
  fileIn.onchange = async () => {
    const f = fileIn.files && fileIn.files[0]; if (!f || busy) return;
    if (!/^image\//.test(f.type)) { toast("اختار صورة", "bad"); return; }
    toggle(true); const my = ++reqSeq; setBusy(true); setState("thinking", "بقرأ الصورة…");
    let data;
    try { data = await shrink(f); } catch (e) { setBusy(false); setState("error", "الصورة مش مدعومة"); say("معلش، مقدرتش أفتح الصورة. جرّب صورة JPG أو PNG."); return; }
    const pb = document.createElement("div"); pb.className = "b user pic";
    const im = document.createElement("img"); im.src = data; im.alt = "الصورة المرفوعة"; pb.appendChild(im); msgs.appendChild(pb); scroll();
    const wait = bubble("bot", "بقرأ الصورة وبحوّلها لبيانات…", { plain: true }); wait.classList.add("wait"); curWait = wait;
    const r = await masAi({ action: "vision", image: data.split(",")[1], mime: "image/jpeg", hint: C.SEC_OF[PAGE] || "" }, { retries: 0 });
    if (my !== reqSeq) return; setBusy(false); curWait = null; wait.classList.remove("wait");
    if (!r.ok) { wait.textContent = r.msg; setState("error", r.msg); return; }
    renderImport(wait, r.data.vision); setState("done");
    remember("u", IMGT); remember("b", "قرأت الصورة واستخرجت " + r.data.vision.rows.length + " سطر");
    if (!panel.classList.contains("open")) orb.classList.add("unread");
  };

  function renderImport(host, v) {
    host.textContent = "";
    if (!v.rows.length) { host.textContent = v.notes || "ما لقيتش بيانات إنتاج واضحة في الصورة. جرّب صورة أوضح وقريبة."; return; }
    const st = { sec: v.section !== "unknown" ? v.section : (C.SEC_OF[PAGE] || ""), date: v.date || today(), rows: v.rows.map(r => Object.assign({}, r)) };
    const CONF = { high: "ثقة عالية", medium: "ثقة متوسطة", low: "ثقة منخفضة — راجع كل رقم" };
    const box = document.createElement("div"); box.className = "imp";
    box.innerHTML = '<div class="imp-h"><b></b><span class="bdg ' + v.confidence + '">' + CONF[v.confidence] + '</span></div>' +
      '<div class="imp-m"><div><label>القسم</label><select data-f="sec"><option value="">— اختار القسم —</option>' +
      Object.keys(SEC_PAGE).map(k => '<option value="' + k + '"' + (k === st.sec ? " selected" : "") + ">" + esc(SEC_AR[k]) + "</option>").join("") +
      '</select></div><div><label>التاريخ</label><input type="date" data-f="date" value="' + esc(st.date) + '"></div></div>' +
      '<div class="imp-rows"></div>' + (v.notes ? '<div class="imp-n">' + esc(v.notes) + "</div>" : "") +
      '<div class="imp-a"><button type="button" data-a="go">فتح القسم وتجهيز التسجيل</button><button type="button" class="g" data-a="copy">نسخ كنص</button></div>';
    host.appendChild(box);
    const rowsEl = box.querySelector(".imp-rows"), title = box.querySelector(".imp-h b");
    const draw = () => {
      title.textContent = "اتقرا " + st.rows.length + " سطر";
      rowsEl.innerHTML = st.rows.map((r, i) => '<div class="imp-r" data-i="' + i + '"><div class="it"><label>الصنف</label><input data-k="item" value="' + esc(r.item || "") + '"></div>' +
        '<div><label>العدد</label><input data-k="qty" inputmode="numeric" value="' + (r.qty ?? "") + '"></div>' +
        '<div><label>الهالك</label><input data-k="scrap" inputmode="numeric" value="' + (r.scrap ?? "") + '"></div>' +
        '<button class="x" type="button" aria-label="حذف السطر">' + ic("x", "i") + '</button>' +
        '<div class="it"><label>العامل</label><input data-k="worker" value="' + esc(r.worker || "") + '"></div></div>').join("");
    };
    draw();
    box.addEventListener("input", e => {
      const el = e.target, f = el.dataset.f, k = el.dataset.k;
      if (f) { st[f] = el.value; return; }
      if (!k) return; const row = st.rows[+el.closest(".imp-r").dataset.i];
      row[k] = (k === "qty" || k === "scrap") ? (el.value === "" ? null : Math.max(0, parseInt(el.value, 10) || 0)) : (el.value.trim() || null);
    });
    box.addEventListener("click", e => {
      const x = e.target.closest(".x"); if (x) { st.rows.splice(+x.closest(".imp-r").dataset.i, 1); draw(); return; }
      const a = e.target.closest("[data-a]"); if (!a) return;
      const rows = st.rows.filter(r => r.item || r.qty != null || r.scrap != null);
      if (a.dataset.a === "copy") {
        const t = SEC_AR[st.sec] ? SEC_AR[st.sec] + " — " + st.date + "\n" : st.date + "\n";
        const txt = t + rows.map(r => [r.item, r.qty != null ? "العدد " + r.qty : "", r.scrap != null ? "هالك " + r.scrap : "", r.worker || ""].filter(Boolean).join(" | ")).join("\n");
        try { navigator.clipboard.writeText(txt); toast("اتنسخ"); } catch (_) { toast("تعذّر النسخ", "bad"); } return;
      }
      if (!st.sec) { toast("اختار القسم الأول", "bad"); return; }
      if (!rows.length) { toast("مفيش سطور للتسجيل", "bad"); return; }
      const file = SEC_PAGE[st.sec];
      if (!canSee(file)) { toast("حسابك مالهوش صلاحية على " + SEC_AR[st.sec], "bad"); return; }
      impSave({ u: ME.id, sec: st.sec, date: st.date, rows: rows.map(r => Object.assign({}, r, { done: false })) });
      if (file === PAGE) { drawTray(); toggle(false); toast("جاهز. اضغط زر التسجيل وهتتعبّى البيانات"); return; }
      say("حاضر، بفتحلك " + SEC_AR[st.sec] + " وأجهّز لك " + rows.length + " سطر للتسجيل…");
      cfg.open = false; saveCfg(); setTimeout(() => { location.href = file; }, 500);
    });
  }

  /* شريط التعبئة: يعبّي نافذة التسجيل العادية من بيانات الصورة. المستخدم يراجع ويحفظ بنفسه (لا كتابة تلقائية). */
  const IMP_K = "masai_import";
  const impLoad = () => { try { const x = JSON.parse(sessionStorage.getItem(IMP_K) || "null"); return x && x.u === ME.id ? x : null; } catch (e) { return null; } };
  const impSave = x => { try { x ? sessionStorage.setItem(IMP_K, JSON.stringify(x)) : sessionStorage.removeItem(IMP_K); } catch (e) {} };
  const curRow = x => x.rows.findIndex(r => !r.done);
  let tray = null, fctx = null;
  const rmTray = () => { if (tray) { tray.remove(); tray = null; } };
  function markDone(i) { const x = impLoad(); if (!x || !x.rows[i]) return; x.rows[i].done = true; impSave(x); drawTray(); }
  function setV(ov, id, v) {
    const el = ov.querySelector("#" + id); if (!el || el.disabled || v == null || v === "") return false;
    el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true;
  }
  function pickOpt(sel, txt) {
    if (!sel || !txt) return; const t = String(txt).trim();
    const o = [...sel.options].find(o => o.text.trim() && (o.text.includes(t) || t.includes(o.text.trim())));
    if (o) { sel.value = o.value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
  }
  function fillModal(row, x, i) {
    const ov = document.getElementById("ov"); if (!ov) return false;
    let n = 0;
    [["m-d", x.date], ["m-item", row.item], ["m-q", row.qty], ["m-scrap", row.scrap], ["m-n", row.note]].forEach(([id, v]) => { if (setV(ov, id, v)) n++; });
    pickOpt(ov.querySelector("#m-sh"), row.shift); pickOpt(ov.querySelector("#m-w"), row.worker);
    if (n) { fctx = { i, clicked: false }; ["mSave", "mSaveMore"].forEach(id => { const b = ov.querySelector("#" + id); if (b) b.addEventListener("click", () => { if (fctx) fctx.clicked = true; }); }); }
    return n > 0;
  }
  function drawTray() {
    const x = impLoad();
    if (!x || SEC_PAGE[x.sec] !== PAGE) { rmTray(); return; }
    const i = curRow(x);
    if (i < 0) { rmTray(); impSave(null); toast("خلّصت كل سطور الصورة"); return; }
    const r = x.rows[i];
    if (!tray) { tray = document.createElement("div"); tray.id = "masai-tray"; document.body.appendChild(tray); }
    tray.innerHTML = '<div class="t1"><span>' + ic("cam", "i") + ' من الصورة · ' + esc(SEC_AR[x.sec]) + " · " + esc(x.date) + "</span><span>سطر " + (i + 1) + " من " + x.rows.length + "</span></div>" +
      '<div class="t2"><b>' + esc(r.item || "—") + "</b>" + (r.qty != null ? " · العدد " + r.qty : "") + (r.scrap != null ? " · هالك " + r.scrap : "") + (r.worker ? " · " + esc(r.worker) : "") + "</div>" +
      '<div class="ta"><button type="button" class="p" data-t="fill">تعبئة</button><button type="button" data-t="done">تم ' + ic("check", "i") + ' التالي</button><button type="button" data-t="close">إغلاق</button></div>';
    tray.onclick = e => {
      const b = e.target.closest("button"); if (!b) return; const cx = impLoad(); if (!cx) return; const k = curRow(cx);
      if (b.dataset.t === "close") { impSave(null); rmTray(); }
      else if (b.dataset.t === "done") markDone(k);
      else if (b.dataset.t === "fill") { if (!fillModal(cx.rows[k], cx, k)) toast("افتح نافذة التسجيل (زر الإضافة) وأنا أعبّيها"); }
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
          const i = curRow(x); if (i >= 0 && fillModal(x.rows[i], x, i)) toast("اتعبّت من الصورة. راجع الأرقام وبعدين احفظ");
        }
      } catch (e) {}
      return r;
    };
    new MutationObserver(() => { if (fctx && !document.getElementById("ov")) { const c = fctx; fctx = null; if (c.clicked) markDone(c.i); } }).observe(document.body, { childList: true });
  }
  /* ---------- تشغيل ---------- */
  renderConv();
  setState("ready"); layout(); drawTray();
  if (cfg.open) toggle(true);
  try { // أمر معلّق بعد فتح صفحة (مثلاً: افتح الحريق واعرض إنتاج النهارده)
    const p = JSON.parse(sessionStorage.getItem("masai_pending") || "null"); sessionStorage.removeItem("masai_pending");
    if (p && p.u === ME.id && p.q) { toggle(true); setTimeout(() => ask(p.q, { sec: p.sec }), 400); }
  } catch (e) {}
})();
