"""
Pytest configuration and shared fixtures for ProgCheck test suite.

Uses an in-memory mock database so that tests are hermetic and do not
require a running ZODB file-storage instance.  Each test function
receives a freshly-created database root so that test order is irrelevant.
"""
import sys
import os
from pathlib import Path
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch
import pytest

# ── Path setup ────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[2]      # project root
SRC  = ROOT / "src"
for p in (str(ROOT), str(SRC)):
    if p not in sys.path:
        sys.path.insert(0, p)

# ── Lightweight in-memory DB helpers (mirrors db.py Mock* classes) ────────────

class FakeSettings:
    def __init__(self):
        self.theme        = "light"
        self.auto_save    = True
        self.email_alerts = True
        self.display_name = ""
        self.email        = ""
        self.phone        = ""
        self.created_at   = datetime.now()
        self.updated_at   = datetime.now()


class FakeTestCase:
    def __init__(self, tc_id: int, input_str: str = "", expected: str = "true"):
        self.testcase_id    = tc_id
        self.input          = input_str
        self.expected_output = expected
        self.created_at     = datetime.now()
        self.updated_at     = datetime.now()


class FakeQuestion:
    def __init__(self, qid: int, title: str = "Q", problem: str = ""):
        self.question_id   = qid
        self.title         = title
        self.problem       = problem
        self.question_number = 0
        self.question_size = 0
        self.test_case     = []
        self.created_at    = datetime.now()
        self.updated_at    = datetime.now()

    def add_testcase(self, tc):
        self.test_case.append(tc)
        self.question_size = len(self.test_case)

    def get_testcase(self, tc_id):
        return next((t for t in self.test_case if t.testcase_id == tc_id), None)


class FakeLab:
    def __init__(self, lab_id: int, title: str = "Lab",
                 active_time=None, complete_time=None):
        self.lab_id        = lab_id
        self.title         = title
        self.classroom_id  = None
        self.lab_question  = []
        self.active_time   = active_time
        self.complete_time = complete_time
        self.created_at    = datetime.now()
        self.updated_at    = datetime.now()

    def get_current_status(self) -> str:
        now = datetime.now()
        if self.active_time is None or now < self.active_time:
            return "inactive"
        if self.complete_time is not None and now >= self.complete_time:
            return "completed"
        return "active"

    def add_question(self, q):
        self.lab_question.append(q)

    def get_question(self, qid):
        return next((q for q in self.lab_question if q.question_id == qid), None)


class FakeClassroom:
    def __init__(self, class_id: int, class_name: str, teacher_id: str):
        self.class_id     = class_id
        self.class_name   = class_name
        self.class_size   = 0
        self.prerequisites = ""
        self.teacher_id   = teacher_id
        self.student_ids  = []
        self.lab_ids      = []
        self.created_at   = datetime.now()
        self.updated_at   = datetime.now()

    def add_student(self, sid):
        if sid not in self.student_ids:
            self.student_ids.append(sid)
            self.class_size = len(self.student_ids)

    def remove_student(self, sid):
        if sid in self.student_ids:
            self.student_ids.remove(sid)
            self.class_size = len(self.student_ids)


class FakeStudent:
    def __init__(self, student_id: str, name: str, password_hash: str):
        self.student_id      = student_id
        self.name            = name
        self.password        = password_hash
        self.academic_record = []
        self.settings        = FakeSettings()
        self.code_files      = {}
        self.created_at      = datetime.now()
        self.updated_at      = datetime.now()

    def verify_password(self, pw: str) -> bool:
        import bcrypt
        return bcrypt.checkpw(pw.encode(), self.password.encode())

    def add_to_academic_record(self, lab_id, score):
        self.academic_record.append({"lab_id": lab_id, "score": score})


class FakeTeacher:
    def __init__(self, teacher_id: str, name: str, password_hash: str):
        self.teacher_id    = teacher_id
        self.name          = name
        self.password      = password_hash
        self.courses_teach = []
        self.settings      = FakeSettings()
        self.code_files    = {}
        self.created_at    = datetime.now()
        self.updated_at    = datetime.now()

    def verify_password(self, pw: str) -> bool:
        import bcrypt
        return bcrypt.checkpw(pw.encode(), self.password.encode())


