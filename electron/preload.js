// Bridge exposed to the renderer (React app).
//  - window.__PB_URL__ : backend URL for the PB client (single repoint seam)
//  - window.desktop    : OS printer enumeration + silent printing
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "__PB_URL__",
  process.env.PB_URL || "http://127.0.0.1:8090"
);

contextBridge.exposeInMainWorld("desktop", {
  getPrinters: () => ipcRenderer.invoke("desktop:get-printers"),
  printHTML: (html, options) => ipcRenderer.invoke("desktop:print-html", html, options),
});
