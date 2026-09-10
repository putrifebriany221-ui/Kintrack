// Secure preload bridge. Exposes a minimal, read-only API to the renderer.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kintrack", {
  isDesktop: true,
  platform: process.platform,
  getInfo: () => ipcRenderer.invoke("app:getInfo"),
});
