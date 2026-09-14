// KINTRACK Desktop - Electron main process
const { app, BrowserWindow, shell, Menu, dialog, ipcMain, net } = require("electron");
const path = require("path");
const log = require("electron-log");
const { startServer } = require("./static-server");
const { WindowState } = require("./window-state");

// ---------------- Logging ----------------
log.transports.file.level = "info";
log.transports.file.fileName = "kintrack.log";
log.initialize?.();
log.info(`KINTRACK starting v${app.getVersion()} on ${process.platform}`);

const isDev = process.env.KINTRACK_DEV === "1" || !app.isPackaged;
const DEV_URL = process.env.KINTRACK_DEV_URL || "http://localhost:3000";
// Remote backend (HTTPS). The bundled UI reads this from its build-time env; this
// is used only for a startup connectivity check and to allow-list navigation.
const BACKEND_ORIGIN = "https://kpi-pengadilan.preview.emergentagent.com";

let mainWindow = null;
let server = null;
let baseUrl = null;

// ---------------- Global error handling ----------------
process.on("uncaughtException", (err) => {
  log.error("uncaughtException:", err);
});
process.on("unhandledRejection", (reason) => {
  log.error("unhandledRejection:", reason);
});

// ---------------- Single instance ----------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

async function checkBackend() {
  return new Promise((resolve) => {
    try {
      const request = net.request({ method: "HEAD", url: BACKEND_ORIGIN + "/api/" });
      const timer = setTimeout(() => { try { request.abort(); } catch (_) {} resolve(false); }, 6000);
      request.on("response", () => { clearTimeout(timer); resolve(true); });
      request.on("error", () => { clearTimeout(timer); resolve(false); });
      request.end();
    } catch (_) {
      resolve(false);
    }
  });
}

