"""
Unit tests for the email notification scheduler (src/notification_scheduler.py).

_check_and_notify() does lazy imports inside the function body, so we patch
at the source module level:
  - src.database.DatabaseContext  (lazy-imported by the scheduler)
  - src.email_service.send_email  (lazy-imported by the scheduler)

Two notifications are sent per lab:
  1. When lab transitions to 'active'         → "Lab is now open" (email_active_sent)
  2. When ≤ 60 minutes remain before closing  → "Lab ending soon" (email_warning_sent)

Requirements traced:
  UFR-11  student receives lab notifications
  SFR-7   automated notifications on lab state transitions
  SNFR-10 graceful degradation (no crash when no students or no email)
"""
import sys
import pytest
from pathlib import Path
from datetime import datetime, timedelta
from contextlib import contextmanager
from unittest.mock import patch, MagicMock, call

ROOT = Path(__file__).resolve().parents[2]
SRC  = ROOT / "src"
for p in (str(ROOT), str(SRC)):
    if p not in sys.path:
        sys.path.insert(0, p)

from src.notification_scheduler import _check_and_notify


# ── Fake domain objects ───────────────────────────────────────────────────────

class _FakeStudentSettings:
    def __init__(self, email_alerts=True, email=""):
        self.email_alerts = email_alerts
        self.email        = email


class _FakeStudent:
    def __init__(self, sid, email_alerts=True, email=""):
        self.student_id = sid
        self.settings   = _FakeStudentSettings(email_alerts, email)


class _FakeLab:
    def __init__(self, lab_id, title, active_time, complete_time, classroom_id):
        self.lab_id        = lab_id
        self.title         = title
        self.active_time   = active_time
        self.complete_time = complete_time
        self.classroom_id  = classroom_id
        # notification sent-flags (mirror real model attributes)
        self.email_active_sent  = False
        self.email_warning_sent = False
        self._p_changed         = False

    def get_current_status(self):
        now = datetime.now()
        if self.active_time is None or now < self.active_time:
            return "inactive"
        if self.complete_time is not None and now >= self.complete_time:
            return "completed"
        return "active"


class _FakeClassroom:
    def __init__(self, class_id, student_ids):
        self.class_id    = class_id
        self.student_ids = list(student_ids)


class _FakeDB:
    def __init__(self):
        self.labs       = {}
        self.classrooms = {}
        self.students   = {}


# ── Context-manager factory ───────────────────────────────────────────────────

def _make_ctx(db):
    @contextmanager
    def _ctx():
        yield db
    return _ctx


# ── Helper to run scheduler with mocked DB + email ───────────────────────────

def _run(db):
    """Execute _check_and_notify with fully mocked dependencies.

    Returns the mock send_email so callers can assert call counts / args.
    """
    mock_send = MagicMock(return_value=True)
    with patch("src.database.DatabaseContext", _make_ctx(db)):
        with patch("src.email_service.send_email", mock_send):
            _check_and_notify()
    return mock_send


# ── Active notification (email_active_sent) ───────────────────────────────────

