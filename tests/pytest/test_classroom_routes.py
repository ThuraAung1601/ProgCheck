"""
Integration tests for classroom management routes (src/routes/classrooms.py).

Strategy: DatabaseContext is patched to an in-memory FakeDB so no file I/O
          or network access is required.

Requirements traced:
  UFR-2   logout / access control (credentials rejected when invalid)
  UFR-3   students view list of assigned labs and questions
  UFR-13  instructors create classrooms
  SFR-1   system manages user accounts
  SFR-2   role-based access enforcement
  SFR-3   classroom management
"""
import sys
import pytest
from pathlib import Path
from contextlib import contextmanager
from datetime import datetime
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SRC  = ROOT / "src"
for p in (str(ROOT), str(SRC)):
    if p not in sys.path:
        sys.path.insert(0, p)

from fastapi import FastAPI
from fastapi.testclient import TestClient
from src.routes import classrooms as cls_module
from src.database.models import Classroom


# ── In-memory helpers ─────────────────────────────────────────────────────────

class _Settings:
    theme = "light"; auto_save = True; email_alerts = True
    display_name = ""; email = "s@uni.edu"


class _FakeStudent:
    def __init__(self, sid, name="Alice"):
        self.student_id = sid
        self.name = name
        self.settings = _Settings()


class _FakeTeacher:
    def __init__(self, tid, name="Prof"):
        self.teacher_id = tid
        self.name = name
        self.courses_teach = []
        self._p_changed = False


class _FakeDB:
    def __init__(self):
        self.students   = {}
        self.teachers   = {}
        self.classrooms = {}
        self.labs       = {}
        self.results    = {}


def _ctx_factory(db):
    @contextmanager
    def _ctx():
        yield db
    return _ctx


# ── FastAPI app ───────────────────────────────────────────────────────────────

_app = FastAPI()
_app.include_router(cls_module.router)
client = TestClient(_app, raise_server_exceptions=True)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def db():
    d = _FakeDB()
    d.students["STU001"] = _FakeStudent("STU001")
    d.students["STU002"] = _FakeStudent("STU002", "Bob")
    d.teachers["TCH001"] = _FakeTeacher("TCH001")
    d.teachers["TCH002"] = _FakeTeacher("TCH002", "Dr.Smith")
    return d


@pytest.fixture(autouse=True)
def patch_db(db):
    ctx = _ctx_factory(db)
    with patch.object(cls_module, "DatabaseContext", ctx), \
         patch.object(cls_module, "commit_changes", lambda: None):
        yield db


@pytest.fixture
def classroom(db):
    """Pre-created classroom owned by TCH001, with STU001 enrolled."""
    cr = Classroom(1001, "CS101", "TCH001")
    cr.prerequisites = ""
    cr.student_ids.append("STU001")
    cr.class_size = 1
    db.classrooms[1001] = cr
    db.teachers["TCH001"].courses_teach.append(1001)
    return cr


# ─────────────────────────────────────────────────────────────────────────────
# UFR-13 / SFR-3  — Instructor creates classroom
# ─────────────────────────────────────────────────────────────────────────────

