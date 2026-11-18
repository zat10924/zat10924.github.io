// main.js — نافذة MAS Manager بدون إطار ويندوز (شريط العنوان بيترسم من الموقع نفسه).
const { app, BrowserWindow, ipcMain, shell, Menu, screen } = require("electron");
const path = require("path");
const fs = require("fs");

// ⚠️ غيّر الرابط ده لو عنوان الموقع عندك مختلف
const APP_URL = "https://zat10924.github.io/index.html";
const APP_ORIGIN = new URL(APP_URL).origin;

app.setAppUserModelId("com.mas.manager"); // لازم يطابق appId في إعدادات البناء عشان إشعارات ويندوز

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let win = null;
  const stateFile = () => path.join(app.getPath("userData"), "window-state.json");
  const loadState = () => { try { return JSON.parse(fs.readFileSync(stateFile(), "utf8")); } catch (e) { return {}; } };
  let saveTimer = null;
  const saveState = () => {
    if (!win || win.isDestroyed()) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const b = win.isMaximized() || win.isFullScreen() ? (loadState().bounds || null) : win.getBounds();
        fs.writeFileSync(stateFile(), JSON.stringify({ bounds: b, max: win.isMaximized(), zoom: win.webContents.getZoomLevel() }));
      } catch (e) {}
    }, 400);
  };
  const visibleOnSomeDisplay = b => !!b && screen.getAllDisplays().some(d => {
    const a = d.workArea;
    return b.x < a.x + a.width - 40 && b.x + b.width > a.x + 40 && b.y < a.y + a.height - 40 && b.y + b.height > a.y + 20;
  });
  const sendState = () => {
    if (win && !win.isDestroyed()) win.webContents.send("mas:state", { max: win.isMaximized(), full: win.isFullScreen() });
  };

  const OFFLINE_PAGE = "data:text/html;charset=utf-8," + encodeURIComponent(
    '<html dir="rtl"><body style="margin:0;height:100vh;display:grid;place-items:center;background:#421B24;color:#F4E3A8;font:600 18px Tahoma,sans-serif;text-align:center">' +
    '<div>مفيش اتصال بالإنترنت<br><small style="opacity:.75">بحاول أتصل تاني تلقائي…</small></div>' +
    '<script>setTimeout(()=>location.href=' + JSON.stringify(APP_URL) + ',5000)</script></body></html>');

  function createWindow() {
    const st = loadState();
    const useBounds = visibleOnSomeDisplay(st.bounds) ? st.bounds : {};
    win = new BrowserWindow({
      width: 1366, height: 820, minWidth: 1024, minHeight: 640, ...useBounds,
      frame: false, show: false, autoHideMenuBar: true, backgroundColor: "#421B24",
      title: "MAS Manager",
      icon: fs.existsSync(path.join(__dirname, "icon.ico")) ? path.join(__dirname, "icon.ico") : undefined,
      webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
    });
    if (typeof st.zoom === "number") win.webContents.setZoomLevel(Math.max(-3, Math.min(3, st.zoom)));
    win.once("ready-to-show", () => { if (st.max) win.maximize(); win.show(); sendState(); });
    win.loadURL(APP_URL);

    win.on("maximize", sendState); win.on("unmaximize", sendState);
    win.on("enter-full-screen", sendState); win.on("leave-full-screen", sendState);
    win.on("resize", saveState); win.on("move", saveState); win.on("close", saveState);
    win.on("closed", () => { win = null; });

    // فشل التحميل (مفيش نت): صفحة بسيطة وإعادة محاولة كل 5 ثواني
    win.webContents.on("did-fail-load", (_e, code, _d, url, isMainFrame) => {
      if (isMainFrame && code !== -3 && url && url.startsWith("http")) win.loadURL(OFFLINE_PAGE);
    });

    // الروابط الخارجية تفتح في المتصفح. نوافذ الموقع نفسه (طباعة/تقارير) تفتح بإطار ويندوز عادي.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url === "about:blank" || url.startsWith(APP_ORIGIN)) {
        return { action: "allow", overrideBrowserWindowOptions: { frame: true, autoHideMenuBar: true, width: 1000, height: 800, backgroundColor: "#ffffff" } };
      }
      if (/^(https?:|mailto:|tel:)/i.test(url)) shell.openExternal(url);
      return { action: "deny" };
    });
    win.webContents.on("will-navigate", (e, url) => {
      if (url.startsWith(APP_ORIGIN) || url.startsWith("data:")) return;
      e.preventDefault();
      if (/^(https?:|mailto:|tel:)/i.test(url)) shell.openExternal(url);
    });

    // اختصارات (القائمة مخفية فالاختصارات دي بتتعمل يدويًا)
    win.webContents.on("before-input-event", (e, i) => {
      if (i.type !== "keyDown") return;
      const wc = win.webContents, ctrl = i.control || i.meta;
      const zoom = d => { wc.setZoomLevel(Math.max(-3, Math.min(3, wc.getZoomLevel() + d))); saveState(); };
      if (i.key === "F11") { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
      else if (i.key === "F12" || (ctrl && i.shift && i.key.toLowerCase() === "i")) { e.preventDefault(); wc.toggleDevTools(); }
      else if (i.key === "F5" || (ctrl && !i.shift && i.key.toLowerCase() === "r")) { e.preventDefault(); wc.reload(); }
      else if (ctrl && i.shift && i.key.toLowerCase() === "r") { e.preventDefault(); wc.reloadIgnoringCache(); }
      else if (ctrl && (i.key === "=" || i.key === "+")) { e.preventDefault(); zoom(0.5); }
      else if (ctrl && i.key === "-") { e.preventDefault(); zoom(-0.5); }
      else if (ctrl && i.key === "0") { e.preventDefault(); wc.setZoomLevel(0); saveState(); }
      else if (i.key === "Escape" && win.isFullScreen()) { win.setFullScreen(false); }
    });
  }

  // أوامر شريط العنوان
  const fromEvent = e => BrowserWindow.fromWebContents(e.sender);
  ipcMain.on("mas:isMain", e => { e.returnValue = !!win && e.sender === win.webContents; });
  ipcMain.on("mas:min", e => { const w = fromEvent(e); if (w) w.minimize(); });
  ipcMain.on("mas:max", e => { const w = fromEvent(e); if (w) (w.isMaximized() ? w.unmaximize() : w.maximize()); });
  ipcMain.on("mas:close", e => { const w = fromEvent(e); if (w) w.close(); });
  ipcMain.handle("mas:getState", e => { const w = fromEvent(e); return { max: !!w && w.isMaximized(), full: !!w && w.isFullScreen() }; });

  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { Menu.setApplicationMenu(null); createWindow(); });
  app.on("window-all-closed", () => app.quit());
}
