"""Database module for ZODB integration with fallback to in-memory mock"""
from .db import (
    init_database, get_root, close_database, DatabaseContext,
    commit_changes, abort_changes,
)
# Always use the real Persistent models so ZODB can track changes properly.
# models.Student / Teacher work fine in the mock (plain dict) fallback too.
from .models import (
    Database, Student, Teacher,
    Classroom, Lab, LabQuestion, TestCase, Result, UserSettings,
)

__all__ = [
    'init_database',
    'get_root',
    'close_database',
    'DatabaseContext',
    'commit_changes',
    'abort_changes',
    'Database',
    'Student',
    'Teacher',
    'Classroom',
    'Lab',
    'LabQuestion',
    'TestCase',
    'Result',
    'UserSettings',
]
