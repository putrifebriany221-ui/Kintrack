"""Idempotent seed of master/configuration data: roles, categories, reporting
periods, responsible officers, data sources, business rules and the 17 indicators.
The 17 indicators are stored as CONFIGURABLE records (not hard-coded logic)."""
from db import db, new_id, now_iso
from auth import hash_password, SUPER_ADMIN
import os

CATEGORIES = [
    {"code": "KEPANITERAAN", "name": "Kepaniteraan", "description": "Indikator terkait penanganan dan penyelesaian perkara"},
    {"code": "PELAYANAN", "name": "Pelayanan Publik", "description": "Indikator kualitas layanan kepada masyarakat"},
    {"code": "KESEKRETARIATAN", "name": "Kesekretariatan", "description": "Indikator kepegawaian, keuangan, dan perencanaan"},
    {"code": "ASET", "name": "Manajemen Aset", "description": "Indikator pengelolaan Barang Milik Negara"},
]

SURVEY_QUESTIONS = [
    "Persyaratan", "Sistem, mekanisme dan prosedur", "Waktu penyelesaian",
    "Biaya/tarif", "Produk/spesifikasi pelayanan", "Kompetensi pelaksana",
    "Perilaku pelaksana", "Penanganan pengaduan/saran/masukan", "Sarana dan prasarana",
]

# --- The 17 indicators as configurable master records ---
def _pct(code, name, short, num, den, target, cat, freq="Triwulanan", extra=None):
    d = {
        "indicator_code": code, "indicator_name": name, "short_name": short,
        "description": name, "objective": f"Mengukur {name.lower()}",
        "category_code": cat, "indicator_type": "Percentage", "calculation_type": "percentage",
        "formula_description": f"{num} / {den} × 100%",
        "numerator_definition": num, "denominator_definition": den,
        "unit": "%", "target_value": target, "target_operator": ">=",
        "data_source": "SIPP / Manual", "active_status": True,
        "reporting_frequency": freq, "components": [], "allow_numerator_gt_denominator": False,
        "notes": "", "config_extra": extra or {},
    }
    return d


def _composite(code, name, short, components, target, cat):
    return {
        "indicator_code": code, "indicator_name": name, "short_name": short,
        "description": name, "objective": f"Mengukur {name.lower()}",
        "category_code": cat, "indicator_type": "Composite Index", "calculation_type": "composite",
        "formula_description": " + ".join([f"({c['name']} × {c['weight']}%)" for c in components]),
        "numerator_definition": "", "denominator_definition": "",
        "unit": "Indeks", "target_value": target, "target_operator": ">=",
        "data_source": "Manual / Integrasi", "active_status": True,
        "reporting_frequency": "Tahunan", "components": components,
        "allow_override_final": False, "notes": "", "config_extra": {},
    }


