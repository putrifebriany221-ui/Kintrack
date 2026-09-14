// Secure preload bridge. Exposes a minimal API to the renderer.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kintrack", {
  isDesktop: true,
  platform: process.platform,
  getInfo: () => ipcRenderer.invoke("app:getInfo"),
  // Direct LAN access to SIPP MariaDB from this machine (the cloud server
  // cannot reach private addresses like 10.x.x.x). Admin-provided config only.
  sippTest: (cfg) => ipcRenderer.invoke("sipp:test", cfg),
  sippQuery: (cfg, sql) => ipcRenderer.invoke("sipp:query", cfg, sql),
});
