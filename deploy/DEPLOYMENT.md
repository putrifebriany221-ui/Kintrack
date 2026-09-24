# KINTRACK — Production Deployment (Apache + FastAPI + React + MariaDB)

Self-hosted, independent of Emergent. Runs after server reboot; survives Emergent/browser being closed.

## Layout
```
/opt/kintrack/
├── backend/            # FastAPI app (server.py, .env, engine.py, formula.py, sipp.py ...)
├── venv/               # Python virtualenv
├── frontend/build/     # React production build (served by Apache)
└── ...
/var/log/kintrack/      # backend logs
```

## 1. Application database (MariaDB)
Create a dedicated app DB, separate from SIPP:
```sql
CREATE DATABASE sukadana_kinerja CHARACTER SET utf8mb4;
CREATE USER 'kintrack'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON sukadana_kinerja.* TO 'kintrack'@'localhost';
-- SIPP read-only user (on the SIPP server), used only for SELECT:
-- GRANT SELECT ON sipp.* TO 'readonly_user'@'%';
```
> The app NEVER writes to `sipp`. Application backups cover `sukadana_kinerja` only.

## 2. Backend as a persistent service (systemd)
```bash
sudo useradd -r -s /usr/sbin/nologin kintrack
sudo mkdir -p /opt/kintrack /var/log/kintrack
# copy backend to /opt/kintrack/backend, create venv:
python3 -m venv /opt/kintrack/venv
/opt/kintrack/venv/bin/pip install -r /opt/kintrack/backend/requirements.txt
cp /opt/kintrack/backend/.env.example /opt/kintrack/backend/.env   # then edit real values
sudo cp deploy/sukadana-kinerja.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sukadana-kinerja
sudo systemctl status sukadana-kinerja
```
- Starts on boot, auto-restarts on crash, logs to `/var/log/kintrack/`, no terminal needed.
- FastAPI listens on `127.0.0.1:8001` (not exposed publicly; Apache proxies `/api`).

## 3. Frontend production build
```bash
cd frontend
# IMPORTANT: in production the API is same-origin under /api (Apache proxies it).
echo 'REACT_APP_BACKEND_URL=' > .env.production   # empty -> calls "/api" same-origin
yarn install && yarn build
sudo cp -r build /opt/kintrack/frontend/
```
> No `npm start` in production. No localhost/preview URLs hardcoded — the app calls `/api` on the same domain.

## 4. Apache
```bash
sudo a2enmod proxy proxy_http headers rewrite ssl
sudo cp deploy/apache-kintrack.conf /etc/apache2/sites-available/kintrack.conf
sudo a2ensite kintrack && sudo systemctl reload apache2
```
Apache serves `frontend/build` and reverse-proxies `/api` → `127.0.0.1:8001`.

## 5. Health check
`GET https://kinerja.pn-sukadana.go.id/api/health` →
```json
{ "application": "ok", "database": "ok", "sipp": "ok", "version": "1.0.0", "server_time": "..." }
```

## 6. Environment variables
See `backend/.env.example`. Set real values in `/opt/kintrack/backend/.env`
(`JWT_SECRET`, `DB_NAME`, `SIPP_DB_*`, `CORS_ORIGINS`, `APP_ENV=production`). Never commit `.env`.

## 7. Backup / recovery
```bash
# Application data ONLY (never SIPP):
mysqldump sukadana_kinerja > /backup/sukadana_kinerja_$(date +%F).sql
# (Mongo preview:) mongodump --db sukadana_kinerja --out /backup/mongo_$(date +%F)
```

## 8. Logs
- Backend: `/var/log/kintrack/backend.log`, `backend.error.log`
- Apache: `/var/log/apache2/kintrack_{access,error}.log`
- In-app: authentication/SIPP/calculation events recorded via the Audit Log module.

## 9. Restart after reboot
`systemctl enable` (done above) makes the backend start automatically; Apache is enabled by default. Verify with `curl -s localhost/api/health`.

## Notes on the Emergent preview
The Emergent preview URL is for development only. Production uses your own domain + this
Apache/systemd setup and does not depend on Emergent in any way.
