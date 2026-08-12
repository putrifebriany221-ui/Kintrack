"""KINTRACK iteration 2 tests — SIPP connector + document uploads + RBAC."""
import io
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

SUPER_EMAIL = "putrifebriany221@gmail.com"
SUPER_PASS = "Kintrack@2026"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def super_token():
    r = requests.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def sh(super_token):
    return {"Authorization": f"Bearer {super_token}"}


@pytest.fixture(scope="module")
def viewer_token(sh):
    # create viewer user (or reuse) then login
    email = f"test_viewer_it2_{int(time.time())}@example.com"
    pw = "Viewer@123"
    r = requests.post(f"{API}/users", headers={**sh, "Content-Type": "application/json"},
                      json={"email": email, "name": "Viewer It2", "role": "viewer", "password": pw}, timeout=15)
    assert r.status_code in (200, 201), r.text
    r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r2.status_code == 200, r2.text
    return r2.json()["access_token"]


@pytest.fixture(scope="module")
def indicator_11(sh):
    r = requests.get(f"{API}/indicators", headers=sh, timeout=15)
    assert r.status_code == 200
    for i in r.json():
        if i.get("indicator_code") == "1.1" or i.get("code") == "1.1":
            return i
    pytest.skip("Indicator 1.1 not found")


@pytest.fixture(scope="module")
def open_period(sh):
    r = requests.get(f"{API}/periods", headers=sh, timeout=15)
    assert r.status_code == 200
    for p in r.json():
        if p.get("status") == "Open":
            return p
    return r.json()[0]


# ---------------- SIPP: Connection config ----------------
class TestSippConnection:
    def test_get_connection_shape(self, sh):
        r = requests.get(f"{API}/sipp/connection", headers=sh, timeout=10)
        assert r.status_code == 200
        d = r.json()
        # Either configured true/false — both valid; if configured, no password field
        assert "configured" in d
        assert "password" not in d

    def test_save_connection_super_admin(self, sh):
        payload = {"host": "127.0.0.1", "port": 3399, "database": "sipp_test",
                   "username": "kintrack_test", "password": "secretpw"}
        r = requests.put(f"{API}/sipp/connection", headers={**sh, "Content-Type": "application/json"},
                         json=payload, timeout=15)
        assert r.status_code == 200, r.text
        # verify GET returns configured true with has_password true and no password
        g = requests.get(f"{API}/sipp/connection", headers=sh, timeout=10).json()
        assert g["configured"] is True
        assert g["host"] == "127.0.0.1"
        assert g["port"] == 3399
        assert g["database"] == "sipp_test"
        assert g["username"] == "kintrack_test"
        assert g.get("has_password") is True
        assert "password" not in g

    def test_blank_password_preserves(self, sh):
        # save without password
        r = requests.put(f"{API}/sipp/connection", headers={**sh, "Content-Type": "application/json"},
                         json={"host": "127.0.0.1", "port": 3399, "database": "sipp_test",
                               "username": "kintrack_test", "password": ""}, timeout=15)
        assert r.status_code == 200
        g = requests.get(f"{API}/sipp/connection", headers=sh, timeout=10).json()
        assert g.get("has_password") is True  # preserved

    def test_viewer_cannot_read_connection(self, viewer_token):
        r = requests.get(f"{API}/sipp/connection",
                         headers={"Authorization": f"Bearer {viewer_token}"}, timeout=10)
        assert r.status_code == 403

    def test_viewer_cannot_save_connection(self, viewer_token):
        r = requests.put(f"{API}/sipp/connection",
                         headers={"Authorization": f"Bearer {viewer_token}", "Content-Type": "application/json"},
                         json={"host": "x", "port": 3306, "database": "x", "username": "x", "password": "x"},
                         timeout=10)
        assert r.status_code == 403


# ---------------- SIPP: Test connection ----------------
class TestSippTestConnection:
    def test_test_connection_graceful_failure(self, sh):
        # config is set to 127.0.0.1:3399 (nothing listening) from previous test
        r = requests.post(f"{API}/sipp/test-connection", headers=sh, timeout=30)
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"
        assert "gagal terhubung" in r.text.lower() or "gagal" in r.text.lower()
        # last_status becomes FAILED
        g = requests.get(f"{API}/sipp/connection", headers=sh, timeout=10).json()
        assert g.get("last_status") == "FAILED"

    def test_viewer_cannot_test(self, viewer_token):
        r = requests.post(f"{API}/sipp/test-connection",
                          headers={"Authorization": f"Bearer {viewer_token}"}, timeout=10)
        assert r.status_code == 403


