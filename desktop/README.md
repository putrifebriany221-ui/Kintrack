# KINTRACK — Windows 11 Desktop (Electron)

This folder turns the **existing** KINTRACK web app (React + FastAPI + MongoDB) into a
real Windows 11 desktop application, **without changing any existing feature**.

- Desktop technology: **Electron** (chosen for full compatibility with the existing
  CRA/React 19 frontend, a mature Windows installer via `electron-builder`/NSIS,
  native window controls, taskbar/Start-Menu/Desktop shortcuts, and an easy path to
  auto-update via `electron-updater`).
- The React UI is **bundled locally** inside the app and served from a loopback
  (`127.0.0.1`) static server, so client-side routing (React Router) keeps working and
  the window is a genuine app — **not** a browser shortcut or PWA.
- The app talks to the **existing remote backend over HTTPS** (`/api/...`). The backend,
  database (MongoDB), authentication (JWT), file storage, reports, and all business logic
  are unchanged.

---

## 1. Architecture

```
┌─────────────────────────── KINTRACK.exe (Electron) ───────────────────────────┐
│  Main process (main.js)                                                        │
│   • Native BrowserWindow (min/max/restore/close, resize, remembered bounds)    │
│   • Local static server (static-server.js) serving ./renderer  (the React build)│
│   • Secure webPreferences: contextIsolation ON, nodeIntegration OFF, sandbox ON │
│   • Logging (electron-log) -> %APPDATA%\KINTRACK\logs\kintrack.log              │
│   • Startup connectivity check + auto-update hook (electron-updater)            │
│                                                                                │
│  Renderer (React UI, unchanged)  ──HTTPS──►  Remote FastAPI backend  ──►  MongoDB
│   window.localStorage (JWT token)               (kpi-pengadilan...)      + Object storage
└────────────────────────────────────────────────────────────────────────────────┘
```

Files:
- `main.js` – Electron main process (window, security, menu, logging, updater, offline notice)
- `preload.js` – secure `window.kintrack` bridge (version/platform/info only)
- `static-server.js` – loopback SPA server (Node built-ins, index.html fallback)
- `window-state.js` – remembers window size/position
- `scripts/copy-renderer.js` – copies `../frontend/build` → `./renderer`
- `scripts/make-icon.js` – generates `build/icon.ico` from `build/icon.png`
- `build/icon.png`, `build/icon.ico` – application icon
- `package.json` → `build` – `electron-builder` config (NSIS installer + portable exe)

---

## 2. Prerequisites (build machine)

- **Windows 10/11 64-bit** (recommended for producing the `.exe` + installer), OR
  Linux/macOS **with Wine** (electron-builder needs Wine to build Windows targets on non-Windows).
- **Node.js 18+** and **npm** (or yarn).

> Note: The `.exe` and `KINTRACK-Setup.exe` **must be built on Windows** (or Linux+Wine).
> They cannot be produced inside the Linux container used to generate this project.

---

## 3. Build commands

From `/app/desktop` (copy this folder + `/app/frontend` to your Windows machine, keeping
the relative layout `.../frontend` and `.../desktop`).

```bash
# 0) Build the existing React app first (only needed once per code change)
cd ../frontend
yarn install
yarn build            # produces ../frontend/build (uses REACT_APP_BACKEND_URL)

# 1) Desktop app deps
cd ../desktop
npm install

# 2) Run locally in a desktop window during development
#    (loads the bundled UI locally; talks to the remote HTTPS backend)
set KINTRACK_SERVE_LOCAL=1   &&  npm start          # Windows CMD
# or point at a live CRA dev server instead:
#   (leave KINTRACK_SERVE_LOCAL unset) npm start  -> loads http://localhost:3000

# 3) Produce the Windows installer + portable exe
npm run dist:win
```

`npm run dist:win` runs `copy-renderer` + `make-icon` + `electron-builder --win nsis portable`
and outputs to `dist/`:

| Output | Description |
|---|---|
| `dist/KINTRACK-Setup-1.0.0.exe` | **Windows installer** (NSIS) |
| `dist/KINTRACK-1.0.0-portable.exe` | **Portable single-file** app (no install) |
| `dist/win-unpacked/KINTRACK.exe` | Unpacked application executable |

Only the installer:
```bash
npm run dist:win:installer
```

Development (dev) vs Production:
- **Development**: `npm start` (with `KINTRACK_SERVE_LOCAL=1` to serve the built UI, or leave
  unset to load a running `http://localhost:3000`). `KINTRACK_DEV_URL` overrides the dev URL.
- **Production**: `npm run dist:win` → installers in `dist/`.

---

## 4. Installer behaviour (NSIS)

The generated `KINTRACK-Setup-1.0.0.exe`:
- Installs to a user-selectable folder (per-user by default; elevation optional).
- Creates a **Start Menu** shortcut ("KINTRACK").
- Offers a **Desktop** shortcut.
- Registers the app with Windows (Programs & Features / **Settings → Apps**).
- Provides an **Uninstaller** (uninstall from Settings → Apps, or Start Menu).
- Uses the KINTRACK icon and version; launches after finish.

### Install
1. Double-click `KINTRACK-Setup-1.0.0.exe`.
2. (Optional) choose install folder and whether to create a desktop shortcut.
3. Finish → KINTRACK opens in its own window; also available in Start Menu / taskbar.

