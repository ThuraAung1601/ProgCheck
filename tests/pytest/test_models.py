"""
Unit tests for ZODB data models (src/database/models.py).

Covers:
  - Student, Teacher: password hashing, verification, academic record
  - TestCase: create/edit lifecycle
  - LabQuestion: testcase management, CRUD
  - Lab: status computation, question management
  - Classroom: student enrolment, get_class_info
  - Result: save_result / get_result
  - Database: root container initialisation

Requirements traced:
  SFR-1  user account management
  SFR-2  role-based access (Student vs Teacher entities)
  SFR-5  lab/submission persistence
  SNFR-3 deterministic behaviour for same inputs
  SNFR-11 security (password not stored in plaintext)
"""
import sys
import pytest
from pathlib import Path
from datetime import datetime, timedelta

ROOT = Path(__file__).resolve().parents[2]
SRC  = ROOT / "src"
for p in (str(ROOT), str(SRC)):
    if p not in sys.path:
        sys.path.insert(0, p)

from src.database.models import (
    UserSettings, Student, Teacher, TestCase, LabQuestion, Lab,
    Classroom, Result, Database,
)


# ─────────────────────────────────────────────────────────────────────────────
# UserSettings
# ─────────────────────────────────────────────────────────────────────────────

class TestUserSettings:
    def test_defaults(self):
        s = UserSettings()
        assert s.theme == "light"
        assert s.auto_save is True
        assert s.email_alerts is True
        assert s.display_name == ""
        assert s.email == ""


# ─────────────────────────────────────────────────────────────────────────────
# Student
# ─────────────────────────────────────────────────────────────────────────────

class TestStudent:
    def test_password_hashed_on_creation(self):
        """SFR-1, SNFR-11: raw password must not be stored."""
        s = Student("S1", "Alice", "secret")
        assert s.password != "secret"
        assert len(s.password) > 20          # bcrypt hash is long

    def test_verify_password_correct(self):
        s = Student("S1", "Alice", "secret")
        assert s.verify_password("secret") is True

    def test_verify_password_wrong(self):
        s = Student("S1", "Alice", "secret")
        assert s.verify_password("wrong") is False

    def test_update_password(self):
        s = Student("S1", "Alice", "oldpass")
        old_hash = s.password
        s.update_password("newpass")
        assert s.password != old_hash
        assert s.verify_password("newpass") is True
        assert s.verify_password("oldpass") is False

    def test_academic_record_appended(self):
        s = Student("S1", "Alice", "pass")
        s.add_to_academic_record("LAB01", "85")
        s.add_to_academic_record("LAB02", "90")
        assert len(s.academic_record) == 2
        assert s.academic_record[0] == {"lab_id": "LAB01", "score": "85"}

    def test_initial_academic_record_empty(self):
        s = Student("S1", "Alice", "pass")
        assert list(s.academic_record) == []

    def test_attributes_match_class_diagram(self):
        s = Student("S99", "Bob", "pw")
        assert hasattr(s, "student_id")
        assert hasattr(s, "name")
        assert hasattr(s, "password")
        assert hasattr(s, "academic_record")
        assert hasattr(s, "settings")

    def test_created_at_is_datetime(self):
        s = Student("S1", "Alice", "pw")
        assert isinstance(s.created_at, datetime)


# ─────────────────────────────────────────────────────────────────────────────
# Teacher
# ─────────────────────────────────────────────────────────────────────────────

class TestTeacher:
    def test_password_hashed(self):
        t = Teacher("T1", "Prof", "tpass")
        assert t.password != "tpass"

    def test_verify_password(self):
        t = Teacher("T1", "Prof", "tpass")
        assert t.verify_password("tpass")
        assert not t.verify_password("bad")

    def test_courses_teach_initially_empty(self):
        t = Teacher("T1", "Prof", "pw")
        assert list(t.courses_teach) == []


