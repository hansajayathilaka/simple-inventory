// Inject the backend URL for the renderer so the React app's PB client targets
// the local sidecar. This is the single seam to repoint at a LAN server later.
const { contextBridge } = require("electron");

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";

// window.__PB_URL__ is read by frontend/src/lib/pocketbase.ts
contextBridge.exposeInMainWorld("__PB_URL__", PB_URL);
