"""
Integration tests for settings routes (src/routes/settings.py).

Strategy: DatabaseContext and commit_changes are patched so tests run
entirely in memory with no file-system or network access.

Requirements traced:
  UFR-1   user profile management (display name, theme, tab size, auto-save)
  SFR-1   system manages user accounts and settings
  SFR-2   role-based lookup (student vs teacher)
  SNFR-11 security — old password must be verified before change
"""
import sys
import pytest
from pathlib import Path
from datetime import datetime
from contextlib import contextmanager
from unittest.mock import patch, MagicMock

ROOT = Path(__file__).resolve().parents[2]
SRC  = ROOT / "src"
for p in (str(ROOT), str(SRC)):
    if p not in sys.path:
        sys.path.insert(0, p)

from fastapi import FastAPI
from fastapi.testclient import TestClient
from src.routes import settings as settings_module

_app = FastAPI()
_app.include_router(settings_module.router)
client = TestClient(_app)


# ── In-memory helpers ─────────────────────────────────────────────────────────

class _FakeSettings:
    def __init__(self):
        self.theme        = "light"
        self.auto_save    = True
        self.email_alerts = True
        self.display_name = "Test User"
        self.email        = "test@example.com"
        self.phone        = ""
        self.tab_size     = 2
        self.updated_at   = datetime.now()


class _FakeUser:
    """Minimal user stub shared by student and teacher roles."""
    def __init__(self, uid, pw="correctpass"):
        import bcrypt
        self.student_id  = uid
        self.teacher_id  = uid
        self.settings    = _FakeSettings()
        self.password    = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
        self.updated_at  = datetime.now()
        self._p_changed  = False

    def verify_password(self, pw: str) -> bool:
        import bcrypt
        return bcrypt.checkpw(pw.encode(), self.password.encode())

    def update_password(self, new_pw: str) -> None:
        import bcrypt
        self.password = bcrypt.hashpw(new_pw.encode(), bcrypt.gensalt()).decode()


class _FakeDB:
    def __init__(self, student=None, teacher=None):
        self.students = {}
        self.teachers = {}
        if student:
            self.students[student.student_id] = student
        if teacher:
            self.teachers[teacher.teacher_id] = teacher


def _make_ctx(db):
    @contextmanager
    def _ctx():
        yield db
    return _ctx


def _patch(db):
    """Return a context manager that patches database access for settings routes."""
    return patch.multiple(
        "src.routes.settings",
        DatabaseContext=_make_ctx(db),
        commit_changes=MagicMock(),
    )


# ── GET /api/settings/profile/{user_id} ──────────────────────────────────────

class TestGetSettings:

    def test_student_returns_200_with_all_fields(self):
        student = _FakeUser("STU001")
        with _patch(_FakeDB(student=student)):
            r = client.get("/api/settings/profile/STU001?role=student")
        assert r.status_code == 200
        body = r.json()
        assert body["theme"]        == "light"
        assert body["auto_save"]    is True
        assert body["email_alerts"] is True
        assert body["display_name"] == "Test User"
        assert body["email"]        == "test@example.com"
        assert body["tab_size"]     == 2

    def test_teacher_returns_200(self):
        teacher = _FakeUser("TCH001")
        with _patch(_FakeDB(teacher=teacher)):
            r = client.get("/api/settings/profile/TCH001?role=teacher")
        assert r.status_code == 200
        assert r.json()["theme"] == "light"

    def test_nonexistent_student_returns_404(self):
        with _patch(_FakeDB()):
            r = client.get("/api/settings/profile/GHOST?role=student")
        assert r.status_code == 404

    def test_nonexistent_teacher_returns_404(self):
        with _patch(_FakeDB()):
            r = client.get("/api/settings/profile/GHOST?role=teacher")
        assert r.status_code == 404

    def test_tab_size_4_returned_correctly(self):
        student = _FakeUser("STU002")
        student.settings.tab_size = 4
        with _patch(_FakeDB(student=student)):
            r = client.get("/api/settings/profile/STU002?role=student")
        assert r.json()["tab_size"] == 4

    def test_custom_email_returned(self):
        student = _FakeUser("STU003")
        student.settings.email = "alert@custom.com"
        with _patch(_FakeDB(student=student)):
            r = client.get("/api/settings/profile/STU003?role=student")
        assert r.json()["email"] == "alert@custom.com"


# ── PUT /api/settings/profile/{user_id} ──────────────────────────────────────