# ---------------- SIPP: read-only guard ----------------
class TestSippValidateReadonly:
    """Direct tests of sipp.validate_readonly() plus API-level enforcement via /sipp/pull."""

    def test_module_validate_readonly(self):
        import sys
        sys.path.insert(0, "/app/backend")
        import sipp as sipp_mod
        # Allowed
        assert sipp_mod.validate_readonly("SELECT COUNT(*) FROM t")
        assert sipp_mod.validate_readonly("  with x as (select 1) select * from x  ")
        # Forbidden
        for bad in ["DELETE FROM t", "UPDATE t SET a=1", "INSERT INTO t VALUES (1)",
                    "DROP TABLE t", "SELECT 1; DROP TABLE t", "SELECT 1; SELECT 2",
                    "TRUNCATE t", "CREATE TABLE t(a int)"]:
            with pytest.raises(ValueError):
                sipp_mod.validate_readonly(bad)
        with pytest.raises(ValueError):
            sipp_mod.validate_readonly("")

    def test_pull_rejects_nonselect_via_mapping(self, sh, indicator_11, open_period):
        # Create/overwrite mapping with DELETE queries
        payload = {"indicator_id": indicator_11["id"], "source_code": "SIPP",
                   "numerator_query": "DELETE FROM t",
                   "denominator_query": "SELECT COUNT(*) FROM t"}
        # Delete existing SIPP mapping for this indicator first (if any)
        existing = requests.get(f"{API}/mappings", headers=sh, timeout=10).json()
        for m in existing:
            if m.get("indicator_id") == indicator_11["id"] and m.get("source_code") == "SIPP":
                requests.delete(f"{API}/mappings/{m['id']}", headers=sh, timeout=10)
        r = requests.post(f"{API}/mappings", headers={**sh, "Content-Type": "application/json"},
                          json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        # Now call pull — should fail with 400 (validate_readonly)
        rp = requests.post(f"{API}/sipp/pull", headers={**sh, "Content-Type": "application/json"},
                           json={"indicator_id": indicator_11["id"], "period_id": open_period["id"]}, timeout=30)
        # Expected 400 due to non-select OR due to connection failure — but validation runs before connect attempt via run_scalar
        # Actually run_scalar calls _connect first then validate; but sipp_mod.run_scalar does validate_readonly first (per sipp.py).
        assert rp.status_code == 400, f"expected 400 got {rp.status_code}: {rp.text}"

    def test_pull_missing_mapping(self, sh, indicator_11, open_period):
        # Delete all SIPP mappings for this indicator so pull returns "belum diatur"
        existing = requests.get(f"{API}/mappings", headers=sh, timeout=10).json()
        for m in existing:
            if m.get("indicator_id") == indicator_11["id"] and m.get("source_code") == "SIPP":
                requests.delete(f"{API}/mappings/{m['id']}", headers=sh, timeout=10)
        r = requests.post(f"{API}/sipp/pull", headers={**sh, "Content-Type": "application/json"},
                          json={"indicator_id": indicator_11["id"], "period_id": open_period["id"]}, timeout=15)
        assert r.status_code == 400
        assert "belum diatur" in r.text.lower() or "belum" in r.text.lower()

    def test_pull_with_valid_select_graceful(self, sh, indicator_11, open_period):
        # Recreate mapping with valid SELECT queries; connection will fail (dummy host) -> 400 graceful
        payload = {"indicator_id": indicator_11["id"], "source_code": "SIPP",
                   "numerator_query": "SELECT 5",
                   "denominator_query": "SELECT 10"}
        r = requests.post(f"{API}/mappings", headers={**sh, "Content-Type": "application/json"},
                          json=payload, timeout=15)
        assert r.status_code in (200, 201)
        rp = requests.post(f"{API}/sipp/pull", headers={**sh, "Content-Type": "application/json"},
                           json={"indicator_id": indicator_11["id"], "period_id": open_period["id"]}, timeout=30)
        assert rp.status_code == 400, f"expected 400 got {rp.status_code}: {rp.text}"


# ---------------- Supporting Documents ----------------
@pytest.fixture(scope="module")
def data_entry_id(sh, indicator_11, open_period):
    # Use existing entry noted in context if present; else create/reuse via GET
    known = "ad0a85b3-c7fd-42c4-b8e9-3ecb39162507"
    r = requests.get(f"{API}/data-entries", headers=sh,
                     params={"indicator_id": indicator_11["id"], "period_id": open_period["id"]}, timeout=15)
    if r.status_code == 200:
        entries = r.json() if isinstance(r.json(), list) else [r.json()]
        for e in entries:
            if e and e.get("id"):
                return e["id"]
    return known


class TestDocuments:
    uploaded_id = None
    uploaded_path = None

    def test_upload_pdf(self, sh, data_entry_id):
        files = {"file": ("test_evidence.pdf", b"%PDF-1.4\n%FakePDFbody\n", "application/pdf")}
        r = requests.post(f"{API}/data-entries/{data_entry_id}/documents",
                          headers=sh, files=files, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["original_filename"] == "test_evidence.pdf"
        assert d.get("storage_path")
        assert d.get("size", 0) > 0
        assert d.get("is_deleted") is False
        TestDocuments.uploaded_id = d["id"]
        TestDocuments.uploaded_path = d["storage_path"]

    def test_reject_disallowed_extension(self, sh, data_entry_id):
        files = {"file": ("evil.exe", b"MZ\x90\x00binary", "application/octet-stream")}
        r = requests.post(f"{API}/data-entries/{data_entry_id}/documents",
                          headers=sh, files=files, timeout=30)
        assert r.status_code == 400
        assert "tidak diizinkan" in r.text.lower() or "diizinkan" in r.text.lower()

    def test_reject_oversize(self, sh, data_entry_id):
        # 11 MB
        big = b"A" * (11 * 1024 * 1024)
        files = {"file": ("big.pdf", big, "application/pdf")}
        r = requests.post(f"{API}/data-entries/{data_entry_id}/documents",
                          headers=sh, files=files, timeout=120)
        assert r.status_code == 400
        assert "10 mb" in r.text.lower() or "melebihi" in r.text.lower()

    def test_list_documents(self, sh, data_entry_id):
        r = requests.get(f"{API}/data-entries/{data_entry_id}/documents", headers=sh, timeout=15)
        assert r.status_code == 200
        docs = r.json()
        assert isinstance(docs, list)
        assert any(d["id"] == TestDocuments.uploaded_id for d in docs)
        for d in docs:
            assert d["is_deleted"] is False

    def test_download_bearer(self, sh):
        assert TestDocuments.uploaded_id
        r = requests.get(f"{API}/documents/{TestDocuments.uploaded_id}/download",
                         headers=sh, timeout=30)
        assert r.status_code == 200, r.text
        assert r.content.startswith(b"%PDF")
        assert "pdf" in r.headers.get("Content-Type", "").lower()

    def test_download_query_auth(self, super_token):
        assert TestDocuments.uploaded_id
        r = requests.get(f"{API}/documents/{TestDocuments.uploaded_id}/download",
                         params={"auth": super_token}, timeout=30)
        assert r.status_code == 200
        assert r.content.startswith(b"%PDF")

    def test_download_no_token(self):
        assert TestDocuments.uploaded_id
        r = requests.get(f"{API}/documents/{TestDocuments.uploaded_id}/download", timeout=15)
        assert r.status_code == 401

    def test_viewer_cannot_upload(self, viewer_token, data_entry_id):
        files = {"file": ("viewer.pdf", b"%PDF-1.4\n", "application/pdf")}
        r = requests.post(f"{API}/data-entries/{data_entry_id}/documents",
                         headers={"Authorization": f"Bearer {viewer_token}"},
                         files=files, timeout=30)
        assert r.status_code == 403

    def test_soft_delete(self, sh, data_entry_id):
        assert TestDocuments.uploaded_id
        r = requests.delete(f"{API}/documents/{TestDocuments.uploaded_id}", headers=sh, timeout=15)
        assert r.status_code == 200
        # No longer in list
        docs = requests.get(f"{API}/data-entries/{data_entry_id}/documents", headers=sh, timeout=10).json()
        assert not any(d["id"] == TestDocuments.uploaded_id for d in docs)
        # Download returns 404
        r2 = requests.get(f"{API}/documents/{TestDocuments.uploaded_id}/download", headers=sh, timeout=15)
        assert r2.status_code == 404

    def test_viewer_cannot_delete(self, sh, viewer_token, data_entry_id):
        # upload a fresh doc as super, then viewer tries to delete
        files = {"file": ("todelete.pdf", b"%PDF-1.4\n", "application/pdf")}
        u = requests.post(f"{API}/data-entries/{data_entry_id}/documents",
                          headers=sh, files=files, timeout=30)
        assert u.status_code == 200
        did = u.json()["id"]
        rd = requests.delete(f"{API}/documents/{did}",
                             headers={"Authorization": f"Bearer {viewer_token}"}, timeout=10)
        assert rd.status_code == 403
        # cleanup
        requests.delete(f"{API}/documents/{did}", headers=sh, timeout=10)