INDICATORS = [
    _pct("1.1", "Penyelesaian Perkara Tepat Waktu", "Perkara Tepat Waktu",
         "Jumlah perkara yang diselesaikan tepat waktu",
         "Jumlah perkara yang harus diselesaikan (sisa awal tahun + perkara masuk)",
         90, "KEPANITERAAN"),
    _pct("1.2", "Salinan Putusan Tepat Waktu", "Salinan Putusan",
         "Jumlah salinan putusan yang dikirim tepat waktu kepada para pihak",
         "Jumlah perkara yang diputus", 100, "KEPANITERAAN",
         extra={"delivery_methods": ["Jurusita", "Elektronik", "Pos Tercatat / Pihak Ketiga"],
                "date_fields": ["tanggal_putusan", "tanggal_pengiriman", "tanggal_terima", "batas_waktu"]}),
    _pct("1.3", "Pemberitahuan Petikan/Amar Putusan Tk. Banding, Kasasi dan PK Tepat Waktu", "Pemberitahuan Amar",
         "Jumlah pemberitahuan petikan/amar putusan yang tepat waktu",
         "Jumlah petikan/amar putusan yang diterima pengadilan pengaju", 100, "KEPANITERAAN",
         extra={"case_types": ["Perdata", "Pidana"], "delivery_methods": ["Konvensional", "Elektronik", "Pos Tercatat", "Pihak Ketiga"]}),
    _pct("1.4", "Pengiriman Salinan Putusan Pidana Tk. Banding, Kasasi, PK", "Kirim Salinan Pidana",
         "Jumlah salinan putusan yang dikirimkan tepat waktu",
         "Jumlah salinan putusan banding/kasasi/PK yang diterima pengadilan pengaju", 100, "KEPANITERAAN",
         extra={"delivery_methods": ["Jurusita", "Elektronik", "Pos Tercatat", "Pihak Ketiga"]}),
    _pct("1.5", "Putusan Diunggah ke Direktori Putusan", "Direktori Putusan",
         "Jumlah putusan yang diunggah ke Direktori Putusan",
         "Jumlah putusan yang telah diminutasi", 95, "KEPANITERAAN",
         extra={"date_fields": ["tanggal_putusan", "tanggal_minutasi", "tanggal_upload"]}),
    _pct("1.6", "Penyelesaian Permohonan Eksekusi", "Permohonan Eksekusi",
         "Jumlah permohonan eksekusi yang diselesaikan (eksekusi berhasil / dicabut / dicoret / non-eksekutabel)",
         "Jumlah putusan perdata yang dimohonkan eksekusi", 75, "KEPANITERAAN",
         extra={"completion_types": ["Eksekusi Berhasil", "Dicabut", "Dicoret dari Register", "Non-Eksekutabel"]}),
    _pct("1.7", "Keadilan Restoratif", "Keadilan Restoratif",
         "Jumlah perkara yang berhasil diselesaikan melalui pendekatan keadilan restoratif",
         "Jumlah perkara yang memenuhi kriteria penerapan keadilan restoratif", 100, "KEPANITERAAN",
         extra={"eligibility_rule": "RESTORATIVE_JUSTICE"}),
    _pct("1.8", "Keberhasilan Mediasi", "Keberhasilan Mediasi",
         "Jumlah perkara yang berhasil diselesaikan melalui mediasi (akta perdamaian / sebagian)",
         "Jumlah perkara yang wajib dilakukan mediasi", 5, "KEPANITERAAN",
         extra={"mediator_types": ["Hakim Mediator", "Non-Hakim Mediator"],
                "settlement_types": ["Berhasil Penuh", "Berhasil Sebagian"]}),
    _pct("1.9", "Keberhasilan Diversi", "Keberhasilan Diversi",
         "Jumlah perkara anak yang berhasil diselesaikan melalui diversi",
         "Jumlah perkara anak yang telah selesai proses diversi", 100, "KEPANITERAAN",
         extra={"eligibility_rule": "DIVERSI", "requires_court_determination": True}),
    _pct("1.10", "Perkara Perdata Menggunakan e-Court", "Perdata e-Court",
         "Jumlah perkara perdata tingkat pertama yang diajukan menggunakan e-Court",
         "Jumlah seluruh perkara perdata tingkat pertama yang diajukan", 90, "PELAYANAN",
         extra={"filing_methods": ["e-Court", "Konvensional"]}),
    _pct("1.11", "Pelimpahan Perkara Pidana Secara Elektronik", "Pelimpahan Elektronik",
         "Jumlah perkara pidana yang dilimpahkan secara elektronik",
         "Jumlah perkara pidana yang dilimpahkan", 90, "PELAYANAN",
         extra={"methods": ["e-Berpadu", "Konvensional"]}),
    _pct("1.12", "Layanan Perkara Pidana Secara Elektronik", "Layanan Pidana Elektronik",
         "Jumlah layanan perkara pidana yang diajukan secara elektronik",
         "Jumlah seluruh layanan perkara pidana", 90, "PELAYANAN",
         extra={"service_types": ["Pelimpahan Perkara", "Penyitaan", "Penggeledahan", "Perpanjangan Penahanan"]}),
    {
        "indicator_code": "1.13",
        "indicator_name": "Indeks Kepuasan Pengguna Layanan Pengadilan",
        "short_name": "Indeks Kepuasan (SKM)",
        "description": "Indeks Kepuasan Pengguna Layanan Pengadilan berdasarkan standar layanan yang ditetapkan",
        "objective": "Mengukur kepuasan masyarakat terhadap layanan pengadilan",
        "category_code": "PELAYANAN", "indicator_type": "Survey Index", "calculation_type": "survey",
        "formula_description": "Rata-rata skor unsur layanan (skala 1-4) / manual",
        "numerator_definition": "", "denominator_definition": "",
        "unit": "Indeks", "target_value": 3.2, "target_operator": ">=",
        "data_source": "Aplikasi Survei / Manual", "active_status": True,
        "reporting_frequency": "Semesteran", "components": [],
        "config_extra": {
            "survey_elements": SURVEY_QUESTIONS,
            "service_categories": ["Posbakum", "Sidang di Luar Gedung", "Prodeo",
                                    "Perempuan Berhadapan dengan Hukum", "Penyandang Disabilitas"],
            "scale": "1-4",
        },
        "notes": "",
    },
    _composite("1.14", "IP ASN", "IP ASN", [
        {"name": "Kompetensi", "weight": 40, "group": None},
        {"name": "Kinerja", "weight": 30, "group": None},
        {"name": "Kualifikasi", "weight": 25, "group": None},
        {"name": "Disiplin", "weight": 5, "group": None},
    ], 80, "KESEKRETARIATAN"),
    _composite("1.15", "Indikator Kinerja Pelaksanaan Anggaran (IKPA)", "IKPA", [
        {"name": "Revisi DIPA", "weight": 10, "group": None},
        {"name": "Penyerapan Anggaran", "weight": 20, "group": None},
        {"name": "Penyelesaian Tagihan", "weight": 10, "group": None},
        {"name": "Deviasi Hal. III DIPA", "weight": 15, "group": None},
        {"name": "Belanja Kontraktual", "weight": 10, "group": None},
        {"name": "Pengelolaan UP/TUP", "weight": 10, "group": None},
        {"name": "Capaian Output", "weight": 25, "group": None},
    ], 90, "KESEKRETARIATAN"),
    _composite("1.16", "Nilai Kinerja Perencanaan Anggaran", "Kinerja Perencanaan", [
        {"name": "Capaian Indikator Sasaran Strategis K/L", "weight": 25, "group": "Efektivitas (75%)"},
        {"name": "Agregasi Capaian IKP Unit Eselon I", "weight": 25, "group": "Efektivitas (75%)"},
        {"name": "Agregasi Capaian RO Satker", "weight": 30, "group": "Efektivitas (75%)"},
        {"name": "Agregasi Nilai Efisiensi Satker", "weight": 25, "group": "Efisiensi (25%)"},
    ], 90, "KESEKRETARIATAN"),
    {
        "indicator_code": "1.17",
        "indicator_name": "Nilai Indikator Pengelolaan Aset (IPA)",
        "short_name": "IPA",
        "description": "Indeks Pengelolaan Aset mengukur kualitas tata kelola Barang Milik Negara.",
        "objective": "Mengukur kualitas pengelolaan aset negara pada tahun berjalan",
        "category_code": "ASET", "indicator_type": "Manual Value", "calculation_type": "manual",
        "formula_description": "Nilai indeks dientri manual (persiapan integrasi aplikasi aset)",
        "numerator_definition": "", "denominator_definition": "",
        "unit": "Indeks", "target_value": 80, "target_operator": ">=",
        "data_source": "Manual / Aplikasi Aset", "active_status": True,
        "reporting_frequency": "Tahunan", "components": [],
        "config_extra": {"integration_ready": True}, "notes": "",
    },
]

