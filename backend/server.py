from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env")

import os
import logging
from typing import Optional, List
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Header, Query, Form
from fastapi.responses import JSONResponse, FileResponse
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

import sipp as sipp_mod
import storage as storage_mod
from db import db, new_id, now_iso, clean, log_audit
from auth import (
    hash_password, verify_password, create_access_token, get_current_user,
    require_roles, can_edit, client_ip, ROLE_LABELS,
    SUPER_ADMIN, ADMIN, OFFICER, VIEWER,
)
from engine import compute, evaluate_status, compute_gap
from seed_data import seed_all

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("kintrack")

app = FastAPI(title="KINTRACK API")
api = APIRouter(prefix="/api")


# ---------------- Models ----------------
class LoginReq(BaseModel):
    email: str
    password: str


class UserReq(BaseModel):
    email: EmailStr
    password: Optional[str] = None
    name: str
    role: str
    position: Optional[str] = ""
    active: bool = True


class OfficerReq(BaseModel):
    employee_number: str
    name: str
    position: Optional[str] = ""
    unit: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    active: bool = True


class PeriodReq(BaseModel):
    year: int
    period_type: str
    period_name: str
    start_date: str
    end_date: str
    status: str = "Open"


class IndicatorReq(BaseModel):
    indicator_code: str
    indicator_name: str
    short_name: Optional[str] = ""
    description: Optional[str] = ""
    objective: Optional[str] = ""
    category_code: Optional[str] = ""
    indicator_type: str
    calculation_type: str
    formula_description: Optional[str] = ""
    numerator_definition: Optional[str] = ""
    denominator_definition: Optional[str] = ""
    unit: Optional[str] = ""
    target_value: Optional[float] = None
    target_operator: Optional[str] = ">="
    data_source: Optional[str] = ""
    active_status: bool = True
    reporting_frequency: Optional[str] = ""
    components: List[dict] = []
    allow_numerator_gt_denominator: bool = False
    config_extra: dict = {}
    notes: Optional[str] = ""


class DataEntryReq(BaseModel):
    indicator_id: str
    period_id: str
    numerator: Optional[dict] = None
    denominator: Optional[dict] = None
    components: Optional[List[dict]] = None
    survey: Optional[dict] = None
    manual: Optional[dict] = None
    adjustment: Optional[float] = None
    documents: Optional[List[dict]] = None
    notes: Optional[str] = ""


class AssignReq(BaseModel):
    indicator_id: str
    officer_id: str
    responsibility_type: str = "Primary"
    start_date: Optional[str] = ""
    end_date: Optional[str] = ""


class MappingReq(BaseModel):
    indicator_id: str
    source_code: str
    source_table: Optional[str] = ""
    source_field: Optional[str] = ""
    filter_condition: Optional[str] = ""
    proses_id: Optional[str] = ""
    tahapan_id: Optional[str] = ""
    date_field: Optional[str] = ""
    case_type: Optional[str] = ""
    mapping_note: Optional[str] = ""
    numerator_query: Optional[str] = ""
    denominator_query: Optional[str] = ""


class SippConnReq(BaseModel):
    host: str
    port: int = 3306
    database: str
    username: str
    password: Optional[str] = ""


class SippPullReq(BaseModel):
    indicator_id: str
    period_id: str


class BusinessRuleReq(BaseModel):
    code: str
    name: str
    description: Optional[str] = ""
    criteria: List[dict] = []
    active: bool = True


# ---------------- Public Windows App Download ----------------
@api.api_route("/download/windows", methods=["GET", "HEAD"])
async def download_windows_app():
    zip_path = "/app/KINTRACK-Windows-x64.zip"
    if not os.path.exists(zip_path):
        raise HTTPException(status_code=404, detail="Berkas instalasi Windows belum tersedia.")
    return FileResponse(
        path=zip_path,
        filename="KINTRACK-Windows-x64.zip",
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="KINTRACK-Windows-x64.zip"'}
    )


# ---------------- Auth ----------------
@api.post("/auth/login")
async def login(body: LoginReq, request: Request):
    email = body.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Email atau kata sandi salah")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Akun dinonaktifkan")
    token = create_access_token(user["id"], user["email"], user["role"])
    clean_user = clean(user)
    clean_user.pop("password_hash", None)
    await log_audit(clean_user, "LOGIN", "Auth", clean_user["id"], ip=client_ip(request))
    return {"access_token": token, "token_type": "bearer", "user": clean_user}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.get("/roles")
async def roles(user: dict = Depends(get_current_user)):
    return [{"value": k, "label": v} for k, v in ROLE_LABELS.items()]


# ---------------- Helpers ----------------
async def enrich_indicator(ind):
    clean(ind)
    assigns = await db.indicator_responsible_officers.find({"indicator_id": ind["id"], "active_status": True}).to_list(50)
    officers = []
    for a in assigns:
        off = await db.responsible_officers.find_one({"id": a["officer_id"]})
        if off:
            officers.append({"id": off["id"], "name": off["name"], "position": off.get("position"),
                             "responsibility_type": a.get("responsibility_type")})
    ind["officers"] = officers
    cat = await db.indicator_categories.find_one({"code": ind.get("category_code")})
    ind["category_name"] = cat["name"] if cat else ind.get("category_code")
    return ind


async def latest_calc(indicator_id, period_id=None, year=None):
    q = {"indicator_id": indicator_id}
    if period_id:
        q["period_id"] = period_id
    if year:
        q["year"] = int(year)
    docs = await db.indicator_calculations.find(q).sort("calculated_at", -1).to_list(1)
    return clean(docs[0]) if docs else None


