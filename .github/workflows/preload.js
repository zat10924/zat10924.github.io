// preload.js — بيعرّض للموقع أوامر التحكم في النافذة (تصغير/تكبير/إغلاق) من غير ما يديه صلاحيات Node.
// بيشتغل في النافذة الرئيسية فقط، فنوافذ الطباعة والتقارير (اللي بتفتح بإطار عادي) ما بيظهرش فيها شريط عنوان ثاني.
const { contextBridge, ipcRenderer } = require("electron");

let isMain = false;
try { isMain = ipcRenderer.sendSync("mas:isMain") === true; } catch (e) {}

if (isMain) {
  contextBridge.exposeInMainWorld("masWin", {
    minimize: () => ipcRenderer.send("mas:min"),
    toggleMaximize: () => ipcRenderer.send("mas:max"),
    close: () => ipcRenderer.send("mas:close"),
    getState: () => ipcRenderer.invoke("mas:getState"),
    onState: cb => { ipcRenderer.on("mas:state", (_e, s) => { try { cb(s); } catch (e) {} }); },
  });
}