# ─────────────────────────────────────────────────────────────────────────────
# TestCase
# ─────────────────────────────────────────────────────────────────────────────

class TestTestCase:
    def test_create_testcase(self):
        tc = TestCase(1)
        tc.create_testcase("append([],Y,Y)", "true")
        assert tc.input == "append([],Y,Y)"
        assert tc.expected_output == "true"

    def test_edit_testcase_input_only(self):
        tc = TestCase(1)
        tc.create_testcase("old_input", "true")
        tc.edit_testcase(input_str="new_input")
        assert tc.input == "new_input"
        assert tc.expected_output == "true"

    def test_edit_testcase_output_only(self):
        tc = TestCase(1)
        tc.create_testcase("goal", "true")
        tc.edit_testcase(expected_output="false")
        assert tc.expected_output == "false"
        assert tc.input == "goal"

    def test_edit_testcase_both(self):
        tc = TestCase(1)
        tc.create_testcase("g", "true")
        tc.edit_testcase("g2", "false")
        assert tc.input == "g2"
        assert tc.expected_output == "false"

    def test_initial_values_empty(self):
        tc = TestCase(42)
        assert tc.testcase_id == 42
        assert tc.input == ""
        assert tc.expected_output == ""


# ─────────────────────────────────────────────────────────────────────────────
# LabQuestion
# ─────────────────────────────────────────────────────────────────────────────

class TestLabQuestion:
    def _make_question(self):
        return LabQuestion(10, "Title", "Write append/3", 1)

    def test_initial_question_size_zero(self):
        q = self._make_question()
        assert q.question_size == 0
        assert list(q.test_case) == []

    def test_add_testcase_increments_size(self):
        q = self._make_question()
        tc1 = TestCase(1)
        tc2 = TestCase(2)
        q.add_testcase(tc1)
        q.add_testcase(tc2)
        assert q.question_size == 2

    def test_get_testcase_found(self):
        q = self._make_question()
        tc = TestCase(99)
        q.add_testcase(tc)
        assert q.get_testcase(99) is tc

    def test_get_testcase_not_found_returns_none(self):
        q = self._make_question()
        assert q.get_testcase(999) is None

    def test_delete_testcase(self):
        q = self._make_question()
        tc1 = TestCase(1)
        tc2 = TestCase(2)
        q.add_testcase(tc1)
        q.add_testcase(tc2)
        q.delete_testcase(1)
        assert q.question_size == 1
        assert q.get_testcase(1) is None
        assert q.get_testcase(2) is not None

    def test_edit_lab_question_problem(self):
        q = self._make_question()
        q.edit_lab_question(problem="new problem text")
        assert q.problem == "new problem text"

    def test_create_lab_question(self):
        q = self._make_question()
        q.create_lab_question("Updated Title", "Updated problem", 3)
        assert q.title == "Updated Title"
        assert q.problem == "Updated problem"
        assert q.question_number == 3


# ─────────────────────────────────────────────────────────────────────────────
# Lab — status computation (SFR-5, SNFR-3)
# ─────────────────────────────────────────────────────────────────────────────