# ---------------- Indicators (Master) ----------------
@api.get("/indicators")
async def list_indicators(user: dict = Depends(get_current_user), category: Optional[str] = None,
                          active: Optional[bool] = None, q: Optional[str] = None):
    query = {}
    if category:
        query["category_code"] = category
    if active is not None:
        query["active_status"] = active
    if q:
        query["$or"] = [{"indicator_name": {"$regex": q, "$options": "i"}},
                        {"indicator_code": {"$regex": q, "$options": "i"}}]
    inds = await db.indicators.find(query).sort("indicator_code", 1).to_list(200)
    return [await enrich_indicator(i) for i in inds]


@api.get("/indicators/{indicator_id}")
async def get_indicator(indicator_id: str, user: dict = Depends(get_current_user)):
    ind = await db.indicators.find_one({"id": indicator_id})
    if not ind:
        raise HTTPException(404, "Indikator tidak ditemukan")
    ind = await enrich_indicator(ind)
    versions = clean(await db.indicator_formula_versions.find({"indicator_id": indicator_id}).sort("version_number", -1).to_list(50))
    ind["formula_versions"] = versions
    mappings = clean(await db.data_source_mappings.find({"indicator_id": indicator_id}).to_list(50))
    ind["mappings"] = mappings
    return ind


@api.post("/indicators")
async def create_indicator(body: IndicatorReq, request: Request, user: dict = Depends(require_roles(SUPER_ADMIN, ADMIN))):
    if await db.indicators.find_one({"indicator_code": body.indicator_code}):
        raise HTTPException(400, "Kode indikator sudah digunakan")
    iid = new_id()
    doc = {"id": iid, **body.model_dump(), "start_period": "", "end_period": "",
           "responsible_officer": "", "created_at": now_iso(), "updated_at": now_iso()}
    await db.indicators.insert_one(dict(doc))
    await db.indicator_formula_versions.insert_one({
        "id": new_id(), "indicator_id": iid, "version_number": 1,
        "formula_definition": body.formula_description, "calculation_type": body.calculation_type,
        "components": body.components, "effective_start_date": now_iso()[:10], "effective_end_date": "",
        "active_status": True, "created_by": user["name"], "created_at": now_iso(),
    })
    await log_audit(user, "CREATE", "Indikator", iid, None, {"code": body.indicator_code}, client_ip(request))
    return clean(doc)


@api.put("/indicators/{indicator_id}")
async def update_indicator(indicator_id: str, body: IndicatorReq, request: Request,
                           user: dict = Depends(require_roles(SUPER_ADMIN, ADMIN))):
    old = await db.indicators.find_one({"id": indicator_id})
    if not old:
        raise HTTPException(404, "Indikator tidak ditemukan")
    new_vals = body.model_dump()
    formula_changed = (old.get("formula_description") != body.formula_description
                       or old.get("components") != body.components
                       or old.get("calculation_type") != body.calculation_type)
    new_vals["updated_at"] = now_iso()
    await db.indicators.update_one({"id": indicator_id}, {"$set": new_vals})
    if formula_changed:
        last = await db.indicator_formula_versions.find({"indicator_id": indicator_id}).sort("version_number", -1).to_list(1)
        next_ver = (last[0]["version_number"] + 1) if last else 1
        if last:
            await db.indicator_formula_versions.update_one({"id": last[0]["id"]},
                {"$set": {"active_status": False, "effective_end_date": now_iso()[:10]}})
        await db.indicator_formula_versions.insert_one({
            "id": new_id(), "indicator_id": indicator_id, "version_number": next_ver,
            "formula_definition": body.formula_description, "calculation_type": body.calculation_type,
            "components": body.components, "effective_start_date": now_iso()[:10], "effective_end_date": "",
            "active_status": True, "created_by": user["name"], "created_at": now_iso(),
        })
    await log_audit(user, "UPDATE", "Indikator", indicator_id,
                    {"name": old.get("indicator_name")}, {"name": body.indicator_name}, client_ip(request))
    return {"ok": True, "formula_versioned": formula_changed}


@api.patch("/indicators/{indicator_id}/toggle")
async def toggle_indicator(indicator_id: str, request: Request, user: dict = Depends(require_roles(SUPER_ADMIN, ADMIN))):
    ind = await db.indicators.find_one({"id": indicator_id})
    if not ind:
        raise HTTPException(404, "Indikator tidak ditemukan")
    new_status = not ind.get("active_status", True)
    await db.indicators.update_one({"id": indicator_id}, {"$set": {"active_status": new_status, "updated_at": now_iso()}})
    await log_audit(user, "UPDATE", "Indikator", indicator_id, {"active": ind.get("active_status")},
                    {"active": new_status}, client_ip(request))
    return {"active_status": new_status}


@api.delete("/indicators/{indicator_id}")
async def delete_indicator(indicator_id: str, request: Request, user: dict = Depends(require_roles(SUPER_ADMIN))):
    ind = await db.indicators.find_one({"id": indicator_id})
    if not ind:
        raise HTTPException(404, "Indikator tidak ditemukan")
    await db.indicators.delete_one({"id": indicator_id})
    await log_audit(user, "DELETE", "Indikator", indicator_id, {"code": ind.get("indicator_code")}, None, client_ip(request))
    return {"ok": True}


@api.get("/categories")
async def list_categories(user: dict = Depends(get_current_user)):
    return clean(await db.indicator_categories.find({}).to_list(100))


# ---------------- Responsible Officers ----------------
@api.get("/officers")
async def list_officers(user: dict = Depends(get_current_user)):
    officers = clean(await db.responsible_officers.find({}).sort("name", 1).to_list(200))
    for o in officers:
        o["indicator_count"] = await db.indicator_responsible_officers.count_documents(
            {"officer_id": o["id"], "active_status": True})
    return officers