class TestUpdateSettings:

    def test_update_display_name_persisted(self):
        student = _FakeUser("STU001")
        with _patch(_FakeDB(student=student)):
            r = client.put(
                "/api/settings/profile/STU001?role=student",
                json={"display_name": "Alice"},
            )
        assert r.status_code == 200
        assert r.json()["display_name"] == "Alice"
        assert student.settings.display_name == "Alice"

    def test_update_theme_to_dark(self):
        student = _FakeUser("STU001")
        with _patch(_FakeDB(student=student)):
            r = client.put(
                "/api/settings/profile/STU001?role=student",
                json={"theme": "dark"},
            )
        assert r.status_code == 200
        assert r.json()["theme"] == "dark"

    def test_update_theme_to_light(self):
        student = _FakeUser("STU001")
        student.settings.theme = "dark"
        with _patch(_FakeDB(student=student)):
            r = client.put(
                "/api/settings/profile/STU001?role=student",
                json={"theme": "light"},
            )
        assert r.status_code == 200
        assert r.json()["theme"] == "light"

    def test_invalid_theme_returns_400(self):
        student = _FakeUser("STU001")
        with _patch(_FakeDB(student=student)):
            r = client.put(
                "/api/settings/profile/STU001?role=student",
                json={"theme": "pink"},
            )
        assert r.status_code == 400

    def test_update_tab_size_4(self):
        student = _FakeUser("STU001")
        with _patch(_FakeDB(student=student)):
            r = client.put(
                "/api/settings/profile/STU001?role=student",
                json={"tab_size": 4},
            )
        assert r.status_code == 200
        assert r.json()["tab_size"] == 4

    def test_invalid_tab_size_returns_400(self):
        student = _FakeUser("STU001")
        with _patch(_FakeDB(student=student)):
            r = client.put(
                "/api/settings/profile/STU001?role=student",
                json={"tab_size": 3},
            )
        assert r.status_code == 400

    def test_disable_email_alerts(self):
        student = _FakeUser("STU001")
        with _patch(_FakeDB(student=student)):
            r = client.put(
                "/api/settings/profile/STU001?role=student",
                json={"email_alerts": False},
            )
        assert r.status_code == 200
        assert r.json()["email_alerts"] is False
        assert student.settings.email_alerts is False

    def test_enable_email_alerts(self):
        student = _FakeUser("STU001")
        student.settings.email_alerts = False
        with _patch(_FakeDB(student=student)):
            r = client.put(
                "/api/settings/profile/STU001?role=student",
                json={"email_alerts": True},
            )
        assert r.status_code == 200
        assert r.json()["email_alerts"] is True

    def test_update_notification_email(self):
        student = _FakeUser("STU001")
        with _patch(_FakeDB(student=student)):
            r = client.put(
                "/api/settings/profile/STU001?role=student",
                json={"email": "newalert@example.com"},
            )
        assert r.status_code == 200
        assert r.json()["email"] == "newalert@example.com"
        assert student.settings.email == "newalert@example.com"

    def test_update_auto_save_false(self):
        student = _FakeUser("STU001")
        with _patch(_FakeDB(student=student)):
            r = client.put(
                "/api/settings/profile/STU001?role=student",
                json={"auto_save": False},
            )
        assert r.status_code == 200
        assert r.json()["auto_save"] is False

    def test_partial_update_preserves_other_fields(self):
        """Updating only display_name must not reset theme or auto_save."""
        student = _FakeUser("STU001")
        student.settings.theme     = "dark"
        student.settings.auto_save = False
        with _patch(_FakeDB(student=student)):
            r = client.put(
                "/api/settings/profile/STU001?role=student",
                json={"display_name": "Bob"},
            )
        assert r.status_code == 200
        body = r.json()
        assert body["theme"]     == "dark"
        assert body["auto_save"] is False

    def test_nonexistent_user_returns_404(self):
        with _patch(_FakeDB()):
            r = client.put(
                "/api/settings/profile/GHOST?role=student",
                json={"theme": "dark"},
            )
        assert r.status_code == 404

    def test_teacher_update_returns_200(self):
        teacher = _FakeUser("TCH001")
        with _patch(_FakeDB(teacher=teacher)):
            r = client.put(
                "/api/settings/profile/TCH001?role=teacher",
                json={"auto_save": False},
            )
        assert r.status_code == 200
        assert r.json()["auto_save"] is False


# ── POST /api/settings/password-change/{user_id} ─────────────────────────────

class TestPasswordChange:

    def test_correct_old_password_returns_200(self):
        student = _FakeUser("STU001", pw="oldpass")
        with _patch(_FakeDB(student=student)):
            r = client.post(
                "/api/settings/password-change/STU001"
                "?role=student&old_password=oldpass&new_password=newpass123",
            )
        assert r.status_code == 200
        assert "success" in r.json().get("message", "").lower()

    def test_wrong_old_password_returns_401(self):
        student = _FakeUser("STU001", pw="realpass")
        with _patch(_FakeDB(student=student)):
            r = client.post(
                "/api/settings/password-change/STU001"
                "?role=student&old_password=wrongpass&new_password=newpass123",
            )
        assert r.status_code == 401

    def test_nonexistent_student_returns_404(self):
        with _patch(_FakeDB()):
            r = client.post(
                "/api/settings/password-change/GHOST"
                "?role=student&old_password=x&new_password=y",
            )
        assert r.status_code == 404

    def test_password_hash_is_updated(self):
        """After a successful change the new password must verify correctly."""
        student = _FakeUser("STU001", pw="oldpass")
        with _patch(_FakeDB(student=student)):
            client.post(
                "/api/settings/password-change/STU001"
                "?role=student&old_password=oldpass&new_password=brandnew",
            )
        assert student.verify_password("brandnew")
        assert not student.verify_password("oldpass")

    def test_teacher_password_change_200(self):
        teacher = _FakeUser("TCH001", pw="teachpass")
        with _patch(_FakeDB(teacher=teacher)):
            r = client.post(
                "/api/settings/password-change/TCH001"
                "?role=teacher&old_password=teachpass&new_password=newteach",
            )
        assert r.status_code == 200

    def test_nonexistent_teacher_returns_404(self):
        with _patch(_FakeDB()):
            r = client.post(
                "/api/settings/password-change/GHOST"
                "?role=teacher&old_password=x&new_password=y",
            )
        assert r.status_code == 404
