"""Iteration 3 — tests for new SIPP desktop-bridge endpoints and regression checks.
Covers: /sipp/test-connection improved error, /sipp/connection/full,
/sipp/pull-values, /sipp/pull regression, /download/windows regression.
"""
import os
import time
import pytest
import requests
from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "putrifebriany221@gmail.com"
ADMIN_PASS = "Kintrack@2026"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def viewer_token(admin_h):
    ts = int(time.time())
    email = f"test_viewer_it3_{ts}@example.com"
    payload = {"email": email, "name": "Viewer It3", "password": "ViewerPass1!", "role": "viewer", "active": True}
    r = requests.post(f"{API}/users", json=payload, headers=admin_h, timeout=30)
    assert r.status_code in (200, 201), r.text
    r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": "ViewerPass1!"}, timeout=30)
    assert r2.status_code == 200, r2.text
    return r2.json()["access_token"]


@pytest.fixture(scope="module")
def viewer_h(viewer_token):
    return {"Authorization": f"Bearer {viewer_token}"}


# ----- 1. Unreachable host -> 400 with improved Indonesian message containing 2003 -----
def test_sipp_test_connection_returns_400_with_helpful_indonesian_message(admin_h):
    r = requests.post(f"{API}/sipp/test-connection", headers=admin_h, timeout=60)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    detail = r.json().get("detail", "")
    # Must contain 2003 and mention actionable guidance keywords
    assert "2003" in detail, f"detail missing 2003: {detail}"
    lower = detail.lower()
    # At least one guidance keyword: desktop, bind-address, firewall, 10.x, 192.168, private
    assert any(k in lower for k in ["desktop", "bind-address", "firewall", "10.x", "192.168", "internal"]), detail