@api.post("/officers")
async def create_officer(body: OfficerReq, request: Request, user: dict = Depends(require_roles(SUPER_ADMIN, ADMIN))):
    doc = {"id": new_id(), **body.model_dump(), "created_at": now_iso()}
    await db.responsible_officers.insert_one(dict(doc))
    await log_audit(user, "CREATE", "Penanggung Jawab", doc["id"], None, {"name": body.name}, client_ip(request))
    return clean(doc)


@api.put("/officers/{officer_id}")
async def update_officer(officer_id: str, body: OfficerReq, request: Request, user: dict = Depends(require_roles(SUPER_ADMIN, ADMIN))):
    if not await db.responsible_officers.find_one({"id": officer_id}):
        raise HTTPException(404, "Penanggung jawab tidak ditemukan")
    await db.responsible_officers.update_one({"id": officer_id}, {"$set": body.model_dump()})
    await log_audit(user, "UPDATE", "Penanggung Jawab", officer_id, None, {"name": body.name}, client_ip(request))
    return {"ok": True}


@api.delete("/officers/{officer_id}")
async def delete_officer(officer_id: str, request: Request, user: dict = Depends(require_roles(SUPER_ADMIN, ADMIN))):
    await db.responsible_officers.delete_one({"id": officer_id})
    await db.indicator_responsible_officers.delete_many({"officer_id": officer_id})
    await log_audit(user, "DELETE", "Penanggung Jawab", officer_id, None, None, client_ip(request))
    return {"ok": True}


@api.get("/assignments/{indicator_id}")
async def get_assignments(indicator_id: str, user: dict = Depends(get_current_user)):
    assigns = clean(await db.indicator_responsible_officers.find({"indicator_id": indicator_id}).to_list(50))
    for a in assigns:
        off = await db.responsible_officers.find_one({"id": a["officer_id"]})
        a["officer"] = clean(off) if off else None
    return assigns


@api.post("/assignments")
async def create_assignment(body: AssignReq, request: Request, user: dict = Depends(require_roles(SUPER_ADMIN, ADMIN))):
    doc = {"id": new_id(), **body.model_dump(), "active_status": True, "created_at": now_iso()}
    await db.indicator_responsible_officers.insert_one(dict(doc))
    await log_audit(user, "CREATE", "Penugasan", doc["id"], None, body.model_dump(), client_ip(request))
    return clean(doc)


@api.delete("/assignments/{assignment_id}")
async def delete_assignment(assignment_id: str, request: Request, user: dict = Depends(require_roles(SUPER_ADMIN, ADMIN))):
    await db.indicator_responsible_officers.delete_one({"id": assignment_id})
    await log_audit(user, "DELETE", "Penugasan", assignment_id, None, None, client_ip(request))
    return {"ok": True}


# ---------------- Reporting Periods ----------------
@api.get("/periods")
async def list_periods(user: dict = Depends(get_current_user), year: Optional[int] = None):
    q = {"year": year} if year else {}
    return clean(await db.reporting_periods.find(q).sort([("year", -1), ("start_date", 1)]).to_list(200))


@api.post("/periods")
async def create_period(body: PeriodReq, request: Request, user: dict = Depends(require_roles(SUPER_ADMIN, ADMIN))):
    doc = {"id": new_id(), **body.model_dump(), "created_at": now_iso()}
    await db.reporting_periods.insert_one(dict(doc))
    await log_audit(user, "CREATE", "Periode", doc["id"], None, {"name": body.period_name}, client_ip(request))
    return clean(doc)


@api.put("/periods/{period_id}")
async def update_period(period_id: str, body: PeriodReq, request: Request, user: dict = Depends(require_roles(SUPER_ADMIN, ADMIN))):
    await db.reporting_periods.update_one({"id": period_id}, {"$set": body.model_dump()})
    await log_audit(user, "UPDATE", "Periode", period_id, None, {"name": body.period_name}, client_ip(request))
    return {"ok": True}


@api.patch("/periods/{period_id}/lock")
async def lock_period(period_id: str, request: Request, user: dict = Depends(require_roles(SUPER_ADMIN, ADMIN))):
    p = await db.reporting_periods.find_one({"id": period_id})
    if not p:
        raise HTTPException(404, "Periode tidak ditemukan")
    new_status = "Open" if p.get("status") == "Locked" else "Locked"
    await db.reporting_periods.update_one({"id": period_id}, {"$set": {"status": new_status}})
    await log_audit(user, "LOCK" if new_status == "Locked" else "UNLOCK", "Periode", period_id,
                    {"status": p.get("status")}, {"status": new_status}, client_ip(request))
    return {"status": new_status}


# ---------------- Data Entry + Calculation ----------------
@api.get("/data-entries")
async def list_entries(user: dict = Depends(get_current_user), indicator_id: Optional[str] = None,
                       period_id: Optional[str] = None):
    q = {}
    if indicator_id:
        q["indicator_id"] = indicator_id
    if period_id:
        q["period_id"] = period_id
    return clean(await db.indicator_data.find(q).sort("updated_at", -1).to_list(500))


@api.get("/data-entries/one")
async def get_entry(indicator_id: str, period_id: str, user: dict = Depends(get_current_user)):
    doc = await db.indicator_data.find_one({"indicator_id": indicator_id, "period_id": period_id})
    return clean(doc)


