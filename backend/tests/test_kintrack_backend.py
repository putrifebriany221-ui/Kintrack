"""KINTRACK backend comprehensive API tests."""
import os
import pytest
import requests
import time

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Read from frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"

SUPER_EMAIL = "putrifebriany221@gmail.com"
SUPER_PASS = "Kintrack@2026"


# -------- Fixtures --------
@pytest.fixture(scope="session")
def super_token():
    r = requests.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and "user" in data
    assert data["user"]["role"] == "super_admin"
    return data["access_token"]


@pytest.fixture(scope="session")
def super_headers(super_token):
    return {"Authorization": f"Bearer {super_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def indicators(super_headers):
    r = requests.get(f"{API}/indicators", headers=super_headers, timeout=20)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def periods(super_headers):
    r = requests.get(f"{API}/periods", headers=super_headers, timeout=20)
    assert r.status_code == 200
    return r.json()


# -------- Auth tests --------
class TestAuth:
    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": "wrong"}, timeout=10)
        assert r.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401

    def test_me_ok(self, super_headers):
        r = requests.get(f"{API}/auth/me", headers=super_headers, timeout=10)
        assert r.status_code == 200
        assert r.json()["email"] == SUPER_EMAIL


# -------- Indicators --------
class TestIndicators:
    def test_seed_count_17(self, indicators):
        assert len(indicators) == 17, f"expected 17 indicators, got {len(indicators)}"
        for i in indicators:
            assert "id" in i and "indicator_code" in i and "officers" in i

    def test_get_single_versions_and_mappings(self, indicators, super_headers):
        first = indicators[0]
        r = requests.get(f"{API}/indicators/{first['id']}", headers=super_headers, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "formula_versions" in d and isinstance(d["formula_versions"], list)
        assert "mappings" in d
        assert len(d["formula_versions"]) >= 1

    def test_create_update_toggle_delete(self, super_headers):
        payload = {
            "indicator_code": "TEST_9.99", "indicator_name": "TEST Indicator",
            "indicator_type": "output", "calculation_type": "percentage",
            "formula_description": "num/den*100", "target_value": 90, "target_operator": ">=",
            "components": [],
        }
        r = requests.post(f"{API}/indicators", headers=super_headers, json=payload, timeout=10)
        assert r.status_code == 200, r.text
        iid = r.json()["id"]

        # Update with formula change -> new version
        payload["formula_description"] = "changed formula v2"
        r2 = requests.put(f"{API}/indicators/{iid}", headers=super_headers, json=payload, timeout=10)
        assert r2.status_code == 200
        assert r2.json()["formula_versioned"] is True

        # verify 2 versions
        r3 = requests.get(f"{API}/indicators/{iid}", headers=super_headers, timeout=10)
        vers = r3.json()["formula_versions"]
        assert len(vers) == 2

        # toggle
        r4 = requests.patch(f"{API}/indicators/{iid}/toggle", headers=super_headers, timeout=10)
        assert r4.status_code == 200
        assert r4.json()["active_status"] is False

        # delete
        r5 = requests.delete(f"{API}/indicators/{iid}", headers=super_headers, timeout=10)
        assert r5.status_code == 200


# -------- Officers --------
class TestOfficers:
    def test_list_officers_enriched(self, super_headers):
        r = requests.get(f"{API}/officers", headers=super_headers, timeout=10)
        assert r.status_code == 200
        for o in r.json():
            assert "indicator_count" in o

    def test_officer_crud(self, super_headers):
        payload = {"employee_number": "TEST999", "name": "TEST Officer", "position": "Test Pos"}
        r = requests.post(f"{API}/officers", headers=super_headers, json=payload, timeout=10)
        assert r.status_code == 200
        oid = r.json()["id"]
        payload["name"] = "TEST Officer Updated"
        r2 = requests.put(f"{API}/officers/{oid}", headers=super_headers, json=payload, timeout=10)
        assert r2.status_code == 200
        r3 = requests.delete(f"{API}/officers/{oid}", headers=super_headers, timeout=10)
        assert r3.status_code == 200


# -------- Periods --------
class TestPeriods:
    def test_periods_seed_15(self, periods):
        assert len(periods) >= 15, f"expected >=15 periods, got {len(periods)}"

    def test_lock_toggle(self, super_headers, periods):
        pid = periods[0]["id"]
        orig = periods[0]["status"]
        r = requests.patch(f"{API}/periods/{pid}/lock", headers=super_headers, timeout=10)
        assert r.status_code == 200
        new_status = r.json()["status"]
        assert new_status != orig
        # toggle back
        r2 = requests.patch(f"{API}/periods/{pid}/lock", headers=super_headers, timeout=10)
        assert r2.json()["status"] == orig


# -------- Data Entry & Calculation --------
class TestDataEntryAndCalc:
    def _find_ind(self, indicators, code):
        for i in indicators:
            if i["indicator_code"] == code:
                return i
        return None

    def _open_period(self, super_headers, periods):
        for p in periods:
            if p.get("status") == "Open" and p.get("year") == 2025:
                return p
        # ensure at least one is open
        for p in periods:
            if p.get("status") == "Open":
                return p
        return periods[0]

    def test_percentage_validation_negative_denom(self, super_headers, indicators, periods):
        ind = self._find_ind(indicators, "1.1")
        assert ind, "indicator 1.1 not found"
        p = self._open_period(super_headers, periods)
        body = {"indicator_id": ind["id"], "period_id": p["id"],
                "numerator": {"value": 100}, "denominator": {"value": -5}}
        r = requests.post(f"{API}/data-entries", headers=super_headers, json=body, timeout=10)
        assert r.status_code == 400

    def test_percentage_num_gt_den_rejected(self, super_headers, indicators, periods):
        ind = self._find_ind(indicators, "1.1")
        p = self._open_period(super_headers, periods)
        body = {"indicator_id": ind["id"], "period_id": p["id"],
                "numerator": {"value": 200}, "denominator": {"value": 100}}
        r = requests.post(f"{API}/data-entries", headers=super_headers, json=body, timeout=10)
        assert r.status_code == 400

    def test_percentage_zero_denominator_na(self, super_headers, indicators, periods):
        ind = self._find_ind(indicators, "1.1")
        p = self._open_period(super_headers, periods)
        body = {"indicator_id": ind["id"], "period_id": p["id"],
                "numerator": {"value": 0}, "denominator": {"value": 0}}
        r = requests.post(f"{API}/data-entries", headers=super_headers, json=body, timeout=10)
        assert r.status_code == 200, r.text
        entry_id = r.json()["id"]
        rc = requests.post(f"{API}/data-entries/{entry_id}/calculate", headers=super_headers, timeout=10)
        assert rc.status_code == 200
        d = rc.json()
        assert d["result"] is None
        assert d["status"] == "N/A"

    def test_percentage_correct_and_status(self, super_headers, indicators, periods):
        ind = self._find_ind(indicators, "1.1")
        assert ind is not None
        p = self._open_period(super_headers, periods)
        body = {"indicator_id": ind["id"], "period_id": p["id"],
                "numerator": {"value": 950}, "denominator": {"value": 1000}}
        r = requests.post(f"{API}/data-entries", headers=super_headers, json=body, timeout=10)
        assert r.status_code == 200
        entry_id = r.json()["id"]
        rc = requests.post(f"{API}/data-entries/{entry_id}/calculate", headers=super_headers, timeout=10)
        assert rc.status_code == 200
        d = rc.json()
        assert d["result"] == 95.0
        # target is 90 >= => ACHIEVED
        if ind.get("target_value") and ind.get("target_operator") == ">=":
            if float(ind["target_value"]) <= 95.0:
                assert d["status"] == "ACHIEVED"

        # calculate again -> history should have 2+ entries
        rc2 = requests.post(f"{API}/data-entries/{entry_id}/calculate", headers=super_headers, timeout=10)
        assert rc2.status_code == 200
        hist = requests.get(f"{API}/history/{ind['id']}", headers=super_headers, timeout=10)
        assert hist.status_code == 200
        # at least 2 records for this indicator in the period
        recs = [c for c in hist.json() if c["period_id"] == p["id"]]
        assert len(recs) >= 2, f"expected append-only, got {len(recs)}"

    def test_composite_ipasn(self, super_headers, indicators, periods):
        ind = self._find_ind(indicators, "1.14")
        assert ind, "1.14 not found"
        p = self._open_period(super_headers, periods)
        components = [
            {"name": "Kompetensi", "weight": 40, "score": 85},
            {"name": "Kinerja", "weight": 30, "score": 90},
            {"name": "Kualifikasi", "weight": 25, "score": 80},
            {"name": "Disiplin", "weight": 5, "score": 95},
        ]
        body = {"indicator_id": ind["id"], "period_id": p["id"], "components": components}
        r = requests.post(f"{API}/data-entries", headers=super_headers, json=body, timeout=10)
        assert r.status_code == 200, r.text
        entry_id = r.json()["id"]
        rc = requests.post(f"{API}/data-entries/{entry_id}/calculate", headers=super_headers, timeout=10)
        assert rc.status_code == 200
        # 85*.4+90*.3+80*.25+95*.05 = 34+27+20+4.75 = 85.75
        assert abs(rc.json()["result"] - 85.75) < 0.01

    def test_manual_indicator(self, super_headers, indicators, periods):
        ind = self._find_ind(indicators, "1.17")
        assert ind, "1.17 not found"
        p = self._open_period(super_headers, periods)
        body = {"indicator_id": ind["id"], "period_id": p["id"],
                "manual": {"value": 42, "source": "test"}}
        r = requests.post(f"{API}/data-entries", headers=super_headers, json=body, timeout=10)
        assert r.status_code == 200
        entry_id = r.json()["id"]
        rc = requests.post(f"{API}/data-entries/{entry_id}/calculate", headers=super_headers, timeout=10)
        assert rc.status_code == 200
        assert rc.json()["result"] == 42.0

    def test_recalculate_all(self, super_headers, periods):
        p = None
        for pp in periods:
            if pp.get("status") == "Open":
                p = pp
                break
        r = requests.post(f"{API}/recalculate-all?period_id={p['id']}", headers=super_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["count"] >= 1


# -------- Workflow --------
class TestWorkflow:
    def test_advance_workflow(self, super_headers, indicators, periods):
        # find first entry
        ind = next(i for i in indicators if i["indicator_code"] == "1.17")
        p = next(pp for pp in periods if pp.get("status") == "Open")
        # ensure entry exists
        r0 = requests.get(f"{API}/data-entries/one?indicator_id={ind['id']}&period_id={p['id']}",
                          headers=super_headers, timeout=10)
        entry = r0.json()
        assert entry, "entry should exist from prior tests"
        entry_id = entry["id"]
        # super_admin can advance through all steps
        seen = []
        for _ in range(4):
            r = requests.post(f"{API}/data-entries/{entry_id}/advance", headers=super_headers, timeout=10)
            assert r.status_code == 200, r.text
            seen.append(r.json()["status"])
        assert seen == ["submitted", "verified", "approved", "locked"]
        # can't advance further
        r = requests.post(f"{API}/data-entries/{entry_id}/advance", headers=super_headers, timeout=10)
        assert r.status_code == 400


# -------- Dashboard --------
class TestDashboard:
    def test_dashboard_shape(self, super_headers):
        r = requests.get(f"{API}/dashboard", headers=super_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("counts", "rows", "category_performance", "officer_performance", "trend"):
            assert k in d
        assert d["counts"]["total"] == 17

    def test_dashboard_filter_category(self, super_headers):
        r = requests.get(f"{API}/dashboard?category=cat1", headers=super_headers, timeout=15)
        assert r.status_code == 200


# -------- Data sources / SIPP / rules --------
class TestConfig:
    def test_data_sources(self, super_headers):
        r = requests.get(f"{API}/data-sources", headers=super_headers, timeout=10)
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_sipp_sync_501(self, super_headers):
        r = requests.post(f"{API}/sipp/sync", headers=super_headers, timeout=10)
        assert r.status_code == 501

    def test_business_rules(self, super_headers):
        r = requests.get(f"{API}/business-rules", headers=super_headers, timeout=10)
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_survey_questions(self, super_headers):
        r = requests.get(f"{API}/survey/questions", headers=super_headers, timeout=10)
        assert r.status_code == 200

    def test_mapping_crud(self, super_headers, indicators):
        ind = indicators[0]
        body = {"indicator_id": ind["id"], "source_code": "SIPP", "source_table": "t_perkara"}
        r = requests.post(f"{API}/mappings", headers=super_headers, json=body, timeout=10)
        assert r.status_code == 200
        mid = r.json()["id"]
        r2 = requests.delete(f"{API}/mappings/{mid}", headers=super_headers, timeout=10)
        assert r2.status_code == 200


# -------- Users + RBAC --------
class TestUsersAndRBAC:
    def test_users_list_super_admin(self, super_headers):
        r = requests.get(f"{API}/users", headers=super_headers, timeout=10)
        assert r.status_code == 200

    def test_create_viewer_and_rbac(self, super_headers):
        email = f"test_viewer_{int(time.time())}@example.com"
        body = {"email": email, "password": "Test@1234", "name": "TEST Viewer",
                "role": "viewer", "position": "Viewer"}
        r = requests.post(f"{API}/users", headers=super_headers, json=body, timeout=10)
        assert r.status_code == 200, r.text
        uid = r.json()["id"]

        # viewer login
        rl = requests.post(f"{API}/auth/login", json={"email": email, "password": "Test@1234"}, timeout=10)
        assert rl.status_code == 200
        vtoken = rl.json()["access_token"]
        vh = {"Authorization": f"Bearer {vtoken}", "Content-Type": "application/json"}

        # viewer cannot create indicator
        rc = requests.post(f"{API}/indicators", headers=vh, json={
            "indicator_code": "TEST_X", "indicator_name": "x", "indicator_type": "output",
            "calculation_type": "percentage"}, timeout=10)
        assert rc.status_code == 403

        # viewer cannot list users
        ru = requests.get(f"{API}/users", headers=vh, timeout=10)
        assert ru.status_code == 403

        # viewer cannot input data
        ri = requests.post(f"{API}/data-entries", headers=vh, json={
            "indicator_id": "x", "period_id": "y"}, timeout=10)
        assert ri.status_code == 403

        # cleanup
        requests.delete(f"{API}/users/{uid}", headers=super_headers, timeout=10)

    def test_cannot_delete_self(self, super_headers):
        me = requests.get(f"{API}/auth/me", headers=super_headers, timeout=10).json()
        r = requests.delete(f"{API}/users/{me['id']}", headers=super_headers, timeout=10)
        assert r.status_code == 400


# -------- Audit --------
class TestAudit:
    def test_audit_logs(self, super_headers):
        r = requests.get(f"{API}/audit-logs?limit=20", headers=super_headers, timeout=10)
        assert r.status_code == 200
        logs = r.json()
        actions = {l["action"] for l in logs}
        # LOGIN should be there (we logged in)
        assert "LOGIN" in actions or "CREATE" in actions