OFFICERS = [
    {"employee_number": "1980xxxxxx01", "name": "Panitera Muda Perdata", "position": "Panitera Muda Perdata", "unit": "Kepaniteraan Perdata", "email": "perdata@pn-sukadana.go.id", "phone": "0721-000001"},
    {"employee_number": "1980xxxxxx02", "name": "Panitera Muda Pidana", "position": "Panitera Muda Pidana", "unit": "Kepaniteraan Pidana", "email": "pidana@pn-sukadana.go.id", "phone": "0721-000002"},
    {"employee_number": "1980xxxxxx03", "name": "Panitera Muda Hukum", "position": "Panitera Muda Hukum", "unit": "Kepaniteraan Hukum", "email": "hukum@pn-sukadana.go.id", "phone": "0721-000003"},
    {"employee_number": "1980xxxxxx04", "name": "Kepala Sub Bagian Kepegawaian", "position": "Kasubbag Kepegawaian", "unit": "Kesekretariatan", "email": "kepegawaian@pn-sukadana.go.id", "phone": "0721-000004"},
    {"employee_number": "1980xxxxxx05", "name": "Kepala Sub Bagian Keuangan", "position": "Kasubbag Keuangan & Pelaporan", "unit": "Kesekretariatan", "email": "keuangan@pn-sukadana.go.id", "phone": "0721-000005"},
]