# ----- 2. GET /sipp/connection/full -----
def test_sipp_connection_full_admin(admin_h):
    r = requests.get(f"{API}/sipp/connection/full", headers=admin_h, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    for k in ("host", "port", "database", "username", "password"):
        assert k in body, f"missing key {k}"
    # Sanity: password is a string (may be empty)
    assert isinstance(body["password"], str)


def test_sipp_connection_full_viewer_forbidden(viewer_h):
    r = requests.get(f"{API}/sipp/connection/full", headers=viewer_h, timeout=30)
    assert r.status_code == 403, r.text


# ----- 3. POST /sipp/pull-values -----
def _find_indicator_by_code(admin_h, code):
    r = requests.get(f"{API}/indicators", headers=admin_h, timeout=30)
    assert r.status_code == 200
    for i in r.json():
        if i.get("indicator_code") == code or i.get("code") == code:
            return i
    return None


def _find_period(admin_h, year, status_filter=None):
    r = requests.get(f"{API}/periods", headers=admin_h, timeout=30)
    assert r.status_code == 200
    for p in r.json():
        if p.get("year") == year:
            if status_filter is None or p.get("status") == status_filter:
                return p
    return None


@pytest.fixture(scope="module")
def indicator_1_1(admin_h):
    ind = _find_indicator_by_code(admin_h, "1.1")
    assert ind, "Indicator 1.1 missing"
    return ind


@pytest.fixture(scope="module")
def open_period_2026(admin_h):
    p = _find_period(admin_h, 2026, "Open")
    if not p:
        p = _find_period(admin_h, 2026)
    assert p, "No 2026 period found"
    return p


def test_pull_values_stores_and_get_returns(admin_h, indicator_1_1, open_period_2026):
    payload = {"indicator_id": indicator_1_1["id"], "period_id": open_period_2026["id"],
               "numerator": 42, "denominator": 100}
    r = requests.post(f"{API}/sipp/pull-values", json=payload, headers=admin_h, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True and body["numerator"] == 42 and body["denominator"] == 100
    # Verify persisted with source 'SIPP (desktop)'
    r2 = requests.get(f"{API}/data-entries/one",
                      params={"indicator_id": indicator_1_1["id"], "period_id": open_period_2026["id"]},
                      headers=admin_h, timeout=30)
    assert r2.status_code == 200, r2.text
    d = r2.json()
    assert d.get("numerator", {}).get("value") == 42
    assert d.get("denominator", {}).get("value") == 100
    assert "desktop" in (d.get("numerator", {}).get("source", "") or "").lower()


def test_pull_values_viewer_forbidden(viewer_h, indicator_1_1, open_period_2026):
    payload = {"indicator_id": indicator_1_1["id"], "period_id": open_period_2026["id"],
               "numerator": 1, "denominator": 2}
    r = requests.post(f"{API}/sipp/pull-values", json=payload, headers=viewer_h, timeout=30)
    assert r.status_code == 403, r.text


def test_pull_values_locked_period_admin_role_returns_400(admin_h, indicator_1_1):
    # Need an admin (non-super) to test 'Periode terkunci' — create one
    ts = int(time.time())
    email = f"test_admin_it3_{ts}@example.com"
    payload = {"email": email, "name": "Admin It3", "password": "AdminPass1!", "role": "admin_operator", "active": True}
    ru = requests.post(f"{API}/users", json=payload, headers=admin_h, timeout=30)
    assert ru.status_code in (200, 201), ru.text
    rl = requests.post(f"{API}/auth/login", json={"email": email, "password": "AdminPass1!"}, timeout=30)
    assert rl.status_code == 200
    admin_role_h = {"Authorization": f"Bearer {rl.json()['access_token']}"}
    locked = _find_period(admin_h, 2024, "Locked")
    if not locked:
        pytest.skip("No Locked 2024 period exists")
    r = requests.post(f"{API}/sipp/pull-values",
                      json={"indicator_id": indicator_1_1["id"], "period_id": locked["id"],
                            "numerator": 1, "denominator": 2},
                      headers=admin_role_h, timeout=30)
    assert r.status_code == 400, r.text
    assert "terkunci" in r.json().get("detail", "").lower()


def test_pull_values_bad_indicator_returns_404(admin_h, open_period_2026):
    r = requests.post(f"{API}/sipp/pull-values",
                      json={"indicator_id": "no-such-id", "period_id": open_period_2026["id"],
                            "numerator": 1, "denominator": 2},
                      headers=admin_h, timeout=30)
    assert r.status_code == 404, r.text


# ----- 4. Regression: /sipp/pull -----
def test_sipp_pull_no_mapping_400(admin_h, open_period_2026):
    # Find an indicator that has no SIPP mapping
    inds = requests.get(f"{API}/indicators", headers=admin_h, timeout=30).json()
    target = None
    for i in inds:
        r = requests.get(f"{API}/mappings",
                         params={"indicator_id": i["id"]}, headers=admin_h, timeout=30)
        if r.status_code == 200:
            maps = r.json()
            if not any(m.get("source_code") == "SIPP" for m in maps):
                target = i
                break
    if not target:
        pytest.skip("All indicators have SIPP mapping")
    r = requests.post(f"{API}/sipp/pull",
                      json={"indicator_id": target["id"], "period_id": open_period_2026["id"]},
                      headers=admin_h, timeout=30)
    assert r.status_code == 400
    assert "belum diatur" in r.json().get("detail", "").lower()


# ----- 5. Regression: /download/windows -----
def test_download_windows_head_ok():
    r = requests.head(f"{API}/download/windows", timeout=30, allow_redirects=True)
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("application/zip")
    cd = r.headers.get("content-disposition", "")
    assert "attachment" in cd.lower() and "KINTRACK-Windows-x64.zip" in cd


# ----- 6. Regression: login / dashboard / indicators / data entry save+calc -----
def test_dashboard_summary_ok(admin_h):
    r = requests.get(f"{API}/dashboard", headers=admin_h, timeout=30)
    assert r.status_code == 200


def test_indicators_list_ok(admin_h):
    r = requests.get(f"{API}/indicators", headers=admin_h, timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json(), list) and len(r.json()) > 0


def test_data_entry_save_and_calculate(admin_h, indicator_1_1, open_period_2026):
    # save entry (percentage type)
    payload = {
        "indicator_id": indicator_1_1["id"],
        "period_id": open_period_2026["id"],
        "numerator": {"value": 50, "definition": "n", "source": "MANUAL", "input_date": "2026-01-01"},
        "denominator": {"value": 200, "definition": "d", "source": "MANUAL", "input_date": "2026-01-01"},
    }
    r = requests.post(f"{API}/data-entries", json=payload, headers=admin_h, timeout=30)
    assert r.status_code in (200, 201), r.text
    entry = r.json()
    entry_id = entry.get("id") or entry.get("entry_id")
    assert entry_id
    # calculate
    rc = requests.post(f"{API}/data-entries/{entry_id}/calculate", headers=admin_h, timeout=30)
    assert rc.status_code == 200, rc.text
    body = rc.json()
    # value expected 25 (%)
    val = body.get("result")
    assert val is not None