class FakeResult:
    def __init__(self, result_id: int, student_id: str, question_id: int):
        self.result_id       = result_id
        self.student_id      = student_id
        self.question_id     = question_id
        self.code_file       = None
        self.score           = 0
        self.status          = "pending"
        self.submission_time = datetime.now()
        self.created_at      = datetime.now()
        self.updated_at      = datetime.now()

    def save_result(self, result_id, score, status, code_file=None):
        self.result_id  = result_id
        self.score      = score
        self.status     = status
        self.code_file  = code_file
        self.submission_time = datetime.now()


class FakeDB:
    def __init__(self):
        self.students   = {}
        self.teachers   = {}
        self.classrooms = {}
        self.labs       = {}
        self.results    = {}
        self.created_at = datetime.now()


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def db():
    """Return a fresh FakeDB instance per test."""
    return FakeDB()


@pytest.fixture
def hashed_pw():
    import bcrypt
    return bcrypt.hashpw(b"testpass", bcrypt.gensalt()).decode()


@pytest.fixture
def student(db, hashed_pw):
    s = FakeStudent("STU001", "Alice", hashed_pw)
    db.students["STU001"] = s
    return s


@pytest.fixture
def teacher(db, hashed_pw):
    t = FakeTeacher("TCH001", "Prof. Bob", hashed_pw)
    db.teachers["TCH001"] = t
    return t


@pytest.fixture
def classroom(db, teacher):
    c = FakeClassroom(1001, "Prolog 101", "TCH001")
    db.classrooms[1001] = c
    teacher.courses_teach.append(1001)
    return c


@pytest.fixture
def inactive_lab(db, classroom):
    """Lab that has no active_time — status = inactive."""
    lab = FakeLab(2001, "Lab 1")
    lab.classroom_id = 1001
    db.labs[2001] = lab
    classroom.lab_ids.append(2001)
    return lab


@pytest.fixture
def active_lab(db, classroom):
    """Lab whose window covers 'now' — status = active."""
    lab = FakeLab(
        2002, "Lab 2",
        active_time=datetime.now() - timedelta(hours=1),
        complete_time=datetime.now() + timedelta(hours=2),
    )
    lab.classroom_id = 1001
    db.labs[2002] = lab
    classroom.lab_ids.append(2002)
    return lab


@pytest.fixture
def completed_lab(db, classroom):
    """Lab whose complete_time is in the past — status = completed."""
    lab = FakeLab(
        2003, "Lab 3",
        active_time=datetime.now() - timedelta(hours=5),
        complete_time=datetime.now() - timedelta(hours=1),
    )
    lab.classroom_id = 1001
    db.labs[2003] = lab
    classroom.lab_ids.append(2003)
    return lab


@pytest.fixture
def question(inactive_lab):
    q = FakeQuestion(3001, "Append predicate", "append([],L,L) should be true")
    inactive_lab.add_question(q)
    return q


@pytest.fixture
def testcase(question):
    tc = FakeTestCase(4001, "append([],[], [])", "true")
    question.add_testcase(tc)
    return tc


@pytest.fixture
def result(db, student, question):
    r = FakeResult(5001, "STU001", 3001)
    r.save_result(5001, 0, "pending", "append([],[],[]).")
    db.results[5001] = r
    return r


@pytest.fixture
def sample_pl_dir(tmp_path):
    """Create temporary Prolog files for checker tests."""
    problem = tmp_path / "problem.pl"
    problem.write_text(
        "% append/3 — append two lists\n"
        "% append([],Y,Y) should be true\n"
        "% append([H|T],Y,[H|R]) should be true\n"
    )
    correct = tmp_path / "correct.pl"
    correct.write_text(
        "append([], Y, Y).\n"
        "append([H|T], Y, [H|R]) :- append(T, Y, R).\n"
    )
    wrong_base = tmp_path / "wrong_base.pl"
    wrong_base.write_text(
        "append([], Y, []).\n"                  # wrong base case
        "append([H|T], Y, [H|R]) :- append(T, Y, R).\n"
    )
    syntax_err = tmp_path / "syntax_err.pl"
    syntax_err.write_text(
        "append([], Y, Y\n"                     # missing closing paren + period
        "append([H|T], Y, [H|R]) :- append(T, Y, R).\n"
    )
    return tmp_path