### Uninstall
- **Settings → Apps → Installed apps → KINTRACK → Uninstall**, or
- Start Menu → KINTRACK → Uninstall.
- User data in `%APPDATA%\KINTRACK` is preserved (delete manually if desired).

### Reinstall / Update
- Run a newer `KINTRACK-Setup-<version>.exe`; it upgrades in place. User data is kept.

---

## 5. Data storage (Windows)

| Data | Location | Persists? |
|---|---|---|
| App logs | `%APPDATA%\KINTRACK\logs\kintrack.log` | Yes |
| Window size/position | `%APPDATA%\KINTRACK\window-state.json` | Yes |
| Session/login token (JWT) | Electron `localStorage` under `%APPDATA%\KINTRACK` | Yes |
| Cache | `%APPDATA%\KINTRACK\Cache` | Yes (safe to clear) |
| **Business data** (indicators, calculations, users, documents) | **Remote MongoDB + object storage on the server** | Yes (server-side) |

`%APPDATA%` = `C:\Users\<you>\AppData\Roaming`. Nothing important is stored in Temp.
Data is **not** lost when the app closes, Windows restarts, the app is updated, or reopened —
because business data lives on the server and local state is in `%APPDATA%`.

---

## 6. Environment variables & configuration

- **Frontend (build-time)** — set in `../frontend/.env` before `yarn build`:
  - `REACT_APP_BACKEND_URL` — HTTPS backend base URL (currently
    `https://kpi-pengadilan.preview.emergentagent.com`). To point the desktop app at a
    different/production server, change this and rebuild the renderer (`yarn build` then
    `npm run prepare-renderer`).
- **Desktop (runtime)** — optional:
  - `KINTRACK_SERVE_LOCAL=1` — force-serve the bundled UI locally (used in dev/testing).
  - `KINTRACK_DEV=1` / `KINTRACK_DEV_URL` — load a live dev server instead of the bundle.
- **Backend secrets** (`MONGO_URL`, `JWT_SECRET`, `ADMIN_*`, `EMERGENT_LLM_KEY`) stay on the
  server only. **No secrets are bundled in or exposed by the desktop app.**

---

## 7. Security

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- Minimal preload bridge (no filesystem/shell access exposed to the page).
- External links open in the system browser; navigation is restricted to the local origin.
- All server communication is **HTTPS**; passwords are bcrypt-hashed **server-side**; the
  JWT is held only in the renderer session storage. No API keys live in the frontend.
- Single-instance lock prevents multiple copies clobbering state.

---

## 8. Offline behaviour

- The window **still launches without internet** (UI is bundled locally).
- On startup, if the backend is unreachable, a friendly Indonesian dialog appears
  ("Tidak dapat terhubung ke server KINTRACK…").
- Data-dependent features (login, indicators, reports, uploads) require internet to the
  server and show clear error toasts when offline. This app is **server-backed**, so it is
  **not** fully offline — that is stated honestly here.

---

## 9. Auto-update (prepared)

- `electron-updater` is wired in `main.js` (guarded, non-blocking) and a `publish` (generic)
  entry exists in `package.json` (`https://updates.pn-sukadana.go.id/kintrack/`).
- To enable: host the generated `latest.yml` + installer on that URL (or switch provider to
  GitHub/S3), then `electron-builder ... --publish always`. Until then, updates are done by
  running a newer installer. No unnecessary complexity was added now.

---

## 10. Testing checklist (perform on Windows after building)

Startup / shutdown / minimize / maximize / restore / resize (bounds remembered) ·
Taskbar + Start Menu + Desktop shortcut · Login/logout · Role permissions ·
Indicator CRUD · Data entry + calculation · Search/filter · Reports print + Excel(CSV)/PDF ·
File upload/download · Notifications (toasts) · Approval workflow · Audit log ·
Internet disconnect (friendly error) · App restart · Windows restart ·
Install / Uninstall / Reinstall.

Verified in the build environment (Linux): JS integrity, local SPA server (deep links like
`/dashboard` fall back to index.html so React Router works), icon generation, renderer
packaging, and a successful Electron **main-process boot** (log: "Serving bundled renderer…").
The Windows-only steps (installer, shortcuts, taskbar) must be verified on Windows.

---

## 11. Troubleshooting

| Symptom | Fix |
|---|---|
| "frontend build not found" during `dist:win` | Run `yarn build` in `../frontend` first |
| Build fails on non-Windows | Build on Windows, or install **Wine** for electron-builder |
| Blank window | Check `%APPDATA%\KINTRACK\logs\kintrack.log`; ensure `renderer/` was packaged |
| "Tidak dapat terhubung ke server" | Verify internet + `REACT_APP_BACKEND_URL` is reachable over HTTPS |
| Icon not applied | Ensure `build/icon.png` is ≥256×256; rerun `npm run make-icon` |
| SmartScreen warning on first run | Expected for unsigned exe; click "More info → Run anyway", or sign the exe with a code-signing certificate |

---

## 12. Code signing (recommended for distribution)

Unsigned installers trigger Windows SmartScreen. To sign, set env vars before `dist:win`:
`CSC_LINK` (path/base64 of .pfx) and `CSC_KEY_PASSWORD`. electron-builder signs automatically.