async function createWindow() {
  const winState = new WindowState({
    file: path.join(app.getPath("userData"), "window-state.json"),
    defaultWidth: 1440,
    defaultHeight: 900,
  });

  mainWindow = new BrowserWindow({
    x: winState.x,
    y: winState.y,
    width: winState.width,
    height: winState.height,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: "#0F4C3A",
    title: "KINTRACK",
    icon: path.join(__dirname, "build", process.platform === "win32" ? "icon.ico" : "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  winState.manage(mainWindow);

  // Determine URL to load
  const forceLocal = process.env.KINTRACK_SERVE_LOCAL === "1";
  if (isDev && !forceLocal) {
    baseUrl = DEV_URL;
    log.info("DEV mode, loading", baseUrl);
  } else {
    const rendererDir = path.join(__dirname, "renderer");
    server = await startServer(rendererDir);
    baseUrl = `http://127.0.0.1:${server.port}`;
    log.info("Serving bundled renderer at", baseUrl);
  }

  // Startup connectivity notice (non-blocking)
  checkBackend().then((online) => {
    if (!online) {
      log.warn("Backend not reachable at startup");
      if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showMessageBox(mainWindow, {
          type: "warning",
          title: "Koneksi Server",
          message: "Tidak dapat terhubung ke server KINTRACK.",
          detail:
            "Aplikasi tetap berjalan, namun fitur yang membutuhkan data (login, indikator, laporan) memerlukan koneksi internet ke server.\n\nPeriksa koneksi internet Anda lalu coba lagi.",
          buttons: ["OK"],
          noLink: true,
        });
      }
    }
  });

  mainWindow.loadURL(baseUrl);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.on("did-fail-load", (e, code, desc, url) => {
    log.error("did-fail-load", code, desc, url);
  });
  mainWindow.webContents.on("render-process-gone", (e, details) => {
    log.error("render-process-gone", details);
  });

  // Open external links in the default browser; keep in-app navigation local
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1") || url.startsWith(baseUrl)) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowed = url.startsWith(baseUrl) || url.startsWith("http://127.0.0.1") || (isDev && url.startsWith(DEV_URL));
    if (!allowed) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const template = [
    {
      label: "Berkas",
      submenu: [
        { role: "reload", label: "Muat Ulang" },
        { role: "forceReload", label: "Muat Ulang Paksa" },
        { type: "separator" },
        { role: "quit", label: "Keluar" },
      ],
    },
    {
      label: "Tampilan",
      submenu: [
        { role: "resetZoom", label: "Zoom Normal" },
        { role: "zoomIn", label: "Perbesar" },
        { role: "zoomOut", label: "Perkecil" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Layar Penuh" },
      ],
    },
    {
      label: "Bantuan",
      submenu: [
        {
          label: "Buka Folder Log",
          click: () => shell.openPath(path.dirname(log.transports.file.getFile().path)),
        },
        {
          label: "Tentang KINTRACK",
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "Tentang KINTRACK",
              message: "KINTRACK",
              detail: `Sistem Tracking Kinerja PN Sukadana\nVersi ${app.getVersion()}\n\n© 2026 Pengadilan Negeri Sukadana`,
              buttons: ["OK"],
              noLink: true,
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle("app:getInfo", () => ({
  version: app.getVersion(),
  platform: process.platform,
  userData: app.getPath("userData"),
  backend: BACKEND_ORIGIN,
}));

// ---------------- Direct SIPP (MariaDB) access from the LAN desktop app ----------------
let mysql = null;
try { mysql = require("mysql2/promise"); } catch (e) { log.warn("mysql2 unavailable:", e?.message); }

const SIPP_FORBIDDEN = /\b(insert|update|delete|drop|alter|create|truncate|replace|grant|revoke|call|lock|unlock|set|use|load|handler|do|rename)\b/i;

function validateSippQuery(sql) {
  const q = (sql || "").trim().replace(/;$/, "").trim();
  if (!q) throw new Error("Query kosong");
  if (!/^(select|with)\b/i.test(q)) throw new Error("Hanya query SELECT yang diizinkan (baca-saja)");
  if (/;\s*\S/.test(q)) throw new Error("Query ganda tidak diizinkan");
  if (SIPP_FORBIDDEN.test(q)) throw new Error("Query mengandung perintah yang tidak diizinkan (baca-saja)");
  return q;
}

async function sippConnect(cfg) {
  if (!mysql) throw new Error("Driver mysql2 tidak tersedia di aplikasi desktop");
  return mysql.createConnection({
    host: cfg.host, port: Number(cfg.port) || 3306,
    user: cfg.username, password: cfg.password || "", database: cfg.database,
    connectTimeout: 8000,
  });
}

ipcMain.handle("sipp:test", async (_e, cfg) => {
  const conn = await sippConnect(cfg);
  try {
    const [rows] = await conn.query("SELECT VERSION() AS v");
    return { ok: true, server_version: rows[0]?.v || "unknown", mode: "desktop-lan" };
  } finally { await conn.end(); }
});

ipcMain.handle("sipp:query", async (_e, cfg, sql) => {
  const q = validateSippQuery(sql);
  const conn = await sippConnect(cfg);
  try {
    const [rows] = await conn.query(q);
    if (!rows || !rows.length) return null;
    const val = Object.values(rows[0])[0];
    const num = Number(val);
    return Number.isNaN(num) ? val : num;
  } finally { await conn.end(); }
});

app.setAppUserModelId("id.go.pn-sukadana.kintrack");

app.whenReady().then(async () => {
  buildMenu();
  await createWindow();

  // Prepare for future auto-update (safe no-op if no update server configured)
  if (app.isPackaged) {
    try {
      const { autoUpdater } = require("electron-updater");
      autoUpdater.logger = log;
      autoUpdater.autoDownload = false;
      autoUpdater.on("update-available", (info) => log.info("Update available:", info.version));
      autoUpdater.on("error", (err) => log.warn("Updater error (ignored):", err?.message));
      autoUpdater.checkForUpdates().catch((e) => log.warn("checkForUpdates skipped:", e?.message));
    } catch (e) {
      log.warn("Auto-update not initialized:", e?.message);
    }
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (server && server.close) server.close();
  if (process.platform !== "darwin") app.quit();
});
