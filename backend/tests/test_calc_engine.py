"""KINTRACK calculation engine + override + health tests (iteration 4).

Covers:
- Safe formula engine with IF() zero-guard
- Achievement % across target_direction (higher/lower/exact)
- Achievement threshold (TERCAPAI / BELUM TERCAPAI)
- Manual override (super_admin) + RBAC (viewer 403) + reason requirement
- Recalculate-all with error isolation
- Calculation history + latest_only
- /api/health
- Indicator config field persistence
- Regression: calculate for existing percentage indicator, dashboard
"""
import os
import time
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    with open("/app/frontend/.env") as f:
        for ln in f:
            if ln.startswith("REACT_APP_BACKEND_URL="):
                BASE = ln.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE}/api"

SUPER_EMAIL = "putrifebriany221@gmail.com"
SUPER_PASS = "Kintrack@2026"


@pytest.fixture(scope="session")
def super_headers():
    r = requests.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def viewer_headers(super_headers):
    email = f"test_viewer_it4_{int(time.time())}@example.com"
    body = {"email": email, "password": "Viewer@1234", "name": "TEST Viewer IT4",
            "role": "viewer", "position": "Viewer"}
    r = requests.post(f"{API}/users", headers=super_headers, json=body, timeout=15)
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    rl = requests.post(f"{API}/auth/login", json={"email": email, "password": "Viewer@1234"}, timeout=15)
    assert rl.status_code == 200
    tok = rl.json()["access_token"]
    yield {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    requests.delete(f"{API}/users/{uid}", headers=super_headers, timeout=10)


@pytest.fixture(scope="session")
def open_period(super_headers):
    r = requests.get(f"{API}/periods", headers=super_headers, timeout=15)
    assert r.status_code == 200
    for p in r.json():
        if p.get("status") == "Open":
            return p
    pytest.skip("no open period")


# ---------------- HEALTH ----------------
class TestHealth:
    def test_health(self):
        r = requests.get(f"{API}/health", timeout=10)
        assert r.status_code == 200
        d = r.json()
        for k in ("application", "database", "sipp", "version", "server_time"):
            assert k in d, f"missing {k}"
        assert d["database"] == "ok"


# ---------------- SAFE FORMULA ENGINE ----------------
class TestFormulaEngine:
    _iid = None
    _entry_id = None

    def _make_formula_indicator(self, super_headers, code_suffix="F1",
                                formula="IF(total=0, 0, (selesai/total)*100)",
                                target=90, direction="higher_is_better", threshold=100):
        code = f"TEST_{code_suffix}_{int(time.time()*1000)%100000}"
        payload = {
            "indicator_code": code, "indicator_name": f"TEST Formula {code_suffix}",
            "indicator_type": "output", "calculation_type": "formula",
            "formula": formula,
            "variables_def": [{"name": "selesai"}, {"name": "total"}],
            "target_value": target, "target_operator": ">=",
            "target_direction": direction,
            "decimal_precision": 2,
            "zero_denominator_behavior": "zero",
            "achievement_threshold": threshold,
            "allow_override": True, "realization_source": "manual",
        }
        r = requests.post(f"{API}/indicators", headers=super_headers, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def _save_entry(self, super_headers, iid, period_id, variables):
        body = {"indicator_id": iid, "period_id": period_id, "variables": variables}
        r = requests.post(f"{API}/data-entries", headers=super_headers, json=body, timeout=15)
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def test_formula_indicator_persistence(self, super_headers):
        iid = self._make_formula_indicator(super_headers, "PERSIST")
        TestFormulaEngine._persist_iid = iid
        r = requests.get(f"{API}/indicators/{iid}", headers=super_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["target_direction"] == "higher_is_better"
        assert d["realization_source"] == "manual"
        assert d["formula"] == "IF(total=0, 0, (selesai/total)*100)"
        assert isinstance(d["variables_def"], list) and len(d["variables_def"]) == 2
        assert d["decimal_precision"] == 2
        assert d["zero_denominator_behavior"] == "zero"
        assert float(d["achievement_threshold"]) == 100.0
        assert d["allow_override"] is True

    def test_formula_basic_95(self, super_headers, open_period):
        iid = self._make_formula_indicator(super_headers, "F95")
        entry = self._save_entry(super_headers, iid, open_period["id"],
                                 {"selesai": 950, "total": 1000})
        r = requests.post(f"{API}/data-entries/{entry}/calculate", headers=super_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["result"] == 95.0
        assert d["realization"] == 95.0
        assert d["achievement"] == 105.56
        assert d["achievement_status"] == "TERCAPAI"
        assert d["target_direction"] == "higher_is_better"
        assert d["is_override"] is False

    def test_formula_zero_denominator_guarded(self, super_headers, open_period):
        iid = self._make_formula_indicator(super_headers, "FZ")
        entry = self._save_entry(super_headers, iid, open_period["id"],
                                 {"selesai": 5, "total": 0})
        r = requests.post(f"{API}/data-entries/{entry}/calculate", headers=super_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["result"] == 0

    def test_formula_bad_returns_note_not_500(self, super_headers, open_period):
        # Reference undefined variable -> should be a FormulaError note, not 500
        iid = self._make_formula_indicator(super_headers, "FBAD",
                                            formula="undefined_var / 2")
        entry = self._save_entry(super_headers, iid, open_period["id"], {"selesai": 1, "total": 2})
        r = requests.post(f"{API}/data-entries/{entry}/calculate", headers=super_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["result"] is None
        note = (d.get("note") or "").lower()
        assert "kesalahan formula" in note or "tidak ditemukan" in note or "kesalahan" in note

    def test_formula_target_direction_lower(self, super_headers, open_period):
        iid = self._make_formula_indicator(super_headers, "FL",
                                            formula="(selesai/total)*100",
                                            target=10, direction="lower_is_better")
        # realization = 8/100*100=8 -> achievement = 10/8*100 = 125.0
        entry = self._save_entry(super_headers, iid, open_period["id"],
                                 {"selesai": 8, "total": 100})
        r = requests.post(f"{API}/data-entries/{entry}/calculate", headers=super_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["result"] == 8.0
        assert d["achievement"] == 125.0
        assert d["achievement_status"] == "TERCAPAI"
        assert d["target_direction"] == "lower_is_better"

    def test_formula_target_direction_exact(self, super_headers, open_period):
        iid = self._make_formula_indicator(super_headers, "FE",
                                            formula="(selesai/total)*100",
                                            target=100, direction="exact_target")
        # realization=95 -> (1 - |95-100|/100)*100 = 95.0
        entry = self._save_entry(super_headers, iid, open_period["id"],
                                 {"selesai": 95, "total": 100})
        r = requests.post(f"{API}/data-entries/{entry}/calculate", headers=super_headers, timeout=15)
        d = r.json()
        assert d["achievement"] == 95.0
        assert d["achievement_status"] == "BELUM TERCAPAI"

    def test_achievement_threshold_configurable(self, super_headers, open_period):
        # threshold=80 -> achievement 95 >= 80 -> TERCAPAI even w/ exact_target
        iid = self._make_formula_indicator(super_headers, "FTH",
                                            formula="(selesai/total)*100",
                                            target=100, direction="exact_target",
                                            threshold=80)
        entry = self._save_entry(super_headers, iid, open_period["id"],
                                 {"selesai": 95, "total": 100})
        r = requests.post(f"{API}/data-entries/{entry}/calculate", headers=super_headers, timeout=15)
        d = r.json()
        assert d["achievement"] == 95.0
        assert d["achievement_status"] == "TERCAPAI"


# ---------------- CALCULATION TYPES REGRESSION ----------------
class TestCalcTypes:
    def _find(self, super_headers, code):
        r = requests.get(f"{API}/indicators", headers=super_headers, timeout=15)
        return next((i for i in r.json() if i["indicator_code"] == code), None)

    def test_percentage_regression(self, super_headers, open_period):
        ind = self._find(super_headers, "1.1")
        assert ind
        body = {"indicator_id": ind["id"], "period_id": open_period["id"],
                "numerator": {"value": 950}, "denominator": {"value": 1000}}
        r = requests.post(f"{API}/data-entries", headers=super_headers, json=body, timeout=15)
        assert r.status_code == 200
        eid = r.json()["id"]
        rc = requests.post(f"{API}/data-entries/{eid}/calculate", headers=super_headers, timeout=15)
        assert rc.status_code == 200
        d = rc.json()
        assert d["result"] == 95.0
        # achievement should be present
        assert "achievement" in d
        assert "achievement_status" in d

    def test_manual_calc(self, super_headers, open_period):
        ind = self._find(super_headers, "1.17")
        assert ind
        body = {"indicator_id": ind["id"], "period_id": open_period["id"],
                "manual": {"value": 77}}
        r = requests.post(f"{API}/data-entries", headers=super_headers, json=body, timeout=15)
        assert r.status_code == 200
        eid = r.json()["id"]
        rc = requests.post(f"{API}/data-entries/{eid}/calculate", headers=super_headers, timeout=15)
        assert rc.json()["result"] == 77.0

    def test_composite_calc(self, super_headers, open_period):
        ind = self._find(super_headers, "1.14")
        assert ind
        components = [
            {"name": "A", "weight": 50, "score": 80},
            {"name": "B", "weight": 50, "score": 90},
        ]
        body = {"indicator_id": ind["id"], "period_id": open_period["id"], "components": components}
        r = requests.post(f"{API}/data-entries", headers=super_headers, json=body, timeout=15)
        eid = r.json()["id"]
        rc = requests.post(f"{API}/data-entries/{eid}/calculate", headers=super_headers, timeout=15)
        # 80*.5 + 90*.5 = 85
        assert abs(rc.json()["result"] - 85.0) < 0.01


# ---------------- OVERRIDE ----------------
class TestOverride:
    def _mk_and_calc(self, super_headers, open_period):
        r = requests.get(f"{API}/indicators", headers=super_headers, timeout=15)
        ind = next(i for i in r.json() if i["indicator_code"] == "1.1")
        body = {"indicator_id": ind["id"], "period_id": open_period["id"],
                "numerator": {"value": 950}, "denominator": {"value": 1000}}
        r2 = requests.post(f"{API}/data-entries", headers=super_headers, json=body, timeout=15)
        eid = r2.json()["id"]
        rc = requests.post(f"{API}/data-entries/{eid}/calculate", headers=super_headers, timeout=15)
        return ind, rc.json()

    def test_override_success_preserves_original(self, super_headers, open_period):
        ind, prev = self._mk_and_calc(super_headers, open_period)
        prev_result = prev["result"]
        body = {"indicator_id": ind["id"], "period_id": open_period["id"],
                "value": 93.8, "reason": "Koreksi manual (TEST)"}
        r = requests.post(f"{API}/calculations/override", headers=super_headers, json=body, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["is_override"] is True
        assert d["original_result"] == prev_result
        assert d["override_reason"] == "Koreksi manual (TEST)"
        assert d["result"] == 93.8
        assert d["achievement"] is not None

    def test_override_requires_reason(self, super_headers, open_period):
        ind, _ = self._mk_and_calc(super_headers, open_period)
        body = {"indicator_id": ind["id"], "period_id": open_period["id"],
                "value": 90, "reason": ""}
        r = requests.post(f"{API}/calculations/override", headers=super_headers, json=body, timeout=15)
        assert r.status_code == 400

    def test_override_viewer_forbidden(self, viewer_headers, super_headers, open_period):
        r = requests.get(f"{API}/indicators", headers=super_headers, timeout=15)
        ind = next(i for i in r.json() if i["indicator_code"] == "1.1")
        body = {"indicator_id": ind["id"], "period_id": open_period["id"],
                "value": 88, "reason": "blocked"}
        r = requests.post(f"{API}/calculations/override", headers=viewer_headers, json=body, timeout=15)
        assert r.status_code == 403

    def test_history_appends_override_and_prev(self, super_headers, open_period):
        ind, prev = self._mk_and_calc(super_headers, open_period)
        # override
        requests.post(f"{API}/calculations/override", headers=super_headers, json={
            "indicator_id": ind["id"], "period_id": open_period["id"],
            "value": 91.5, "reason": "TEST history"}, timeout=15)
        r = requests.get(f"{API}/history/{ind['id']}", headers=super_headers, timeout=15)
        assert r.status_code == 200
        recs = [c for c in r.json() if c.get("period_id") == open_period["id"]]
        assert any(c.get("is_override") for c in recs), "override record should exist in history"
        assert any(not c.get("is_override") for c in recs), "non-override records also retained"


# ---------------- RECALCULATE-ALL ----------------
class TestRecalcAll:
    def test_recalculate_all_isolated(self, super_headers, open_period):
        r = requests.post(f"{API}/recalculate-all?period_id={open_period['id']}",
                          headers=super_headers, timeout=45)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "count" in d and "errors" in d
        assert d["count"] >= 1


# ---------------- HISTORY ----------------
class TestHistory:
    def test_calculations_latest_only(self, super_headers, open_period):
        r = requests.get(f"{API}/calculations?latest_only=true&period_id={open_period['id']}",
                         headers=super_headers, timeout=15)
        assert r.status_code == 200
        # one per indicator
        ids = [c.get("indicator_id") for c in r.json()]
        assert len(ids) == len(set(ids))