DATA_SOURCES = [
    {"code": "SIPP", "name": "SIPP (Sistem Informasi Penelusuran Perkara)", "type": "MariaDB", "read_only": True,
     "description": "Integrasi baca-saja ke basis data SIPP. Tidak mengubah struktur/isi tabel SIPP.", "active": True},
    {"code": "MANUAL", "name": "Input Manual", "type": "internal", "read_only": False,
     "description": "Data dientri manual oleh operator/penanggung jawab.", "active": True},
    {"code": "SURVEI", "name": "Aplikasi Survei", "type": "external", "read_only": True,
     "description": "Persiapan integrasi aplikasi survei kepuasan.", "active": True},
    {"code": "ASET", "name": "Aplikasi Pengelolaan Aset", "type": "external", "read_only": True,
     "description": "Persiapan integrasi aplikasi pengelolaan BMN.", "active": True},
]

BUSINESS_RULES = [
    {"code": "RESTORATIVE_JUSTICE", "name": "Kriteria Keadilan Restoratif",
     "description": "Kriteria kelayakan penerapan keadilan restoratif (dapat dikonfigurasi).",
     "criteria": [
        {"field": "jenis_perkara", "operator": "=", "value": "Pidana"},
        {"field": "ancaman_pidana_maks_tahun", "operator": "<=", "value": 5},
        {"field": "delik_aduan", "operator": "=", "value": True},
        {"field": "perkara_anak", "operator": "=", "value": False},
     ], "active": True},
    {"code": "DIVERSI", "name": "Kriteria Diversi Perkara Anak",
     "description": "Kriteria kelayakan diversi untuk perkara anak.",
     "criteria": [
        {"field": "perkara_anak", "operator": "=", "value": True},
        {"field": "ancaman_pidana_maks_tahun", "operator": "<", "value": 7},
     ], "active": True},
    {"code": "MEDIASI_WAJIB", "name": "Kriteria Perkara Wajib Mediasi",
     "description": "Kriteria perkara perdata yang wajib menempuh mediasi.",
     "criteria": [
        {"field": "jenis_perkara", "operator": "=", "value": "Perdata Gugatan"},
     ], "active": True},
]

# Sample SIPP process IDs reference (read-only mapping helper)
SIPP_PROCESSES = [
    {"proses_id": 10, "proses_nama": "Pendaftaran"},
    {"proses_id": 20, "proses_nama": "Penetapan Majelis Hakim/Hakim"},
    {"proses_id": 80, "proses_nama": "Penetapan Hari Sidang Pertama"},
    {"proses_id": 110, "proses_nama": "Penetapan Mediator"},
    {"proses_id": 121, "proses_nama": "Mulai Mediasi"},
    {"proses_id": 130, "proses_nama": "Kesepakatan Mediasi"},
    {"proses_id": 180, "proses_nama": "Mediasi Berhasil"},
    {"proses_id": 210, "proses_nama": "Putusan"},
    {"proses_id": 218, "proses_nama": "Pemberitahuan Putusan"},
    {"proses_id": 219, "proses_nama": "Kirim Salinan Putusan"},
    {"proses_id": 220, "proses_nama": "Minutasi"},
    {"proses_id": 600, "proses_nama": "Permohonan Eksekusi"},
]