class TestActiveNotification:

    def _make_active_db(self, email="student@test.com", email_alerts=True):
        db = _FakeDB()
        lab = _FakeLab(
            1, "Prolog Lab",
            active_time=datetime.now() - timedelta(minutes=5),
            complete_time=datetime.now() + timedelta(hours=3),
            classroom_id=10,
        )
        classroom = _FakeClassroom(10, ["STU1"])
        student   = _FakeStudent("STU1", email_alerts=email_alerts, email=email)
        db.labs[1]         = lab
        db.classrooms[10]  = classroom
        db.students["STU1"] = student
        return db, lab

    def test_active_lab_sends_open_email(self):
        db, lab = self._make_active_db()
        mock_send = _run(db)
        mock_send.assert_called_once()
        subject = mock_send.call_args[0][1]
        assert "active" in subject.lower() or "open" in subject.lower() or "Prolog Lab" in subject

    def test_active_notification_sets_flag(self):
        db, lab = self._make_active_db()
        _run(db)
        assert lab.email_active_sent is True
        assert lab._p_changed is True

    def test_active_email_not_resent_when_flag_set(self):
        db, lab = self._make_active_db()
        lab.email_active_sent = True          # already sent
        mock_send = _run(db)
        mock_send.assert_not_called()

    def test_inactive_lab_sends_no_email(self):
        db = _FakeDB()
        lab = _FakeLab(
            2, "Future Lab",
            active_time=datetime.now() + timedelta(hours=1),
            complete_time=datetime.now() + timedelta(hours=5),
            classroom_id=10,
        )
        db.labs[2]         = lab
        db.classrooms[10]  = _FakeClassroom(10, ["STU1"])
        db.students["STU1"] = _FakeStudent("STU1", email="s@test.com")
        mock_send = _run(db)
        mock_send.assert_not_called()

    def test_completed_lab_sends_no_active_email(self):
        db = _FakeDB()
        lab = _FakeLab(
            3, "Past Lab",
            active_time=datetime.now() - timedelta(hours=5),
            complete_time=datetime.now() - timedelta(hours=1),
            classroom_id=10,
        )
        db.labs[3]         = lab
        db.classrooms[10]  = _FakeClassroom(10, ["STU1"])
        db.students["STU1"] = _FakeStudent("STU1", email="s@test.com")
        mock_send = _run(db)
        mock_send.assert_not_called()

    def test_lab_without_time_window_skipped(self):
        db = _FakeDB()
        lab = _FakeLab(4, "No Window", active_time=None, complete_time=None, classroom_id=10)
        db.labs[4]         = lab
        db.classrooms[10]  = _FakeClassroom(10, ["STU1"])
        db.students["STU1"] = _FakeStudent("STU1", email="s@test.com")
        mock_send = _run(db)
        mock_send.assert_not_called()

    def test_student_with_alerts_disabled_skipped(self):
        db, _ = self._make_active_db(email_alerts=False)
        mock_send = _run(db)
        mock_send.assert_not_called()

    def test_student_with_no_email_skipped(self):
        db, _ = self._make_active_db(email="")
        mock_send = _run(db)
        mock_send.assert_not_called()

    def test_multiple_students_all_notified(self):
        db = _FakeDB()
        lab = _FakeLab(
            5, "Multi Lab",
            active_time=datetime.now() - timedelta(minutes=1),
            complete_time=datetime.now() + timedelta(hours=4),
            classroom_id=20,
        )
        classroom = _FakeClassroom(20, ["A", "B", "C"])
        db.labs[5]      = lab
        db.classrooms[20] = classroom
        db.students["A"]  = _FakeStudent("A", email="a@t.com")
        db.students["B"]  = _FakeStudent("B", email="b@t.com")
        db.students["C"]  = _FakeStudent("C", email="c@t.com")
        mock_send = _run(db)
        assert mock_send.call_count == 3

    def test_student_missing_from_db_gracefully_skipped(self):
        """Classroom references a student_id not in db.students — must not crash."""
        db = _FakeDB()
        lab = _FakeLab(
            6, "Ghost Lab",
            active_time=datetime.now() - timedelta(minutes=1),
            complete_time=datetime.now() + timedelta(hours=2),
            classroom_id=30,
        )
        db.labs[6]       = lab
        db.classrooms[30] = _FakeClassroom(30, ["GHOST"])
        # db.students is empty — student not found
        mock_send = _run(db)
        mock_send.assert_not_called()

    def test_classroom_not_found_gracefully_skipped(self):
        """Lab references a classroom_id not in db.classrooms — must not crash."""
        db = _FakeDB()
        lab = _FakeLab(
            7, "Orphan Lab",
            active_time=datetime.now() - timedelta(minutes=1),
            complete_time=datetime.now() + timedelta(hours=2),
            classroom_id=999,
        )
        db.labs[7] = lab
        # db.classrooms is empty
        mock_send = _run(db)
        mock_send.assert_not_called()

    def test_sent_email_recipient_matches_student_email(self):
        db, _ = self._make_active_db(email="specific@student.com")
        mock_send = _run(db)
        recipient = mock_send.call_args[0][0]
        assert recipient == "specific@student.com"


