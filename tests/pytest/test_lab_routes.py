"""
Integration tests for Lab / LabQuestion / TestCase / Result routes
(src/routes/labs.py).

All ZODB interactions are replaced by an in-memory FakeDB so that no
file-system access is required.

Requirements traced:
  UFR-3   students view list of assigned labs
  UFR-4   students read problem statement
  UFR-5   students submit Prolog code
  UFR-6   students edit and resubmit
  UFR-11  students view submission history
  UFR-12  instructors create classrooms
  UFR-13  instructors create lab questions
  UFR-14  instructors view student submissions
  SFR-3   classroom management
  SFR-4   lab question assignment
  SFR-5   lab/submission persistence
  SNFR-1  5-second response budget (not measured here; see Robot tests)
"""
import sys
import pytest
from pathlib import Path
from datetime import datetime, timedelta
from unittest.mock import patch
from contextlib import contextmanager

ROOT = Path(__file__).resolve().parents[2]
SRC  = ROOT / "src"
for p in (str(ROOT), str(SRC)):
    if p not in sys.path:
        sys.path.insert(0, p)

from fastapi import FastAPI
from fastapi.testclient import TestClient
from src.routes import labs as labs_module
from src.database.models import Lab, LabQuestion, TestCase as DBTestCase, Result

# ── In-memory helpers ─────────────────────────────────────────────────────────

class _Settings:
    theme = "light"; auto_save = True; email_alerts = True
    display_name = ""; email = ""


class _FakeStudent:
    def __init__(self, sid):
        self.student_id = sid; self.name = "Alice"; self.settings = _Settings()


class _FakeTeacher:
    def __init__(self, tid):
        self.teacher_id = tid; self.name = "Prof"


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


# ── Classroom stub ────────────────────────────────────────────────────────────

class _FakeClassroom:
    def __init__(self, cid, teacher_id):
        self.class_id   = cid
        self.class_name = f"Class-{cid}"
        self.teacher_id = teacher_id
        self.student_ids = []
        self.lab_ids    = []
        self._p_changed = False

    class _List(list):
        def append(self, v): list.append(self, v)


# ── FastAPI app ───────────────────────────────────────────────────────────────

_app = FastAPI()
_app.include_router(labs_module.router)
client = TestClient(_app, raise_server_exceptions=True)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def db():
    d = _FakeDB()
    d.students["STU001"]  = _FakeStudent("STU001")
    d.teachers["TCH001"]  = _FakeTeacher("TCH001")
    cr = _FakeClassroom(1001, "TCH001")
    d.classrooms[1001]    = cr
    return d


@pytest.fixture(autouse=True)
def patch_db(db):
    ctx = _ctx_factory(db)
    with patch.object(labs_module, "DatabaseContext", ctx), \
         patch.object(labs_module, "commit_changes", lambda: None):
        yield db


@pytest.fixture
def inactive_lab(db):
    lab = Lab(2001, "Lab Alpha")
    lab.classroom_id  = 1001
    lab.active_time   = None
    lab.complete_time = None
    db.labs[2001] = lab
    db.classrooms[1001].lab_ids.append(2001)
    return lab


@pytest.fixture
def active_lab(db):
    lab = Lab(2002, "Lab Beta")
    lab.classroom_id  = 1001
    lab.active_time   = datetime.now() - timedelta(hours=1)
    lab.complete_time = datetime.now() + timedelta(hours=3)
    db.labs[2002] = lab
    db.classrooms[1001].lab_ids.append(2002)
    return lab


@pytest.fixture
def completed_lab(db):
    lab = Lab(2003, "Lab Gamma")
    lab.classroom_id  = 1001
    lab.active_time   = datetime.now() - timedelta(days=2)
    lab.complete_time = datetime.now() - timedelta(hours=1)
    db.labs[2003] = lab
    db.classrooms[1001].lab_ids.append(2003)
    return lab


@pytest.fixture
def question_in_inactive(inactive_lab):
    q = LabQuestion(3001, "Append", "append/3 problem text")
    inactive_lab.add_question(q)
    return q


# ─────────────────────────────────────────────────────────────────────────────
# Lab creation
# ─────────────────────────────────────────────────────────────────────────────