async def seed_all():
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.indicators.create_index("indicator_code", unique=True)
    await db.indicator_calculations.create_index([("indicator_id", 1), ("period_id", 1)])
    await db.indicator_data.create_index([("indicator_id", 1), ("period_id", 1)])
    await db.audit_logs.create_index("timestamp")

    # Admin (owner) super admin
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": new_id(), "email": admin_email, "password_hash": hash_password(admin_password),
            "name": "Administrator PN Sukadana", "role": SUPER_ADMIN, "position": "Super Admin",
            "active": True, "created_at": now_iso(), "updated_at": now_iso(),
        })

    # Categories
    for c in CATEGORIES:
        await db.indicator_categories.update_one(
            {"code": c["code"]},
            {"$setOnInsert": {"id": new_id(), **c, "created_at": now_iso()}}, upsert=True)

    # Reporting periods (2024-2026)
    if await db.reporting_periods.count_documents({}) == 0:
        periods = []
        for year in (2024, 2025, 2026):
            for i, (ptype, name, sm, em) in enumerate([
                ("Triwulanan", "Triwulan I", "01-01", "03-31"),
                ("Triwulanan", "Triwulan II", "04-01", "06-30"),
                ("Triwulanan", "Triwulan III", "07-01", "09-30"),
                ("Triwulanan", "Triwulan IV", "10-01", "12-31"),
                ("Tahunan", "Tahunan", "01-01", "12-31"),
            ]):
                periods.append({
                    "id": new_id(), "year": year, "period_type": ptype,
                    "period_name": f"{name} {year}", "start_date": f"{year}-{sm}",
                    "end_date": f"{year}-{em}", "status": "Open" if year == 2026 else "Locked",
                    "created_at": now_iso(),
                })
        await db.reporting_periods.insert_many(periods)

    # Officers
    for o in OFFICERS:
        await db.responsible_officers.update_one(
            {"employee_number": o["employee_number"]},
            {"$setOnInsert": {"id": new_id(), **o, "active": True, "created_at": now_iso()}}, upsert=True)

    # Data sources
    for s in DATA_SOURCES:
        await db.data_sources.update_one(
            {"code": s["code"]},
            {"$setOnInsert": {"id": new_id(), **s, "created_at": now_iso()}}, upsert=True)

    # Business rules
    for r in BUSINESS_RULES:
        await db.business_rules.update_one(
            {"code": r["code"]},
            {"$setOnInsert": {"id": new_id(), **r, "created_at": now_iso()}}, upsert=True)

    # Survey questions
    if await db.survey_questions.count_documents({}) == 0:
        await db.survey_questions.insert_many([
            {"id": new_id(), "code": f"U{i+1}", "label": q, "order": i + 1, "active": True}
            for i, q in enumerate(SURVEY_QUESTIONS)
        ])

    # SIPP process reference
    if await db.sipp_processes.count_documents({}) == 0:
        await db.sipp_processes.insert_many([{"id": new_id(), **p} for p in SIPP_PROCESSES])

    # System settings
    await db.system_settings.update_one(
        {"key": "app"},
        {"$setOnInsert": {
            "id": new_id(), "key": "app",
            "app_name": "KINTRACK", "institution": "Pengadilan Negeri Sukadana",
            "subtitle": "Sistem Tracking Kinerja PN Sukadana",
            "default_year": 2026, "created_at": now_iso(),
        }}, upsert=True)

    # Indicators + initial formula version. Only definitions, no data values.
    for ind in INDICATORS:
        exists = await db.indicators.find_one({"indicator_code": ind["indicator_code"]})
        if exists:
            continue
        iid = new_id()
        doc = {"id": iid, **ind, "start_period": "2024", "end_period": "",
               "responsible_officer": "", "created_at": now_iso(), "updated_at": now_iso()}
        await db.indicators.insert_one(doc)
        await db.indicator_formula_versions.insert_one({
            "id": new_id(), "indicator_id": iid, "version_number": 1,
            "formula_definition": ind.get("formula_description", ""),
            "calculation_type": ind.get("calculation_type"),
            "components": ind.get("components", []),
            "effective_start_date": "2024-01-01", "effective_end_date": "",
            "active_status": True, "created_by": "system", "created_at": now_iso(),
        })

    # Auto-assign officers by category to indicators (primary)
    cat_officer = {}
    off_list = await db.responsible_officers.find({}).to_list(100)
    for cat, idx in [("KEPANITERAAN", 0), ("PELAYANAN", 2), ("KESEKRETARIATAN", 3), ("ASET", 4)]:
        if idx < len(off_list):
            cat_officer[cat] = off_list[idx]["id"]
    inds = await db.indicators.find({}).to_list(100)
    for ind in inds:
        oid = cat_officer.get(ind.get("category_code"))
        if oid and await db.indicator_responsible_officers.count_documents({"indicator_id": ind["id"]}) == 0:
            await db.indicator_responsible_officers.insert_one({
                "id": new_id(), "indicator_id": ind["id"], "officer_id": oid,
                "responsibility_type": "Primary", "start_date": "2024-01-01",
                "end_date": "", "active_status": True, "created_at": now_iso(),
            })
