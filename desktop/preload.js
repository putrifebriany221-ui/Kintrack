// Secure preload bridge. Exposes a minimal, whitelisted API to the renderer.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kintrack", {
  isDesktop: true,
  platform: process.platform,
  getInfo: () => ipcRenderer.invoke("app:getInfo"),
  // Runtime server URL configuration (stored in userData, no secrets)
  getApiUrl: () => ipcRenderer.invoke("config:get-api-url"),
  setApiUrl: (url) => ipcRenderer.invoke("config:set-api-url", url),
  testApiUrl: (url) => ipcRenderer.invoke("config:test-api-url", url),
  openLogFolder: () => ipcRenderer.invoke("app:open-logs"),
  onOpenSettings: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("kintrack:open-settings", listener);
    return () => ipcRenderer.removeListener("kintrack:open-settings", listener);
  },
  // Direct LAN access to SIPP MariaDB from this machine (the cloud server
  // cannot reach private addresses like 10.x.x.x). Admin-provided config only.
  sippTest: (cfg) => ipcRenderer.invoke("sipp:test", cfg),
  sippQuery: (cfg, sql) => ipcRenderer.invoke("sipp:query", cfg, sql),
});
