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
  const cfg = Object.assign({ voice: false, rate: 1, open: false, full: false, pos: null }, get("cfg", {}));
  const saveCfg = () => put("cfg", cfg);
  let hist = get("hist", []);
  const saveHist = () => put("hist", hist.slice(-40));

  /* ---------- أيقونات ---------- */
  const IC = {
    spark: '<path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3z"/>',
    mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    send: '<path d="M4 12l16-8-6 16-2.5-6.5L4 12z"/>',
    min: '<path d="M5 12h14"/>', full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    snd: '<path d="M4 9v6h4l5 4V5L8 9H4zM16 9a4 4 0 0 1 0 6"/>', mute: '<path d="M4 9v6h4l5 4V5L8 9H4zM17 9l4 6M21 9l-4 6"/>',
    trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>', pause: '<path d="M8 5v14M16 5v14"/>', play: '<path d="M7 4l12 8-12 8V4z"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  };
  const ic = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${IC[k]}</svg>`;

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
  #masai-orb.st-speaking{animation:masai-talk .7s ease-in-out infinite}
  #masai-orb.st-error{background:radial-gradient(circle at 32% 26%,#ffffffa0 0,#fff0 30%),radial-gradient(circle at 50% 58%,#e5534b 0,#8e2420 60%,#3d0f0d 100%);animation:masai-shake .5s}
  #masai-orb.st-done{box-shadow:0 12px 26px #2510188c,0 0 0 6px #46d48344,inset -7px -9px 15px #1a0a1099,inset 6px 7px 12px #ffffff38}
  #masai-orb .dot{position:absolute;top:2px;right:2px;width:13px;height:13px;border-radius:50%;background:#46d483;border:2px solid #fff;z-index:3;display:none}
  #masai-orb.unread .dot{display:block}
  @keyframes masai-float{50%{transform:translateY(-4px)}}
  @keyframes masai-listen{0%{box-shadow:0 12px 26px #2510188c,0 0 0 0 #d9b86aaa}100%{box-shadow:0 12px 26px #2510188c,0 0 0 20px #d9b86a00}}
  @keyframes masai-spin{to{transform:rotate(360deg)}}
  @keyframes masai-talk{50%{transform:scale(1.09)}}
  @keyframes masai-shake{20%,60%{transform:translateX(-4px)}40%,80%{transform:translateX(4px)}}
  #masai-panel{position:fixed;z-index:9901;display:none;flex-direction:column;overflow:hidden;direction:rtl;background:var(--card,#fff);color:var(--txt,#241d20);
    border:1px solid var(--line,#e5dce0);border-radius:20px;box-shadow:0 20px 60px #180b1255;width:400px;height:600px;max-width:calc(100vw - 16px)}
  #masai-panel.open{display:flex}
  #masai-panel .h{display:flex;align-items:center;gap:8px;padding:12px;background:linear-gradient(135deg,#6e2735,#35131e);color:#fff}
  #masai-panel .h .t{flex:1;min-width:0}#masai-panel .h b{display:block;font-size:15px}#masai-panel .h small{font-size:11px;opacity:.85}
  #masai-panel .ib{width:34px;height:34px;border:0;border-radius:10px;background:#ffffff1c;color:#fff;display:grid;place-items:center;cursor:pointer;flex:none}
  #masai-panel .ib svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  #masai-panel .ib:hover{background:#ffffff33}
  #masai-panel .rate{background:#ffffff1c;color:#fff;border:0;border-radius:10px;height:34px;font:inherit;font-size:12px;padding:0 4px}
  #masai-panel .rate option{color:#222}
  #masai-panel .m{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:9px;overscroll-behavior:contain}
  #masai-panel .b{max-width:94%;padding:9px 12px;border-radius:14px;line-height:1.75;font-size:13.5px;overflow-wrap:anywhere}
  #masai-panel .b.bot{align-self:flex-start;background:var(--soft,#f6f1f3);border:1px solid var(--line,#e9e0e3)}
  #masai-panel .b.user{align-self:flex-end;background:#642631;color:#fff;white-space:pre-wrap}
  #masai-panel .b.say{outline:2px solid #d9b86a;outline-offset:1px}
  #masai-panel .b small.meta{display:block;margin-top:5px;font-size:10.5px;color:var(--muted,#766b70)}
  #masai-panel .b h2{font-size:14.5px;margin:8px 0 4px;color:#8b3347}#masai-panel .b p{margin:4px 0}#masai-panel .b ul{margin:4px 0;padding-inline-start:18px}
  #masai-panel .b .tw{overflow-x:auto;margin:6px 0}#masai-panel .b table{border-collapse:collapse;font-size:12px;min-width:240px;width:100%}
  #masai-panel .b th,#masai-panel .b td{border:1px solid var(--line,#e5dce0);padding:5px 7px;text-align:right;white-space:nowrap}
  #masai-panel .b th{background:#642631;color:#fff}
  #masai-panel .b .retry{margin-top:6px;border:1px solid #642631;background:none;color:#642631;border-radius:9px;padding:5px 12px;font:inherit;font-size:12px;cursor:pointer}
  #masai-panel .sb{display:flex;align-items:center;gap:8px;padding:6px 12px;border-top:1px solid var(--line,#e5dce0);font-size:12px;color:var(--muted,#766b70);min-height:34px}
  #masai-panel .sb .bars{display:flex;gap:2px;align-items:center;height:16px}
  #masai-panel .sb .bars i{width:3px;height:4px;border-radius:2px;background:#8b3347;display:block}
  #masai-panel.s-listening .bars i,#masai-panel.s-speaking .bars i{animation:masai-bar .8s ease-in-out infinite}
  #masai-panel .bars i:nth-child(2){animation-delay:.12s!important}#masai-panel .bars i:nth-child(3){animation-delay:.24s!important}#masai-panel .bars i:nth-child(4){animation-delay:.36s!important}#masai-panel .bars i:nth-child(5){animation-delay:.48s!important}
  @keyframes masai-bar{50%{height:16px}}
  #masai-panel.s-error .sb{color:#c0392b}#masai-panel.s-done .sb{color:#2e8b57}
  #masai-panel .sb .sp{margin-inline-start:auto;display:none;gap:5px}#masai-panel.s-speaking .sb .sp{display:flex}
  #masai-panel .sb .sp button{width:30px;height:30px;border-radius:9px;border:1px solid var(--line,#ddd);background:var(--soft,#f6f1f3);color:inherit;display:grid;place-items:center;cursor:pointer}
  #masai-panel .sb .sp svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8}
  #masai-panel form{display:flex;gap:7px;align-items:flex-end;padding:9px 10px 10px;border-top:1px solid var(--line,#e5dce0)}
  #masai-panel textarea{flex:1;min-height:44px;max-height:110px;resize:none;border:1px solid var(--line,#ddd);border-radius:12px;padding:11px;background:var(--bg,#fff);color:inherit;font:inherit;font-size:14px;outline:none}
  #masai-panel textarea:focus{border-color:#8b4655;box-shadow:0 0 0 3px #8b46551f}
  #masai-panel .fb{width:44px;height:44px;border:0;border-radius:12px;display:grid;place-items:center;cursor:pointer;flex:none}
  #masai-panel .fb svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  #masai-panel .mic{background:var(--soft,#f1eaed);color:#642631;border:1px solid var(--line,#ddd)}#masai-panel .mic.on{background:#c0392b;color:#fff;border-color:#c0392b;animation:masai-listen 1.1s infinite}
  #masai-panel .mic.na{opacity:.45}
  #masai-panel .snd{background:#642631;color:#fff}#masai-panel .snd:disabled{opacity:.45}
  @media(max-width:600px){#masai-panel{width:auto;left:8px;right:8px;border-radius:18px}}
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
    <header class="h"><div class="t"><b>ماسي</b><small id="mai-sub">جاهز أساعدك</small></div>
      <select class="rate" id="mai-rate" aria-label="سرعة الصوت"><option value="0.8">بطيء</option><option value="1">عادي</option><option value="1.2">سريع</option></select>
      <button class="ib" id="mai-snd" type="button" aria-label="تشغيل أو إيقاف الرد الصوتي"></button>
      <button class="ib" id="mai-clr" type="button" aria-label="مسح المحادثة">${ic("trash")}</button>
      <button class="ib" id="mai-full" type="button" aria-label="حجم كامل">${ic("full")}</button>
      <button class="ib" id="mai-min" type="button" aria-label="تصغير">${ic("min")}</button></header>
    <div class="m" id="mai-msgs" aria-live="polite"></div>
    <div class="sb"><span class="bars"><i></i><i></i><i></i><i></i><i></i></span><span id="mai-st">جاهز</span>
      <span class="sp"><button type="button" id="mai-pause" aria-label="إيقاف مؤقت">${ic("pause")}</button><button type="button" id="mai-stop" aria-label="إيقاف الصوت">${ic("stop")}</button></span></div>
    <form id="mai-form"><textarea id="mai-in" rows="1" maxlength="1500" placeholder="اكتب أو اضغط الميكروفون وكلّمني…" aria-label="رسالتك"></textarea>
      <button class="fb mic" id="mai-mic" type="button" aria-label="تحدّث">${ic("mic")}</button>
      <button class="fb snd" id="mai-send" type="submit" aria-label="إرسال">${ic("send")}</button></form>`;
  document.body.append(orb, panel);
  const $ = id => panel.querySelector("#" + id);
  const msgs = $("mai-msgs"), input = $("mai-in"), sendB = $("mai-send"), micB = $("mai-mic"), sub = $("mai-sub"), stT = $("mai-st");

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
    if (who === "bot" && !o.plain) d.innerHTML = md(text); else d.textContent = text;
    if (o.meta) { const s = document.createElement("small"); s.className = "meta"; s.textContent = o.meta; d.appendChild(s); }
    if (o.ctx) addPrint(d, text, o.ctx);
    msgs.appendChild(d); scroll(); return d;
  }
  function addPrint(d, text, ctx) {
    if (!window.AiPrint || d.querySelector(".prt")) return;
    const b = document.createElement("button"); b.type = "button"; b.className = "retry prt"; b.textContent = "طباعة / PDF";
    b.onclick = () => AiPrint.print({ md: text, question: ctx.q, period: ctx.period, section: ctx.section });
    d.appendChild(b);
  }
  function remember(who, text, meta, ctx) { hist.push({ r: who, t: String(text).slice(0, 6000), m: meta || "", c: ctx || null, ts: Date.now() }); saveHist(); }

  /* ---------- الحالات ---------- */
  const LABEL = { ready: "جاهز أساعدك", listening: "بسمعك…", thinking: "بحلل البيانات…", speaking: "بتكلم…", error: "حصل خطأ", done: "تمام، خلصت" };
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
  addEventListener("keydown", e => { if (e.key === "Escape" && panel.classList.contains("open")) toggle(false); });

  /* ---------- الصوت: الرد ---------- */
  let spkId = 0, curAudio = null, curRes = null, paused = false, sayEl = null;
  const paintSnd = () => { $("mai-snd").innerHTML = ic(cfg.voice ? "snd" : "mute"); $("mai-snd").setAttribute("aria-pressed", cfg.voice); };
  $("mai-rate").value = String(cfg.rate); paintSnd();
  $("mai-rate").onchange = e => { cfg.rate = +e.target.value || 1; saveCfg(); };
  $("mai-snd").onclick = () => { cfg.voice = !cfg.voice; saveCfg(); paintSnd(); if (!cfg.voice) stopSpeak(); toast(cfg.voice ? "الرد الصوتي شغّال" : "الرد الصوتي موقوف"); };
  function stopSpeak() {
    spkId++; paused = false; try { curAudio && curAudio.pause(); } catch (e) {} curAudio = null;
    try { speechSynthesis.cancel(); } catch (e) {} if (curRes) { const r = curRes; curRes = null; r(); }
    if (sayEl) { sayEl.classList.remove("say"); sayEl = null; } if (state === "speaking") setState("ready");
  }
  $("mai-stop").onclick = stopSpeak;
  $("mai-pause").onclick = () => {
    if (curAudio) { if (paused) { curAudio.play(); } else curAudio.pause(); paused = !paused; }
    else { try { paused ? speechSynthesis.resume() : speechSynthesis.pause(); paused = !paused; } catch (e) {} }
    $("mai-pause").innerHTML = ic(paused ? "play" : "pause");
  };
  const ttsFetch = async t => {
    const r = await masAi({ action: "speak", text: t, rate: cfg.rate }, { retries: 0 });
    return r.ok && r.data && r.data.audio ? "data:" + r.data.mime + ";base64," + r.data.audio : null;
  };
  const playUrl = (url, my) => new Promise(res => {
    const a = new Audio(url); curAudio = a; curRes = res;
    const done = () => { if (curAudio === a) curAudio = null; curRes = null; res(); };
    a.onended = done; a.onerror = done; a.play().catch(done);
  });
  async function speak(text, el) {
    stopSpeak(); const my = spkId; const t = C.plainForSpeech(text); if (!t) return;
    sayEl = el || null; if (sayEl) sayEl.classList.add("say"); setState("speaking"); $("mai-pause").innerHTML = ic("pause");
    const parts = C.chunks(t); let next = ttsFetch(parts[0]);
    for (let i = 0; i < parts.length; i++) {
      const url = await next; if (my !== spkId) return;
      if (i + 1 < parts.length) next = ttsFetch(parts[i + 1]);
      if (!url) { // الخادم غير جاهز: صوت المتصفح كبديل (غالبًا مش مصري)
        const rest = parts.slice(i).join(" ");
        if ("speechSynthesis" in window) {
          await new Promise(res => { const u = new SpeechSynthesisUtterance(rest); u.lang = "ar-EG"; u.rate = cfg.rate;
            const v = speechSynthesis.getVoices().filter(x => /^ar/i.test(x.lang)); u.voice = v.find(x => /EG/i.test(x.lang)) || v[0] || null;
            curRes = res; u.onend = u.onerror = () => { curRes = null; res(); }; speechSynthesis.speak(u); });
        } else toast("الصوت غير متاح دلوقتي", "bad");
        break;
      }
      await playUrl(url, my); if (my !== spkId) return;
    }
    if (my === spkId) { if (sayEl) sayEl.classList.remove("say"); sayEl = null; setState("ready"); }
  }

  /* ---------- الصوت: الاستماع ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false;
  if (!SR) micB.classList.add("na");
  function stopListen() { if (rec) { try { rec.stop(); } catch (e) {} } }
  micB.onclick = () => {
    if (!SR) { toast("المتصفح أو التطبيق ده مش بيدعم الميكروفون. اكتب رسالتك، أو افتح البرنامج من Chrome.", "bad"); return; }
    if (listening) { stopListen(); return; }
    stopSpeak(); rec = new SR(); rec.lang = "ar-EG"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
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
  let busy = false;
  const grow = () => { input.style.height = "auto"; input.style.height = Math.min(110, input.scrollHeight) + "px"; };
  input.addEventListener("input", grow);
  input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && innerWidth >= 600) { e.preventDefault(); $("mai-form").requestSubmit(); } });
  const allowed = p => p.g === "any" || (p.g === "sec" && canSee(p.f)) || (p.g === "rep" && canReports()) || (p.g === "admin" && ME.role === "admin");
  function say(text, o) { const d = bubble("bot", text, o); remember("b", text, o && o.meta); if (cfg.voice) speak(text, d); return d; }

  async function ask(q, ctx) {
    q = q.trim(); if (!q || busy) return;
    stopSpeak(); input.value = ""; grow();
    if (!(ctx && ctx.silentUser)) { bubble("user", q); remember("u", q); }
    // 1) أوامر الفتح محلية (بدون استهلاك من حد الاستخدام) وبحسب الصلاحية
    const nav = C.parseNav(q);
    if (nav) {
      if (!allowed(nav.page)) { say("معلش، حسابك مالهوش صلاحية يفتح " + nav.page.n + "."); setState("error", "مش مسموح"); return; }
      if (nav.page.f === PAGE && !nav.rest) { say("إنت فعلًا في " + nav.page.n + "."); return; }
      if (nav.rest) { try { sessionStorage.setItem("masai_pending", JSON.stringify({ u: ME.id, q: nav.rest, sec: C.SEC_OF[nav.page.f] || null })); } catch (e) {} }
      if (nav.page.f === PAGE) { if (nav.rest) { try { sessionStorage.removeItem("masai_pending"); } catch (e) {} return ask(nav.rest, { sec: C.SEC_OF[PAGE] || null, silentUser: true }); } return; }
      say("حاضر، بفتحلك " + nav.page.n + (nav.rest ? " وأجيبلك المطلوب" : "") + "…");
      cfg.open = true; saveCfg(); setTimeout(() => { location.href = nav.page.f; }, cfg.voice ? 1400 : 500); return;
    }
    // 2) سؤال للذكاء الاصطناعي: القسم من الكلام أو من الصفحة الحالية، والفترة من الكلام
    busy = true; sendB.disabled = true; setState("thinking");
    const body = { action: "ask", question: q };
    const sec = C.detectSection(q) || (ctx && ctx.sec) || C.SEC_OF[PAGE] || null; if (sec) body.sections = [sec];
    const per = C.parsePeriod(q, today()); if (per) { body.from = per.from; body.to = per.to; }
    const wait = bubble("bot", "ثانية واحدة أراجع البيانات…", { plain: true });
    const r = await masAi(body);
    busy = false; sendB.disabled = false;
    if (!r.ok) {
      wait.textContent = r.msg; setState("error", r.msg);
      const b = document.createElement("button"); b.type = "button"; b.className = "retry"; b.textContent = "إعادة المحاولة";
      b.onclick = () => { wait.remove(); busy = false; ask(q, Object.assign({}, ctx, { silentUser: true })); }; wait.appendChild(document.createElement("br")); wait.appendChild(b); remember("b", r.msg); scroll(); return;
    }
    const PN = { gemini: "Gemini", groq: "Groq" };
    const meta = "المحرك: " + (PN[r.data.provider] || r.data.provider) + (r.data.failover ? " (تحويل تلقائي)" : "") + " · " + r.data.period.from + " ← " + r.data.period.to + (sec ? " · " + (SEC_AR[sec] || sec) : "");
    const pctx = { q, period: r.data.period, section: sec };
    wait.innerHTML = md(r.data.answer); const s = document.createElement("small"); s.className = "meta"; s.textContent = meta; wait.appendChild(s); addPrint(wait, r.data.answer, pctx);
    remember("b", r.data.answer, meta, pctx); scroll(); setState("done");
    if (!panel.classList.contains("open")) orb.classList.add("unread");
    if (cfg.voice) speak(r.data.answer, wait);
  }
  $("mai-form").addEventListener("submit", e => { e.preventDefault(); ask(input.value); });
  $("mai-clr").onclick = async () => { if (!(await ask_confirm())) return; hist = []; saveHist(); msgs.innerHTML = ""; greet(); };
  const ask_confirm = () => (typeof window.ask === "function" ? window.ask("تمسح المحادثة؟", "نعم، امسح") : Promise.resolve(confirm("تمسح المحادثة؟")));
  window.addEventListener("online", () => { if (state === "error") setState("ready"); });
  window.addEventListener("offline", () => setState("error", "مفيش اتصال بالإنترنت"));
  addEventListener("pagehide", stopSpeak);

  function greet() { const d = bubble("bot", "حاضر، أنا ماسي. اسألني عن الإنتاج والهالك والأقسام، أو قول «افتح قسم الحريق واعرض إنتاج النهارده». اضغط الميكروفون وكلّمني بالمصري.", { plain: true }); return d; }
  /* ---------- تشغيل ---------- */
  if (hist.length) hist.forEach(h => { if (h.r === "u") bubble("user", h.t); else bubble("bot", h.t, { meta: h.m, ctx: h.c }); }); else greet();
  setState("ready"); layout();
  if (cfg.open) toggle(true);
  try { // أمر معلّق بعد فتح صفحة (مثلاً: افتح الحريق واعرض إنتاج النهارده)
    const p = JSON.parse(sessionStorage.getItem("masai_pending") || "null"); sessionStorage.removeItem("masai_pending");
    if (p && p.u === ME.id && p.q) { toggle(true); setTimeout(() => ask(p.q, { sec: p.sec }), 400); }
  } catch (e) {}
})();