@api.post("/data-entries")
async def save_entry(body: DataEntryReq, request: Request, user: dict = Depends(get_current_user)):
    if not can_edit(user):
        raise HTTPException(403, "Anda tidak memiliki akses untuk input data")
    ind = await db.indicators.find_one({"id": body.indicator_id})
    if not ind:
        raise HTTPException(404, "Indikator tidak ditemukan")
    period = await db.reporting_periods.find_one({"id": body.period_id})
    if not period:
        raise HTTPException(404, "Periode tidak ditemukan")
    if period.get("status") == "Locked" and user["role"] not in (SUPER_ADMIN,):
        raise HTTPException(400, "Periode terkunci, data tidak dapat diubah")
    # validation
    if ind.get("calculation_type") == "percentage":
        num = (body.numerator or {}).get("value")
        den = (body.denominator or {}).get("value")
        try:
            if den is not None and float(den) < 0:
                raise HTTPException(400, "Penyebut tidak boleh negatif")
            if num is not None and float(num) < 0 and not ind.get("allow_numerator_gt_denominator"):
                raise HTTPException(400, "Pembilang tidak boleh negatif")
            if (num not in (None, "") and den not in (None, "") and float(den) > 0
                    and float(num) > float(den) and not ind.get("allow_numerator_gt_denominator")):
                raise HTTPException(400, "Pembilang tidak boleh melebihi penyebut")
        except (ValueError, TypeError):
            raise HTTPException(400, "Nilai pembilang/penyebut tidak valid")

    existing = await db.indicator_data.find_one({"indicator_id": body.indicator_id, "period_id": body.period_id})
    payload = body.model_dump()
    if existing:
        if existing.get("status") in ("approved", "locked") and user["role"] not in (SUPER_ADMIN,):
            raise HTTPException(400, "Data telah disetujui/terkunci, perlu proses koreksi resmi")
        payload.update({"updated_at": now_iso(), "updated_by": user["name"]})
        await db.indicator_data.update_one({"id": existing["id"]}, {"$set": payload})
        entry_id = existing["id"]
        await log_audit(user, "UPDATE", "Input Data", entry_id, None, {"indicator": ind["indicator_code"]}, client_ip(request))
    else:
        entry_id = new_id()
        payload.update({"id": entry_id, "status": "draft", "workflow_history": [],
                        "created_by": user["name"], "created_at": now_iso(),
                        "updated_at": now_iso(), "updated_by": user["name"]})
        await db.indicator_data.insert_one(dict(payload))
        await log_audit(user, "CREATE", "Input Data", entry_id, None, {"indicator": ind["indicator_code"]}, client_ip(request))
    return {"ok": True, "id": entry_id}


@api.post("/data-entries/{entry_id}/calculate")
async def calculate_entry(entry_id: str, request: Request, user: dict = Depends(get_current_user)):
    if not can_edit(user):
        raise HTTPException(403, "Tidak memiliki akses")
    entry = await db.indicator_data.find_one({"id": entry_id})
    if not entry:
        raise HTTPException(404, "Data tidak ditemukan")
    ind = await db.indicators.find_one({"id": entry["indicator_id"]})
    period = await db.reporting_periods.find_one({"id": entry["period_id"]})
    result_meta = compute(ind, entry)
    status = evaluate_status(result_meta["result"], ind.get("target_value"), ind.get("target_operator"))
    gap = compute_gap(result_meta["result"], ind.get("target_value"))
    active_ver = await db.indicator_formula_versions.find_one({"indicator_id": ind["id"], "active_status": True})
    calc = {
        "id": new_id(), "indicator_id": ind["id"], "indicator_code": ind["indicator_code"],
        "indicator_name": ind["indicator_name"], "period_id": entry["period_id"],
        "period_name": period.get("period_name") if period else "", "year": period.get("year") if period else None,
        "data_id": entry_id, "formula_version_id": active_ver["id"] if active_ver else None,
        "formula_version_number": active_ver["version_number"] if active_ver else 1,
        "formula_description": ind.get("formula_description"),
        "calculation_type": result_meta["calculation_type"], "inputs": result_meta["breakdown"],
        "result": result_meta["result"], "note": result_meta["note"],
        "target": ind.get("target_value"), "target_operator": ind.get("target_operator"),
        "gap": gap, "status": status, "unit": ind.get("unit"),
        "calculated_by": user["name"], "calculated_at": now_iso(),
    }
    await db.indicator_calculations.insert_one(dict(calc))
    await log_audit(user, "CALCULATE", "Perhitungan", calc["id"], None,
                    {"indicator": ind["indicator_code"], "result": result_meta["result"]}, client_ip(request))
    return clean(calc)


@api.post("/recalculate-all")
async def recalculate_all(request: Request, period_id: str, user: dict = Depends(require_roles(SUPER_ADMIN, ADMIN))):
    entries = await db.indicator_data.find({"period_id": period_id}).to_list(500)
    count = 0
    for entry in entries:
        ind = await db.indicators.find_one({"id": entry["indicator_id"]})
        if not ind:
            continue
        period = await db.reporting_periods.find_one({"id": period_id})
        rm = compute(ind, entry)
        status = evaluate_status(rm["result"], ind.get("target_value"), ind.get("target_operator"))
        gap = compute_gap(rm["result"], ind.get("target_value"))
        active_ver = await db.indicator_formula_versions.find_one({"indicator_id": ind["id"], "active_status": True})
        await db.indicator_calculations.insert_one({
            "id": new_id(), "indicator_id": ind["id"], "indicator_code": ind["indicator_code"],
            "indicator_name": ind["indicator_name"], "period_id": period_id,
            "period_name": period.get("period_name") if period else "", "year": period.get("year") if period else None,
            "data_id": entry["id"], "formula_version_id": active_ver["id"] if active_ver else None,
            "formula_version_number": active_ver["version_number"] if active_ver else 1,
            "formula_description": ind.get("formula_description"), "calculation_type": rm["calculation_type"],
            "inputs": rm["breakdown"], "result": rm["result"], "note": rm["note"],
            "target": ind.get("target_value"), "target_operator": ind.get("target_operator"),
            "gap": gap, "status": status, "unit": ind.get("unit"),
            "calculated_by": user["name"], "calculated_at": now_iso(),
        })
        count += 1
    await log_audit(user, "CALCULATE", "Perhitungan", period_id, None, {"recalculated": count}, client_ip(request))
    return {"ok": True, "count": count}