class TestCreateClassroom:
    def test_create_classroom_success(self, db):
        """UFR-13: teacher creates a new classroom."""
        resp = client.post(
            "/api/classrooms/create?teacher_id=TCH001",
            json={"class_name": "Prolog101", "prerequisites": ""},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["class_name"] == "Prolog101"
        assert body["teacher_id"] == "TCH001"

    def test_create_classroom_returns_id(self, db):
        """SFR-3: created classroom has a numeric ID."""
        resp = client.post(
            "/api/classrooms/create?teacher_id=TCH001",
            json={"class_name": "Prolog101"},
        )
        assert resp.status_code == 200
        assert isinstance(resp.json()["class_id"], int)

    def test_create_classroom_unknown_teacher(self, db):
        """SFR-2: unknown teacher_id is rejected with 404."""
        resp = client.post(
            "/api/classrooms/create?teacher_id=GHOST",
            json={"class_name": "X"},
        )
        assert resp.status_code == 404

    def test_create_classroom_stored_in_db(self, db):
        """SFR-3: new classroom appears in teacher's courses_teach list."""
        client.post(
            "/api/classrooms/create?teacher_id=TCH001",
            json={"class_name": "Stored"},
        )
        assert len(db.teachers["TCH001"].courses_teach) == 1

    def test_create_classroom_with_prerequisites(self, db):
        """SFR-3: prerequisites field is stored and returned."""
        resp = client.post(
            "/api/classrooms/create?teacher_id=TCH001",
            json={"class_name": "Advanced", "prerequisites": "CS50"},
        )
        assert resp.status_code == 200
        assert resp.json()["prerequisites"] == "CS50"


# ─────────────────────────────────────────────────────────────────────────────
# UFR-2  — Access control (simulated logout / invalid credentials)
# ─────────────────────────────────────────────────────────────────────────────

class TestAccessControl:
    def test_unknown_teacher_cannot_create_classroom(self, db):
        """UFR-2: a logged-out or invalid teacher_id is rejected (404)."""
        resp = client.post(
            "/api/classrooms/create?teacher_id=INVALID",
            json={"class_name": "Unauthorized"},
        )
        assert resp.status_code == 404

    def test_wrong_teacher_cannot_enroll_student(self, db, classroom):
        """UFR-2: only the classroom owner can enroll students."""
        resp = client.post(
            "/api/classrooms/1001/enroll-student/STU002?teacher_id=TCH002"
        )
        assert resp.status_code == 403

    def test_correct_teacher_can_enroll_student(self, db, classroom):
        """UFR-2: the owning teacher can enroll students."""
        resp = client.post(
            "/api/classrooms/1001/enroll-student/STU002?teacher_id=TCH001"
        )
        assert resp.status_code == 200

    def test_nonexistent_classroom_returns_404(self, db):
        """UFR-2: accessing a classroom that does not exist is rejected."""
        resp = client.get("/api/classrooms/9999")
        assert resp.status_code == 404

    def test_unknown_student_cannot_be_enrolled(self, db, classroom):
        """SFR-2: enrolling a non-existent student is rejected."""
        resp = client.post(
            "/api/classrooms/1001/enroll-student/GHOST?teacher_id=TCH001"
        )
        assert resp.status_code == 404


# ─────────────────────────────────────────────────────────────────────────────
# UFR-3  — Student views list of assigned classrooms / labs
# ─────────────────────────────────────────────────────────────────────────────

class TestStudentViewsClassrooms:
    def test_student_gets_enrolled_classrooms(self, db, classroom):
        """UFR-3: enrolled student sees their classroom in the list."""
        resp = client.get("/api/classrooms/student/STU001")
        assert resp.status_code == 200
        classrooms = resp.json()["classrooms"]
        assert len(classrooms) == 1
        assert classrooms[0]["class_id"] == 1001

    def test_student_not_enrolled_sees_empty_list(self, db, classroom):
        """UFR-3: student with no enrolments gets an empty list, not an error."""
        resp = client.get("/api/classrooms/student/STU002")
        assert resp.status_code == 200
        assert resp.json()["classrooms"] == []

    def test_unknown_student_returns_404(self, db):
        """UFR-3: requesting classrooms for non-existent student returns 404."""
        resp = client.get("/api/classrooms/student/GHOST")
        assert resp.status_code == 404

    def test_student_classroom_includes_lab_ids(self, db, classroom):
        """UFR-3: classroom response contains lab_ids so student can fetch labs."""
        classroom.lab_ids.append(5001)
        resp = client.get("/api/classrooms/student/STU001")
        assert resp.status_code == 200
        cr = resp.json()["classrooms"][0]
        assert 5001 in cr["lab_ids"]

    def test_student_enrolled_in_multiple_classrooms(self, db, classroom):
        """UFR-3: student enrolled in two classrooms sees both."""
        cr2 = Classroom(1002, "CS202", "TCH002")
        cr2.prerequisites = ""
        cr2.student_ids.append("STU001")
        cr2.class_size = 1
        db.classrooms[1002] = cr2
        resp = client.get("/api/classrooms/student/STU001")
        assert resp.status_code == 200
        assert len(resp.json()["classrooms"]) == 2


# ─────────────────────────────────────────────────────────────────────────────
# UFR-13  — Teacher views own classrooms
# ─────────────────────────────────────────────────────────────────────────────

class TestTeacherViewsClassrooms:
    def test_teacher_gets_own_classrooms(self, db, classroom):
        """UFR-13: teacher retrieves the list of classrooms they own."""
        resp = client.get("/api/classrooms/teacher/TCH001")
        assert resp.status_code == 200
        classrooms = resp.json()["classrooms"]
        assert len(classrooms) == 1
        assert classrooms[0]["teacher_id"] == "TCH001"

    def test_unknown_teacher_returns_404(self, db):
        """SFR-2: unknown teacher_id rejected."""
        resp = client.get("/api/classrooms/teacher/GHOST")
        assert resp.status_code == 404

    def test_teacher_with_no_classrooms_returns_empty(self, db):
        """UFR-13: new teacher has no classrooms yet — returns empty list."""
        resp = client.get("/api/classrooms/teacher/TCH002")
        assert resp.status_code == 200
        assert resp.json()["classrooms"] == []


# ─────────────────────────────────────────────────────────────────────────────
# SFR-3  — Enrolment management
# ─────────────────────────────────────────────────────────────────────────────

class TestEnrolmentManagement:
    def test_enroll_student_appears_in_classroom(self, db, classroom):
        """SFR-3: enrolled student appears in classroom student list."""
        client.post(
            "/api/classrooms/1001/enroll-student/STU002?teacher_id=TCH001"
        )
        resp = client.get("/api/classrooms/1001/students")
        assert resp.status_code == 200
        ids = [s["student_id"] for s in resp.json()["students"]]
        assert "STU002" in ids

    def test_remove_student_from_classroom(self, db, classroom):
        """SFR-3: teacher removes an enrolled student."""
        resp = client.post(
            "/api/classrooms/1001/remove-student/STU001?teacher_id=TCH001"
        )
        assert resp.status_code == 200
        assert "STU001" not in db.classrooms[1001].student_ids

    def test_get_classroom_students_list(self, db, classroom):
        """UFR-13/SFR-3: instructor retrieves student list for a classroom."""
        resp = client.get("/api/classrooms/1001/students")
        assert resp.status_code == 200
        students = resp.json()["students"]
        assert len(students) == 1
        assert students[0]["student_id"] == "STU001"

    def test_get_classroom_details(self, db, classroom):
        """SFR-3: GET classroom by ID returns all required fields."""
        resp = client.get("/api/classrooms/1001")
        assert resp.status_code == 200
        body = resp.json()
        assert body["class_id"] == 1001
        assert body["class_name"] == "CS101"
        assert body["teacher_id"] == "TCH001"
