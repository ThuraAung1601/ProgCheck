"""
Integration tests for authentication routes (src/routes/auth.py).

Strategy: the ZODB DatabaseContext is patched so that every request
operates on an isolated in-memory FakeDB instance.  No file-system
or network IO takes place.

Requirements traced:
  UFR-1  register / login
  UFR-2  logout (token invalidation is client-side; tested at API level)
  SFR-1  system manages user accounts
  SFR-2  role-based access enforcement
  SNFR-4 injection safety (invalid role rejected)
  SNFR-11 no credential leakage
"""
import sys
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
from datetime import datetime
from contextlib import contextmanager

ROOT = Path(__file__).resolve().parents[2]
SRC  = ROOT / "src"
for p in (str(ROOT), str(SRC)):
    if p not in sys.path:
        sys.path.insert(0, p)

from fastapi.testclient import TestClient

# ── Build a minimal FastAPI app that only mounts the auth router ──────────────

from fastapi import FastAPI
from src.routes import auth as auth_module

_app = FastAPI()
_app.include_router(auth_module.router)
client = TestClient(_app)


# ── Helpers ───────────────────────────────────────────────────────────────────

class _FakeSettings:
    theme = "light"; auto_save = True; email_alerts = True
    display_name = ""; email = ""; phone = ""


class _FakeUser:
    def __init__(self, uid, name, pw):
        import bcrypt
        self.settings  = _FakeSettings()
        self.name      = name
        self.password  = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

    def verify_password(self, pw):
        import bcrypt
        return bcrypt.checkpw(pw.encode(), self.password.encode())


class _FakeDB:
    def __init__(self):
        self.students = {}
        self.teachers = {}


def _make_ctx(db):
    """Return a context-manager that yields db."""
    @contextmanager
    def _ctx():
        yield db
    return _ctx


# ── Fixture: patch DatabaseContext + model constructors ───────────────────────

@pytest.fixture
def fakedb():
    return _FakeDB()


@pytest.fixture(autouse=True)
def patch_db(fakedb):
    """Redirect every DatabaseContext call to our in-memory FakeDB."""
    ctx = _make_ctx(fakedb)
    with patch.object(auth_module, "DatabaseContext", ctx), \
         patch.object(auth_module, "commit_changes", lambda: None):
        # Also patch the model constructors so they produce _FakeUser objects
        # that accept the same args as the real Student/Teacher classes.
        with patch.object(auth_module, "Student",
                          side_effect=lambda uid, name, pw: _FakeUser(uid, name, pw)), \
             patch.object(auth_module, "Teacher",
                          side_effect=lambda uid, name, pw: _FakeUser(uid, name, pw)):
            yield fakedb


# ─────────────────────────────────────────────────────────────────────────────
# Registration
# ─────────────────────────────────────────────────────────────────────────────

class TestRegister:
    def test_register_student_success(self, fakedb):
        """UFR-1, SFR-1: new student registration returns 200 with token."""
        resp = client.post("/api/auth/register", json={
            "username": "alice", "password": "pass123",
            "role": "student", "student_id": "STU001",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["user"]["role"]     == "student"
        assert body["user"]["username"] == "alice"
        assert "token" in body
        assert len(body["token"]) > 0
        assert "STU001" in fakedb.students

    def test_register_teacher_success(self, fakedb):
        resp = client.post("/api/auth/register", json={
            "username": "prof_bob", "password": "tpass",
            "role": "teacher", "teacher_id": "TCH001",
        })
        assert resp.status_code == 200
        assert fakedb.teachers.get("TCH001") is not None

    def test_register_student_missing_id(self):
        """SFR-1: student_id is mandatory for student role."""
        resp = client.post("/api/auth/register", json={
            "username": "alice", "password": "pass",
            "role": "student",
            # no student_id
        })
        assert resp.status_code == 400

    def test_register_teacher_missing_id(self):
        resp = client.post("/api/auth/register", json={
            "username": "prof", "password": "pass",
            "role": "teacher",
            # no teacher_id
        })
        assert resp.status_code == 400

    def test_register_invalid_role(self):
        """SFR-2, SNFR-4: unknown role is rejected."""
        resp = client.post("/api/auth/register", json={
            "username": "hacker", "password": "pw",
            "role": "admin",
        })
        assert resp.status_code == 400

    def test_register_duplicate_student(self, fakedb):
        """SFR-1: second registration with same ID returns 409 Conflict."""
        payload = {
            "username": "alice", "password": "pass",
            "role": "student", "student_id": "STU001",
        }
        client.post("/api/auth/register", json=payload)
        resp = client.post("/api/auth/register", json=payload)
        assert resp.status_code == 409

    def test_register_duplicate_teacher(self, fakedb):
        payload = {
            "username": "prof", "password": "pass",
            "role": "teacher", "teacher_id": "TCH001",
        }
        client.post("/api/auth/register", json=payload)
        resp = client.post("/api/auth/register", json=payload)
        assert resp.status_code == 409

    def test_token_is_unique_per_registration(self, fakedb):
        """SNFR-3: each registration produces a distinct token."""
        def _reg(uid, tid):
            return client.post("/api/auth/register", json={
                "username": uid, "password": "pw",
                "role": "teacher", "teacher_id": tid,
            }).json()["token"]
        t1 = _reg("p1", "TCH001")
        t2 = _reg("p2", "TCH002")
        assert t1 != t2

    def test_response_does_not_expose_password_hash(self, fakedb):
        """SNFR-11: password hash must not appear in response body."""
        resp = client.post("/api/auth/register", json={
            "username": "alice", "password": "secret",
            "role": "student", "student_id": "STU001",
        })
        body = resp.text
        assert "secret" not in body
        assert "$2b$" not in body        # bcrypt prefix


# ─────────────────────────────────────────────────────────────────────────────
# Login
# ─────────────────────────────────────────────────────────────────────────────

class TestLogin:
    @pytest.fixture(autouse=True)
    def seed_users(self, fakedb):
        fakedb.students["STU001"] = _FakeUser("STU001", "alice", "pass123")
        fakedb.teachers["TCH001"] = _FakeUser("TCH001", "prof_bob", "tpass")

    def test_student_login_success(self):
        """UFR-1: valid student credentials return 200 with token."""
        resp = client.post("/api/auth/login/student", json={
            "username": "alice", "password": "pass123",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["user"]["role"] == "student"
        assert "token" in body

    def test_teacher_login_success(self):
        resp = client.post("/api/auth/login/teacher", json={
            "username": "prof_bob", "password": "tpass",
        })
        assert resp.status_code == 200
        assert resp.json()["user"]["role"] == "teacher"

    def test_login_wrong_password(self):
        """UFR-1: incorrect password returns 401."""
        resp = client.post("/api/auth/login/student", json={
            "username": "alice", "password": "wrongpass",
        })
        assert resp.status_code == 401

    def test_login_unknown_username(self):
        resp = client.post("/api/auth/login/student", json={
            "username": "ghost", "password": "pw",
        })
        assert resp.status_code == 401

    def test_student_cannot_login_as_teacher(self):
        """SFR-2: student credentials rejected on teacher endpoint."""
        resp = client.post("/api/auth/login/teacher", json={
            "username": "alice", "password": "pass123",
        })
        assert resp.status_code == 401

    def test_login_response_structure(self):
        resp = client.post("/api/auth/login/student", json={
            "username": "alice", "password": "pass123",
        })
        body = resp.json()
        assert "user" in body
        assert "token" in body
        user = body["user"]
        for field in ("id", "username", "role"):
            assert field in user, f"Missing field: {field}"