@api.get("/calculations")
async def list_calculations(user: dict = Depends(get_current_user), indicator_id: Optional[str] = None,
                            period_id: Optional[str] = None, year: Optional[int] = None, latest_only: bool = False):
    q = {}
    if indicator_id:
        q["indicator_id"] = indicator_id
    if period_id:
        q["period_id"] = period_id
    if year:
        q["year"] = year
    calcs = clean(await db.indicator_calculations.find(q).sort("calculated_at", -1).to_list(1000))
    if latest_only:
        seen = {}
        for c in calcs:
            key = (c["indicator_id"], c["period_id"])
            if key not in seen:
                seen[key] = c
        calcs = list(seen.values())
    return calcs


@api.get("/history/{indicator_id}")
async def indicator_history(indicator_id: str, user: dict = Depends(get_current_user)):
    calcs = clean(await db.indicator_calculations.find({"indicator_id": indicator_id}).sort("calculated_at", 1).to_list(500))
    return calcs


# ---------------- Approval Workflow ----------------
WF = {"draft": "submitted", "submitted": "verified", "verified": "approved", "approved": "locked"}
WF_ACTION = {"submitted": "SUBMIT", "verified": "VERIFY", "approved": "APPROVE", "locked": "LOCK"}
WF_ROLE = {"submitted": (SUPER_ADMIN, ADMIN, OFFICER), "verified": (SUPER_ADMIN, ADMIN),
           "approved": (SUPER_ADMIN, ADMIN), "locked": (SUPER_ADMIN, ADMIN)}


@api.post("/data-entries/{entry_id}/advance")
async def advance_workflow(entry_id: str, request: Request, user: dict = Depends(get_current_user)):
    entry = await db.indicator_data.find_one({"id": entry_id})
    if not entry:
        raise HTTPException(404, "Data tidak ditemukan")
    current = entry.get("status", "draft")
    nxt = WF.get(current)
    if not nxt:
        raise HTTPException(400, "Sudah pada tahap akhir")
    if user["role"] not in WF_ROLE[nxt]:
        raise HTTPException(403, "Anda tidak berwenang untuk tahap ini")
    history = entry.get("workflow_history", [])
    history.append({"status": nxt, "by": user["name"], "role": user["role"], "at": now_iso()})
    await db.indicator_data.update_one({"id": entry_id}, {"$set": {"status": nxt, "workflow_history": history}})
    await log_audit(user, WF_ACTION[nxt], "Alur Persetujuan", entry_id, {"status": current}, {"status": nxt}, client_ip(request))
    return {"status": nxt}


# ---------------- Data Sources & SIPP Mapping ----------------
@api.get("/data-sources")
async def list_sources(user: dict = Depends(get_current_user)):
    return clean(await db.data_sources.find({}).to_list(50))


@api.get("/sipp-processes")
async def sipp_processes(user: dict = Depends(get_current_user)):
    return clean(await db.sipp_processes.find({}).sort("proses_id", 1).to_list(100))


@api.get("/mappings")
async def list_mappings(user: dict = Depends(get_current_user), indicator_id: Optional[str] = None):
    q = {"indicator_id": indicator_id} if indicator_id else {}
    maps = clean(await db.data_source_mappings.find(q).to_list(200))
    for m in maps:
        ind = await db.indicators.find_one({"id": m["indicator_id"]})
        m["indicator_name"] = ind["indicator_name"] if ind else ""
        m["indicator_code"] = ind["indicator_code"] if ind else ""
    return maps


@api.post("/mappings")
async def create_mapping(body: MappingReq, request: Request, user: dict = Depends(require_roles(SUPER_ADMIN, ADMIN))):
    doc = {"id": new_id(), **body.model_dump(), "created_at": now_iso(), "created_by": user["name"]}
    await db.data_source_mappings.insert_one(dict(doc))
    await log_audit(user, "CREATE", "Sumber Data", doc["id"], None, body.model_dump(), client_ip(request))
    return clean(doc)


@api.delete("/mappings/{mapping_id}")
async def delete_mapping(mapping_id: str, request: Request, user: dict = Depends(require_roles(SUPER_ADMIN, ADMIN))):
    await db.data_source_mappings.delete_one({"id": mapping_id})
    await log_audit(user, "DELETE", "Sumber Data", mapping_id, None, None, client_ip(request))
    return {"ok": True}


async def _get_sipp_cfg():
    doc = await db.system_settings.find_one({"key": "sipp_connection"})
    return doc


@api.get("/sipp/connection")
async def get_sipp_connection(user: dict = Depends(require_roles(SUPER_ADMIN, ADMIN))):
    cfg = await _get_sipp_cfg()
    if not cfg:
        return {"configured": False}
    return {"configured": True, "host": cfg.get("host"), "port": cfg.get("port"),
            "database": cfg.get("database"), "username": cfg.get("username"),
            "has_password": bool(cfg.get("password")), "last_tested": cfg.get("last_tested"),
            "last_status": cfg.get("last_status")}


