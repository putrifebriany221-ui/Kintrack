# Panduan Build Aplikasi Windows 11 — Monitoring dan Pelaporan Kinerja PN Sukadana

Dokumen ini menjelaskan cara membangun installer Windows (`Sukadana-Kinerja-Setup.exe`)
di komputer Windows 11, tanpa bergantung pada lingkungan Emergent.

## Prasyarat

1. **Node.js LTS (>= 18)** — unduh dari https://nodejs.org dan instal.
2. **Yarn** — setelah Node.js terinstal, jalankan di Command Prompt / PowerShell:
   ```
   npm install -g yarn
   ```
3. Salin seluruh folder project (folder `frontend/` dan `desktop/`) ke komputer Windows.
   Tidak perlu Python, tidak perlu backend lokal — backend produksi berjalan di server PN Sukadana.

## Langkah Build

Buka Command Prompt / PowerShell di folder `desktop/`:

```
cd desktop
yarn install
yarn build
yarn dist:win:installer
```

Keterangan perintah:

| Perintah | Fungsi |
|---|---|
| `yarn install` | Instal dependensi Electron & electron-builder |
| `yarn build` | Build React frontend (production) lalu salin ke `desktop/renderer/` |
| `yarn dev` | Menjalankan aplikasi desktop dalam mode development (memuat `localhost:3000`) |
| `yarn dist:win` | Membuat installer NSIS **dan** versi portable |
| `yarn dist:win:installer` | Membuat installer NSIS saja |

## Hasil Build (folder `desktop/dist/`)

| File | Keterangan |
|---|---|
| `Sukadana-Kinerja-Setup-1.0.0.exe` | Installer NSIS (install ke komputer user, membuat shortcut Start Menu & Desktop, mendukung uninstall) |
| `Sukadana-Kinerja-1.0.0-Portable.exe` | Versi portable (langsung jalan tanpa instalasi) — dibuat oleh `yarn dist:win` |
| `win-unpacked/` | Hasil build mentah (folder aplikasi, untuk pengujian lokal) |

## Cara Instal (Pengguna)

1. Klik dua kali `Sukadana-Kinerja-Setup-1.0.0.exe`.
2. Ikuti wizard instalasi (bisa memilih folder instalasi).
3. Buka aplikasi dari **Start Menu** atau shortcut **Desktop** bernama "KINTRACK PN Sukadana".
4. Aplikasi langsung terbuka tanpa browser.

## Cara Konfigurasi Server URL

Saat pertama dijalankan, aplikasi memakai server default `http://localhost:8001/api`.
Untuk mengarahkan ke server PN Sukadana:

1. Buka aplikasi → halaman login → klik **"Pengaturan Server"**
   (atau dari menu aplikasi: **Bantuan → Pengaturan Server**, atau setelah login lewat menu **Server**).
2. Isi **API Server URL**, contoh:
   - `http://192.168.0.149/api` (server lokal kantor)
   - `https://kinerja.pn-sukadana.go.id/api` (domain publik)
3. Klik **Uji Koneksi** untuk memastikan server bisa dihubungi.
4. Klik **Simpan**. Aplikasi akan memuat ulang dan mengingat konfigurasi ini
   (tersimpan di `%APPDATA%\...\kintrack-config.json`, tidak hilang saat update).

Alamat default juga bisa diatur saat build lewat environment variable `KINTRACK_API_URL`.

## Koneksi ke Server PN Sukadana

Arsitektur produksi yang direkomendasikan:

```
Windows Desktop (Electron) → Apache/FastAPI di server PN Sukadana → Database Aplikasi → SIPP MariaDB (READ ONLY)
```

- Kredensial SIPP **tetap di server** (tersimpan di backend, terenkripsi). Aplikasi desktop **tidak** menyimpan kredensial SIPP.
- Semua perhitungan (sinkronisasi SIPP → mesin hitung → realisasi → target → capaian → dashboard) berjalan di backend.
- Panduan instalasi backend di server (systemd + Apache): lihat folder `deploy/DEPLOYMENT.md`.
- Catatan: jembatan SIPP langsung via Electron (mysql2) masih tersedia sebagai **opsi** bila server backend tidak bisa menjangkau database SIPP di LAN — konfigurasi koneksi dimasukkan manual oleh admin dan tidak disimpan permanen di aplikasi.

## Jika Server Tidak Dapat Dihubungi

Aplikasi menampilkan layar "Server tidak dapat dihubungi." berisi alamat server,
status koneksi, tombol **Coba Lagi** dan **Pengaturan** — aplikasi tidak akan crash.
Penyebab yang ditangani: timeout, connection refused, DNS error, server API mati.

Untuk diagnosis lebih lanjut, buka log aplikasi:
- Menu **Bantuan → Buka Folder Log**, atau tombol **Buka Folder Log** di halaman Pengaturan Server.
- Log berisi: startup aplikasi, versi, alamat server, error koneksi/login/API.
- Log **tidak** menyimpan password, kredensial SIPP, atau JWT.

## Update Aplikasi (Versi Baru)

1. Ubah nomor versi di `desktop/package.json` (`"version": "1.0.1"`), lalu build ulang installer.
2. Distribusikan `Sukadana-Kinerja-Setup-1.0.1.exe` ke pengguna — instal di atas versi lama.
3. Konfigurasi server pengguna tetap tersimpan.
4. Arsitektur sudah menyiapkan **auto-update** (electron-updater, provider generic).
   Bila nanti tersedia server update (mis. `https://updates.pn-sukadana.go.id/kintrack/`),
   cukup unggah installer terbaru + file `latest.yml` ke folder tersebut dan aplikasi
   akan mendeteksi versi baru otomatis.
5. Versi aplikasi terlihat di **Pengaturan Server → Tentang Aplikasi** dan menu **Bantuan → Tentang Aplikasi**.

## Struktur Folder Desktop

```
desktop/
├── main.js               # Proses utama Electron (window, menu, IPC, cek koneksi, update)
├── preload.js            # Bridge aman (contextIsolation aktif, nodeIntegration mati)
├── config-store.js       # Penyimpanan API server URL di userData
├── static-server.js      # Server lokal 127.0.0.1 untuk memuat UI React hasil build
├── window-state.js       # Menyimpan ukuran/posisi jendela
├── config.example.json   # Contoh konfigurasi server
├── build/icon.ico        # Ikon aplikasi Windows
├── scripts/
│   ├── build-renderer.js # yarn build frontend + salin ke renderer/
│   ├── copy-renderer.js  # Salin frontend/build ke renderer/
│   └── make-icon.js      # Membuat icon.ico dari icon.png
└── dist/                 # Hasil build installer (setelah yarn dist:win)
```

## Keamanan

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Renderer hanya mengakses API whitelist lewat preload (`window.kintrack`).
- Tidak ada kredensial database/SIPP/JWT di dalam aplikasi desktop.