# ── Warning notification (email_warning_sent) ─────────────────────────────────

class TestWarningNotification:

    def _make_ending_soon_db(self, minutes_left=45):
        """Active lab with `minutes_left` minutes until close."""
        db = _FakeDB()
        lab = _FakeLab(
            100, "Closing Lab",
            active_time=datetime.now() - timedelta(hours=2),
            complete_time=datetime.now() + timedelta(minutes=minutes_left),
            classroom_id=50,
        )
        classroom  = _FakeClassroom(50, ["STU_W"])
        student    = _FakeStudent("STU_W", email="w@test.com")
        db.labs[100]        = lab
        db.classrooms[50]   = classroom
        db.students["STU_W"] = student
        return db, lab

    def test_warning_sent_within_60_minutes(self):
        db, lab = self._make_ending_soon_db(minutes_left=45)
        mock_send = _run(db)
        # Both active AND warning emails sent (first run, no flags set)
        subjects = [c[0][1] for c in mock_send.call_args_list]
        assert any("end" in s.lower() or "soon" in s.lower() or "min" in s.lower()
                   for s in subjects)

    def test_warning_sets_flag(self):
        db, lab = self._make_ending_soon_db(minutes_left=30)
        _run(db)
        assert lab.email_warning_sent is True

    def test_warning_not_resent_when_flag_set(self):
        db, lab = self._make_ending_soon_db(minutes_left=30)
        lab.email_active_sent  = True   # pretend already sent
        lab.email_warning_sent = True   # already warned
        mock_send = _run(db)
        mock_send.assert_not_called()

    def test_no_warning_when_more_than_60_minutes_remain(self):
        db, lab = self._make_ending_soon_db(minutes_left=90)
        mock_send = _run(db)
        # Active email fires, but NO warning email
        subjects = [c[0][1] for c in mock_send.call_args_list]
        assert not any("end" in s.lower() or "soon" in s.lower() or "min" in s.lower()
                       for s in subjects)

    def test_warning_not_sent_for_student_with_alerts_off(self):
        db, lab = self._make_ending_soon_db(minutes_left=20)
        # Override student's email_alerts
        db.students["STU_W"].settings.email_alerts = False
        mock_send = _run(db)
        mock_send.assert_not_called()

    def test_warning_not_sent_for_student_with_no_email(self):
        db, lab = self._make_ending_soon_db(minutes_left=20)
        db.students["STU_W"].settings.email = ""
        mock_send = _run(db)
        mock_send.assert_not_called()

    def test_exactly_at_60_minute_boundary_sends_warning(self):
        """60 minutes remaining is within the ≤60-min window."""
        db, lab = self._make_ending_soon_db(minutes_left=60)
        mock_send = _run(db)
        # At least one email should include "end" / "soon" / minutes count
        subjects = [c[0][1] for c in mock_send.call_args_list]
        assert any("end" in s.lower() or "min" in s.lower() or "soon" in s.lower()
                   for s in subjects)


# ── Lab without complete_time ─────────────────────────────────────────────────

class TestLabWithoutCompleteTime:

    def test_lab_with_only_active_time_skipped(self):
        """If complete_time is None the scheduler must skip the lab entirely."""
        db = _FakeDB()
        lab = _FakeLab(
            200, "No End",
            active_time=datetime.now() - timedelta(hours=1),
            complete_time=None,
            classroom_id=60,
        )
        db.labs[200]       = lab
        db.classrooms[60]  = _FakeClassroom(60, ["STU1"])
        db.students["STU1"] = _FakeStudent("STU1", email="s@t.com")
        mock_send = _run(db)
        mock_send.assert_not_called()