@api.put("/sipp/connection")
async def save_sipp_connection(body: SippConnReq, request: Request, user: dict = Depends(require_roles(SUPER_ADMIN))):
    existing = await _get_sipp_cfg()
    data = body.model_dump()
    # keep existing password if left blank on update
    if not data.get("password") and existing and existing.get("password"):
        data["password"] = existing["password"]
    await db.system_settings.update_one(
        {"key": "sipp_connection"},
        {"$set": {"key": "sipp_connection", **data, "updated_at": now_iso()},
         "$setOnInsert": {"id": new_id()}}, upsert=True)
    await log_audit(user, "UPDATE", "Sumber Data", "sipp_connection", None,
                    {"host": data["host"], "database": data["database"]}, client_ip(request))
    return {"ok": True}


@api.delete("/sipp/connection")
async def delete_sipp_connection(request: Request, user: dict = Depends(require_roles(SUPER_ADMIN))):
    await db.system_settings.delete_one({"key": "sipp_connection"})
    await log_audit(user, "DELETE", "Sumber Data", "sipp_connection", None, None, client_ip(request))
    return {"ok": True}


@api.post("/sipp/test-connection")
async def sipp_test(request: Request, user: dict = Depends(require_roles(SUPER_ADMIN, ADMIN))):
    cfg = await _get_sipp_cfg()
    if not cfg:
        raise HTTPException(400, "Koneksi SIPP belum dikonfigurasi")
    try:
        res = await sipp_mod.test_connection(cfg)
        await db.system_settings.update_one({"key": "sipp_connection"},
            {"$set": {"last_tested": now_iso(), "last_status": "OK"}})
        return res
    except Exception as e:
        await db.system_settings.update_one({"key": "sipp_connection"},
            {"$set": {"last_tested": now_iso(), "last_status": "FAILED"}})
        raise HTTPException(400, f"Gagal terhubung ke SIPP: {str(e)}")


@api.post("/sipp/pull")
async def sipp_pull(body: SippPullReq, request: Request, user: dict = Depends(require_roles(SUPER_ADMIN, ADMIN))):
    cfg = await _get_sipp_cfg()
    if not cfg:
        raise HTTPException(400, "Koneksi SIPP belum dikonfigurasi. Atur di Sumber Data → Koneksi SIPP.")
    mapping = await db.data_source_mappings.find_one(
        {"indicator_id": body.indicator_id, "source_code": "SIPP"})
    if not mapping or not (mapping.get("numerator_query") or mapping.get("denominator_query")):
        raise HTTPException(400, "Pemetaan query SIPP (numerator/denominator) belum diatur untuk indikator ini")
    ind = await db.indicators.find_one({"id": body.indicator_id})
    period = await db.reporting_periods.find_one({"id": body.period_id})
    if not ind or not period:
        raise HTTPException(404, "Indikator/periode tidak ditemukan")
    if period.get("status") == "Locked" and user["role"] != SUPER_ADMIN:
        raise HTTPException(400, "Periode terkunci")
    try:
        num = await sipp_mod.run_scalar(cfg, mapping["numerator_query"]) if mapping.get("numerator_query") else None
        den = await sipp_mod.run_scalar(cfg, mapping["denominator_query"]) if mapping.get("denominator_query") else None
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(400, f"Gagal menjalankan query SIPP: {str(e)}")

    existing = await db.indicator_data.find_one({"indicator_id": body.indicator_id, "period_id": body.period_id})
    entry_patch = {
        "numerator": {"value": num, "definition": ind.get("numerator_definition"), "source": "SIPP", "input_date": now_iso()[:10]},
        "denominator": {"value": den, "definition": ind.get("denominator_definition"), "source": "SIPP", "input_date": now_iso()[:10]},
        "updated_at": now_iso(), "updated_by": f"{user['name']} (SIPP)",
    }
    if existing:
        await db.indicator_data.update_one({"id": existing["id"]}, {"$set": entry_patch})
        entry_id = existing["id"]
    else:
        entry_id = new_id()
        await db.indicator_data.insert_one({"id": entry_id, "indicator_id": body.indicator_id,
            "period_id": body.period_id, "status": "draft", "workflow_history": [],
            "created_by": f"{user['name']} (SIPP)", "created_at": now_iso(), **entry_patch})
    await log_audit(user, "UPDATE", "Sumber Data", entry_id, None,
                    {"source": "SIPP", "numerator": num, "denominator": den}, client_ip(request))
    return {"ok": True, "entry_id": entry_id, "numerator": num, "denominator": den}


# ---------------- Supporting Documents ----------------
@api.post("/data-entries/{entry_id}/documents")
async def upload_document(entry_id: str, request: Request, file: UploadFile = File(...),
                          user: dict = Depends(get_current_user)):
    if not can_edit(user):
        raise HTTPException(403, "Tidak memiliki akses untuk mengunggah")
    entry = await db.indicator_data.find_one({"id": entry_id})
    if not entry:
        raise HTTPException(404, "Data entry tidak ditemukan")
    ext = (file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "")
    if ext not in storage_mod.ALLOWED_EXT:
        raise HTTPException(400, f"Tipe file tidak diizinkan (.{ext}). Diizinkan: {', '.join(sorted(storage_mod.ALLOWED_EXT))}")
    data = await file.read()
    if len(data) > storage_mod.MAX_SIZE:
        raise HTTPException(400, "Ukuran file melebihi batas 10 MB")
    doc_id = new_id()
    path = f"{storage_mod.APP_NAME}/uploads/{entry_id}/{doc_id}.{ext}"
    content_type = file.content_type or storage_mod.MIME.get(ext, "application/octet-stream")
    try:
        result = storage_mod.put_object(path, data, content_type)
    except Exception as e:
        raise HTTPException(500, f"Gagal mengunggah file: {str(e)}")
    rec = {"id": doc_id, "entry_id": entry_id, "indicator_id": entry["indicator_id"],
           "period_id": entry["period_id"], "storage_path": result["path"],
           "original_filename": file.filename, "content_type": content_type,
           "size": result.get("size", len(data)), "is_deleted": False,
           "uploaded_by": user["name"], "created_at": now_iso()}
    await db.supporting_documents.insert_one(dict(rec))
    await log_audit(user, "CREATE", "Dokumen", doc_id, None, {"file": file.filename}, client_ip(request))
    return clean(rec)