class TestLab:
    def test_status_inactive_when_no_active_time(self):
        lab = Lab(1, "Lab A")
        assert lab.get_current_status() == "inactive"

    def test_status_inactive_before_active_time(self):
        lab = Lab(1, "Lab A")
        lab.active_time = datetime.now() + timedelta(hours=2)
        assert lab.get_current_status() == "inactive"

    def test_status_active_within_window(self):
        lab = Lab(1, "Lab A")
        lab.active_time   = datetime.now() - timedelta(hours=1)
        lab.complete_time = datetime.now() + timedelta(hours=1)
        assert lab.get_current_status() == "active"

    def test_status_completed_after_window(self):
        lab = Lab(1, "Lab A")
        lab.active_time   = datetime.now() - timedelta(hours=5)
        lab.complete_time = datetime.now() - timedelta(minutes=1)
        assert lab.get_current_status() == "completed"

    def test_status_active_with_no_complete_time(self):
        """If complete_time is None, lab stays active indefinitely once opened."""
        lab = Lab(1, "Lab A")
        lab.active_time   = datetime.now() - timedelta(hours=1)
        lab.complete_time = None
        assert lab.get_current_status() == "active"

    def test_add_and_get_question(self):
        lab = Lab(1, "Lab A")
        q = LabQuestion(10, "T", "P")
        lab.add_question(q)
        assert lab.get_question(10) is q

    def test_delete_lab_question(self):
        lab = Lab(1, "Lab A")
        q1 = LabQuestion(10, "T1", "P1")
        q2 = LabQuestion(11, "T2", "P2")
        lab.add_question(q1)
        lab.add_question(q2)
        lab.delete_lab_question(10)
        assert lab.get_question(10) is None
        assert lab.get_question(11) is q2

    def test_edit_lab_title(self):
        lab = Lab(1, "Old Title")
        lab.edit_lab(title="New Title")
        assert lab.title == "New Title"


# ─────────────────────────────────────────────────────────────────────────────
# Classroom (SFR-3, SFR-2)
# ─────────────────────────────────────────────────────────────────────────────

class TestClassroom:
    def test_add_student_updates_size(self):
        c = Classroom(1, "CS101", "T1")
        c.add_student("S1")
        c.add_student("S2")
        assert c.class_size == 2
        assert "S1" in list(c.student_ids)

    def test_add_student_idempotent(self):
        c = Classroom(1, "CS101", "T1")
        c.add_student("S1")
        c.add_student("S1")         # duplicate
        assert c.class_size == 1

    def test_remove_student(self):
        c = Classroom(1, "CS101", "T1")
        c.add_student("S1")
        c.remove_student("S1")
        assert c.class_size == 0
        assert "S1" not in list(c.student_ids)

    def test_remove_nonexistent_student_no_error(self):
        c = Classroom(1, "CS101", "T1")
        c.remove_student("GHOST")   # should not raise

    def test_get_class_info_structure(self):
        c = Classroom(1, "CS101", "T1")
        c.add_student("S1")
        info = c.get_class_info()
        assert info["class_id"]    == 1
        assert info["class_name"]  == "CS101"
        assert info["teacher_id"]  == "T1"
        assert "S1" in info["student_ids"]

    def test_edit_classroom(self):
        c = Classroom(1, "CS101", "T1")
        c.edit_classroom(class_name="CS201", prerequisites="Math101")
        assert c.class_name    == "CS201"
        assert c.prerequisites == "Math101"


# ─────────────────────────────────────────────────────────────────────────────
# Result (SFR-5)
# ─────────────────────────────────────────────────────────────────────────────

class TestResult:
    def test_initial_status_pending(self):
        r = Result(1, "S1", 10)
        assert r.status == "pending"
        assert r.score  == 0

    def test_save_result(self):
        r = Result(1, "S1", 10)
        r.save_result(1, 80, "passed", "some code")
        assert r.score     == 80
        assert r.status    == "passed"
        assert r.code_file == "some code"

    def test_get_result_dict(self):
        r = Result(1, "S1", 10)
        r.save_result(1, 60, "failed", "code")
        d = r.get_result()
        assert d["result_id"]  == 1
        assert d["student_id"] == "S1"
        assert d["score"]      == 60
        assert d["status"]     == "failed"


# ─────────────────────────────────────────────────────────────────────────────
# Database root container
# ─────────────────────────────────────────────────────────────────────────────

class TestDatabase:
    def test_initial_collections_empty(self):
        d = Database()
        assert len(d.students)   == 0
        assert len(d.teachers)   == 0
        assert len(d.classrooms) == 0
        assert len(d.labs)       == 0
        assert len(d.results)    == 0

    def test_created_at_is_datetime(self):
        d = Database()
        assert isinstance(d.created_at, datetime)