class TestCreateLab:
    def test_create_lab_inactive_by_default(self, db):
        """SFR-4: newly created lab with no times is inactive."""
        resp = client.post(
            "/api/labs/create?teacher_id=TCH001",
            json={"title": "New Lab", "classroom_id": 1001},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "inactive"
        assert body["title"]  == "New Lab"

    def test_create_lab_with_times(self, db):
        future = (datetime.now() + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M")
        end    = (datetime.now() + timedelta(hours=5)).strftime("%Y-%m-%dT%H:%M")
        resp = client.post(
            "/api/labs/create?teacher_id=TCH001",
            json={"title": "Timed Lab", "classroom_id": 1001,
                  "active_time": future, "complete_time": end},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "inactive"   # future start

    def test_create_lab_teacher_not_found(self, db):
        resp = client.post(
            "/api/labs/create?teacher_id=GHOST",
            json={"title": "X", "classroom_id": 1001},
        )
        assert resp.status_code == 404

    def test_create_lab_classroom_not_found(self, db):
        resp = client.post(
            "/api/labs/create?teacher_id=TCH001",
            json={"title": "X", "classroom_id": 9999},
        )
        assert resp.status_code == 404

    def test_create_lab_wrong_teacher(self, db):
        """SFR-2: teacher cannot create labs in another teacher's classroom."""
        db.teachers["TCH002"] = _FakeTeacher("TCH002")
        resp = client.post(
            "/api/labs/create?teacher_id=TCH002",
            json={"title": "X", "classroom_id": 1001},
        )
        assert resp.status_code == 403

    def test_complete_before_active_rejected(self, db):
        start = (datetime.now() + timedelta(hours=5)).strftime("%Y-%m-%dT%H:%M")
        end   = (datetime.now() + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M")
        resp = client.post(
            "/api/labs/create?teacher_id=TCH001",
            json={"title": "Bad Times", "classroom_id": 1001,
                  "active_time": start, "complete_time": end},
        )
        assert resp.status_code == 422


# ─────────────────────────────────────────────────────────────────────────────
# Get Lab / Classroom Labs
# ─────────────────────────────────────────────────────────────────────────────

class TestGetLab:
    def test_get_existing_lab(self, inactive_lab):
        resp = client.get("/api/labs/2001")
        assert resp.status_code == 200
        body = resp.json()
        assert body["lab_id"] == 2001
        assert body["status"] == "inactive"

    def test_get_nonexistent_lab(self):
        resp = client.get("/api/labs/9999")
        assert resp.status_code == 404

    def test_get_classroom_labs(self, inactive_lab, active_lab):
        resp = client.get("/api/labs/classroom/1001")
        assert resp.status_code == 200
        ids = [l["lab_id"] for l in resp.json()["labs"]]
        assert 2001 in ids
        assert 2002 in ids

    def test_get_classroom_not_found(self):
        resp = client.get("/api/labs/classroom/9999")
        assert resp.status_code == 404

    def test_active_lab_status_reported_correctly(self, active_lab):
        resp = client.get("/api/labs/2002")
        assert resp.json()["status"] == "active"

    def test_completed_lab_status_reported_correctly(self, completed_lab):
        resp = client.get("/api/labs/2003")
        assert resp.json()["status"] == "completed"


# ─────────────────────────────────────────────────────────────────────────────
# Questions
# ─────────────────────────────────────────────────────────────────────────────

class TestLabQuestions:
    def test_add_question_to_inactive_lab(self, inactive_lab):
        """UFR-13: instructor adds question while lab is inactive."""
        resp = client.post(
            "/api/labs/2001/questions?teacher_id=TCH001",
            json={"title": "Q1", "problem": "Write append/3"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["title"]   == "Q1"
        assert body["problem"] == "Write append/3"

    def test_add_question_to_active_lab_rejected(self, active_lab):
        """SFR-4: questions cannot be added once lab is active."""
        resp = client.post(
            "/api/labs/2002/questions?teacher_id=TCH001",
            json={"title": "Late Q", "problem": "..."},
        )
        assert resp.status_code == 403

    def test_get_questions_empty(self, inactive_lab):
        resp = client.get("/api/labs/2001/questions")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_get_questions_after_add(self, inactive_lab):
        client.post("/api/labs/2001/questions?teacher_id=TCH001",
                    json={"title": "Q1", "problem": "P1"})
        resp = client.get("/api/labs/2001/questions")
        assert len(resp.json()) == 1

    def test_get_specific_question(self, question_in_inactive):
        resp = client.get("/api/labs/2001/questions/3001")
        assert resp.status_code == 200
        assert resp.json()["question_id"] == 3001

    def test_get_missing_question(self, inactive_lab):
        resp = client.get("/api/labs/2001/questions/9999")
        assert resp.status_code == 404


# ─────────────────────────────────────────────────────────────────────────────
# TestCases
# ─────────────────────────────────────────────────────────────────────────────

class TestTestCases:
    def test_add_testcase_to_inactive_question(self, question_in_inactive):
        resp = client.post(
            "/api/labs/2001/questions/3001/testcases?teacher_id=TCH001",
            json={"input": "append([],Y,Y)", "expected_output": "true"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["input"]           == "append([],Y,Y)"
        assert body["expected_output"] == "true"

    def test_add_testcase_to_active_lab_rejected(self, active_lab):
        q = LabQuestion(3002, "Q", "P")
        active_lab.add_question(q)
        resp = client.post(
            "/api/labs/2002/questions/3002/testcases?teacher_id=TCH001",
            json={"input": "x", "expected_output": "true"},
        )
        assert resp.status_code == 403


# ─────────────────────────────────────────────────────────────────────────────
# Submissions / Results
# ─────────────────────────────────────────────────────────────────────────────

class TestSubmissions:
    def test_submit_while_active(self, active_lab, db):
        """UFR-5: student submits code during active window."""
        q = LabQuestion(3010, "Q", "P")
        active_lab.add_question(q)
        resp = client.post("/api/labs/submit", json={
            "student_id": "STU001", "question_id": 3010,
            "code_file": "append([],Y,Y).",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"]     == "pending"
        assert body["student_id"] == "STU001"

    def test_submit_while_inactive_rejected(self, inactive_lab, db):
        """SFR-5: submission blocked when lab has not started."""
        q = LabQuestion(3011, "Q", "P")
        inactive_lab.add_question(q)
        resp = client.post("/api/labs/submit", json={
            "student_id": "STU001", "question_id": 3011,
            "code_file": "code.",
        })
        assert resp.status_code == 403

    def test_submit_after_complete_rejected(self, completed_lab, db):
        """SFR-5: submission blocked when lab has ended."""
        q = LabQuestion(3012, "Q", "P")
        completed_lab.add_question(q)
        resp = client.post("/api/labs/submit", json={
            "student_id": "STU001", "question_id": 3012,
            "code_file": "code.",
        })
        assert resp.status_code == 403

    def test_submit_unknown_student(self, active_lab, db):
        q = LabQuestion(3013, "Q", "P")
        active_lab.add_question(q)
        resp = client.post("/api/labs/submit", json={
            "student_id": "GHOST", "question_id": 3013,
            "code_file": "code.",
        })
        assert resp.status_code == 404

    def test_get_student_results(self, db):
        """UFR-11: student can view their submission history."""
        r = Result(5001, "STU001", 3001)
        r.save_result(5001, 70, "passed", "code")
        db.results[5001] = r
        resp = client.get("/api/labs/results/student/STU001")
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) >= 1
        assert results[0]["student_id"] == "STU001"

    def test_get_student_results_not_found(self):
        resp = client.get("/api/labs/results/student/GHOST")
        assert resp.status_code == 404

    def test_get_question_results(self, db):
        """UFR-14: instructor views all submissions for a question."""
        for rid, sid in [(5001, "STU001"), (5002, "STU001")]:
            r = Result(rid, sid, 3001)
            r.save_result(rid, 80, "passed", "c")
            db.results[rid] = r
        resp = client.get("/api/labs/results/question/3001")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_update_result_score(self, db):
        r = Result(5001, "STU001", 3001)
        r.save_result(5001, 0, "pending", "c")
        db.results[5001] = r
        resp = client.put("/api/labs/results/5001?score=95&result_status=passed")
        assert resp.status_code == 200
        body = resp.json()
        assert body["score"]  == 95
        assert body["status"] == "passed"