@api.get("/data-entries/{entry_id}/documents")
async def list_documents(entry_id: str, user: dict = Depends(get_current_user)):
    return clean(await db.supporting_documents.find(
        {"entry_id": entry_id, "is_deleted": False}).sort("created_at", -1).to_list(100))


@api.get("/documents/{doc_id}/download")
async def download_document(doc_id: str, authorization: str = Header(None), auth: str = Query(None)):
    from auth import get_jwt_secret, JWT_ALGORITHM
    import jwt as jwtlib
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    elif auth:
        token = auth
    if not token:
        raise HTTPException(401, "Tidak terautentikasi")
    try:
        jwtlib.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except Exception:
        raise HTTPException(401, "Token tidak valid")
    rec = await db.supporting_documents.find_one({"id": doc_id, "is_deleted": False})
    if not rec:
        raise HTTPException(404, "Dokumen tidak ditemukan")
    try:
        data, ct = storage_mod.get_object(rec["storage_path"])
    except Exception as e:
        raise HTTPException(500, f"Gagal mengambil file: {str(e)}")
    return Response(content=data, media_type=rec.get("content_type", ct),
                    headers={"Content-Disposition": f'inline; filename="{rec["original_filename"]}"'})


@api.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, request: Request, user: dict = Depends(get_current_user)):
    if not can_edit(user):
        raise HTTPException(403, "Tidak memiliki akses")
    rec = await db.supporting_documents.find_one({"id": doc_id})
    if not rec:
        raise HTTPException(404, "Dokumen tidak ditemukan")
    await db.supporting_documents.update_one({"id": doc_id}, {"$set": {"is_deleted": True}})
    await log_audit(user, "DELETE", "Dokumen", doc_id, {"file": rec.get("original_filename")}, None, client_ip(request))
    return {"ok": True}


# ---------------- Business Rules ----------------
@api.get("/business-rules")
async def list_rules(user: dict = Depends(get_current_user)):
    return clean(await db.business_rules.find({}).to_list(100))


@api.post("/business-rules")
async def create_rule(body: BusinessRuleReq, request: Request, user: dict = Depends(require_roles(SUPER_ADMIN, ADMIN))):
    if await db.business_rules.find_one({"code": body.code}):
        raise HTTPException(400, "Kode aturan sudah digunakan")
    doc = {"id": new_id(), **body.model_dump(), "created_at": now_iso()}
    await db.business_rules.insert_one(dict(doc))
    await log_audit(user, "CREATE", "Aturan Bisnis", doc["id"], None, {"code": body.code}, client_ip(request))
    return clean(doc)


@api.put("/business-rules/{rule_id}")
async def update_rule(rule_id: str, body: BusinessRuleReq, request: Request, user: dict = Depends(require_roles(SUPER_ADMIN, ADMIN))):
    await db.business_rules.update_one({"id": rule_id}, {"$set": body.model_dump()})
    await log_audit(user, "UPDATE", "Aturan Bisnis", rule_id, None, {"code": body.code}, client_ip(request))
    return {"ok": True}


# ---------------- Survey ----------------
@api.get("/survey/questions")
async def survey_questions(user: dict = Depends(get_current_user)):
    return clean(await db.survey_questions.find({}).sort("order", 1).to_list(50))


# ---------------- Dashboard ----------------
@api.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user), year: Optional[int] = None,
                    period_id: Optional[str] = None, category: Optional[str] = None,
                    officer_id: Optional[str] = None, status: Optional[str] = None):
    inds = await db.indicators.find({"active_status": True}).to_list(200)
    if category:
        inds = [i for i in inds if i.get("category_code") == category]
    if officer_id:
        assigned = set()
        async for a in db.indicator_responsible_officers.find({"officer_id": officer_id, "active_status": True}):
            assigned.add(a["indicator_id"])
        inds = [i for i in inds if i["id"] in assigned]

    rows = []
    counts = {"total": 0, "achieved": 0, "not_achieved": 0, "na": 0, "not_calculated": 0}
    for ind in inds:
        counts["total"] += 1
        calc = await latest_calc(ind["id"], period_id, year)
        st = calc["status"] if calc else "NOT_CALCULATED"
        if not calc:
            counts["not_calculated"] += 1
        elif st == "ACHIEVED":
            counts["achieved"] += 1
        elif st == "NOT_ACHIEVED":
            counts["not_achieved"] += 1
        else:
            counts["na"] += 1
        cat = await db.indicator_categories.find_one({"code": ind.get("category_code")})
        rows.append({
            "indicator_id": ind["id"], "code": ind["indicator_code"], "name": ind["indicator_name"],
            "short_name": ind.get("short_name"), "category": cat["name"] if cat else ind.get("category_code"),
            "category_code": ind.get("category_code"), "type": ind.get("indicator_type"),
            "unit": ind.get("unit"), "target": ind.get("target_value"),
            "target_operator": ind.get("target_operator"),
            "result": calc["result"] if calc else None, "status": st,
            "gap": calc["gap"] if calc else None,
            "period_name": calc["period_name"] if calc else None,
        })
    if status:
        rows = [r for r in rows if r["status"] == status]

    # category performance
    cat_perf = {}
    for r in rows:
        c = r["category"] or "Lainnya"
        cat_perf.setdefault(c, {"category": c, "total": 0, "achieved": 0, "avg": [], "sum": 0})
        cat_perf[c]["total"] += 1
        if r["status"] == "ACHIEVED":
            cat_perf[c]["achieved"] += 1
        if r["result"] is not None and r["target"]:
            try:
                cat_perf[c]["avg"].append(min(r["result"] / float(r["target"]) * 100, 150))
            except Exception:
                pass
    cat_list = []
    for c in cat_perf.values():
        avg = round(sum(c["avg"]) / len(c["avg"]), 1) if c["avg"] else 0
        cat_list.append({"category": c["category"], "total": c["total"], "achieved": c["achieved"], "achievement_pct": avg})

    # officer performance
    off_perf = []
    officers = await db.responsible_officers.find({"active": True}).to_list(100)
    for off in officers:
        ind_ids = set()
        async for a in db.indicator_responsible_officers.find({"officer_id": off["id"], "active_status": True}):
            ind_ids.add(a["indicator_id"])
        rel = [r for r in rows if r["indicator_id"] in ind_ids]
        if rel:
            off_perf.append({
                "officer": off["name"], "position": off.get("position"),
                "total": len(rel), "achieved": len([r for r in rel if r["status"] == "ACHIEVED"]),
                "not_calculated": len([r for r in rel if r["status"] == "NOT_CALCULATED"]),
            })

    # trend by year
    trend = []
    for y in (2024, 2025, 2026):
        calcs = await db.indicator_calculations.find({"year": y}).to_list(1000)
        vals = []
        for c in calcs:
            if c.get("result") is not None and c.get("target"):
                try:
                    vals.append(min(c["result"] / float(c["target"]) * 100, 150))
                except Exception:
                    pass
        trend.append({"year": str(y), "achievement": round(sum(vals) / len(vals), 1) if vals else 0})

    overall = round(sum([r["result"] / float(r["target"]) * 100 for r in rows
                    if r["result"] is not None and r["target"]]) / max(counts["total"], 1), 1) \
        if any(r["result"] is not None and r["target"] for r in rows) else 0

    return {"counts": counts, "rows": rows, "category_performance": cat_list,
            "officer_performance": off_perf, "trend": trend, "overall_achievement": overall}


# ---------------- Users ----------------
@api.get("/users")
async def list_users(user: dict = Depends(require_roles(SUPER_ADMIN))):
    users = clean(await db.users.find({}).sort("created_at", -1).to_list(200))
    for u in users:
        u.pop("password_hash", None)
        u["role_label"] = ROLE_LABELS.get(u.get("role"), u.get("role"))
    return users


@api.post("/users")
async def create_user(body: UserReq, request: Request, user: dict = Depends(require_roles(SUPER_ADMIN))):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email sudah terdaftar")
    if not body.password:
        raise HTTPException(400, "Kata sandi wajib diisi")
    doc = {"id": new_id(), "email": email, "password_hash": hash_password(body.password),
           "name": body.name, "role": body.role, "position": body.position, "active": body.active,
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.users.insert_one(dict(doc))
    await log_audit(user, "CREATE", "Pengguna", doc["id"], None, {"email": email, "role": body.role}, client_ip(request))
    doc.pop("password_hash", None)
    return clean(doc)


@api.put("/users/{user_id}")
async def update_user(user_id: str, body: UserReq, request: Request, user: dict = Depends(require_roles(SUPER_ADMIN))):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "Pengguna tidak ditemukan")
    upd = {"name": body.name, "role": body.role, "position": body.position, "active": body.active,
           "email": body.email.lower(), "updated_at": now_iso()}
    if body.password:
        upd["password_hash"] = hash_password(body.password)
    await db.users.update_one({"id": user_id}, {"$set": upd})
    await log_audit(user, "UPDATE", "Pengguna", user_id, {"role": target.get("role")}, {"role": body.role}, client_ip(request))
    return {"ok": True}


@api.delete("/users/{user_id}")
async def delete_user(user_id: str, request: Request, user: dict = Depends(require_roles(SUPER_ADMIN))):
    if user_id == user["id"]:
        raise HTTPException(400, "Tidak dapat menghapus akun sendiri")
    await db.users.delete_one({"id": user_id})
    await log_audit(user, "DELETE", "Pengguna", user_id, None, None, client_ip(request))
    return {"ok": True}


# ---------------- Audit Log ----------------
@api.get("/audit-logs")
async def audit_logs(user: dict = Depends(require_roles(SUPER_ADMIN, ADMIN)), action: Optional[str] = None,
                     module: Optional[str] = None, limit: int = 300):
    q = {}
    if action:
        q["action"] = action
    if module:
        q["module"] = module
    return clean(await db.audit_logs.find(q).sort("timestamp", -1).to_list(limit))


# ---------------- Settings ----------------
@api.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    s = await db.system_settings.find_one({"key": "app"})
    return clean(s) if s else {}


@api.put("/settings")
async def update_settings(body: dict, request: Request, user: dict = Depends(require_roles(SUPER_ADMIN))):
    body.pop("id", None)
    body.pop("_id", None)
    await db.system_settings.update_one({"key": "app"}, {"$set": body})
    await log_audit(user, "UPDATE", "Pengaturan", "app", None, body, client_ip(request))
    return {"ok": True}


@api.get("/")
async def root():
    return {"app": "KINTRACK API", "status": "ok"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await seed_all()
    try:
        storage_mod.init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    logger.info("KINTRACK seed complete")


@app.on_event("shutdown")
async def shutdown():
    from db import client
    client.close()
