"""
ZODB Database connection and initialization.
Mock classes mirror models.py exactly for in-memory fallback.
"""
import os
from ZODB import FileStorage, DB
import transaction
from .models import Database
import bcrypt
from datetime import datetime


# Global database instance
db_instance = None
storage = None
mock_db = None


# ── Mock infrastructure ──────────────────────────────────────────────────────

class MockConnection:
    def __init__(self, root_data):
        self.root_data = root_data

    def root(self):
        return {'database': self.root_data}

    def close(self):
        pass


class MockDB:
    def __init__(self, root):
        self.root_data = root

    def open(self):
        return MockConnection(self.root_data)

    def close(self):
        pass


class MockDatabase:
    """In-memory root container — mirrors models.Database"""
    def __init__(self):
        self.students = {}
        self.teachers = {}
        self.classrooms = {}
        self.labs = {}
        self.results = {}
        self.created_at = datetime.now()


# ── Mock entity classes (mirror models.py) ───────────────────────────────────

class MockUserSettings:
    def __init__(self):
        self.theme = "light"
        self.auto_save = True
        self.email_alerts = True
        self.tab_size = 2
        self.display_name = ""
        self.email = ""
        self.phone = ""
        self.created_at = datetime.now()
        self.updated_at = datetime.now()


class MockStudent:
    """Mirrors models.Student"""
    def __init__(self, student_id: str, name: str, password: str):
        self.student_id = student_id
        self.name = name
        self.password = self._hash_password(password)
        self.academic_record = []       # list of {lab_id, score} dicts
        self.settings = MockUserSettings()
        self.code_files = {}            # filename -> code content
        self.created_at = datetime.now()
        self.updated_at = datetime.now()

    @staticmethod
    def _hash_password(password: str) -> str:
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    def verify_password(self, password: str) -> bool:
        return bcrypt.checkpw(password.encode('utf-8'), self.password.encode('utf-8'))

    def update_password(self, new_password: str):
        self.password = self._hash_password(new_password)
        self.updated_at = datetime.now()

    def add_to_academic_record(self, lab_id: str, score: str):
        self.academic_record.append({"lab_id": lab_id, "score": score})
        self.updated_at = datetime.now()


class MockTeacher:
    """Mirrors models.Teacher"""
    def __init__(self, teacher_id: str, name: str, password: str):
        self.teacher_id = teacher_id
        self.name = name
        self.password = self._hash_password(password)
        self.courses_teach = []         # list of classroom_ids
        self.settings = MockUserSettings()
        self.code_files = {}            # filename -> code content
        self.created_at = datetime.now()
        self.updated_at = datetime.now()

    @staticmethod
    def _hash_password(password: str) -> str:
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    def verify_password(self, password: str) -> bool:
        return bcrypt.checkpw(password.encode('utf-8'), self.password.encode('utf-8'))

    def update_password(self, new_password: str):
        self.password = self._hash_password(new_password)
        self.updated_at = datetime.now()


class MockTestCase:
    """Mirrors models.TestCase"""
    def __init__(self, testcase_id: int):
        self.testcase_id = testcase_id
        self.input = ""
        self.expected_output = ""
        self.created_at = datetime.now()
        self.updated_at = datetime.now()

    def create_testcase(self, input_str: str, expected_output: str):
        self.input = input_str
        self.expected_output = expected_output
        self.updated_at = datetime.now()

    def edit_testcase(self, input_str: str = None, expected_output: str = None):
        if input_str is not None:
            self.input = input_str
        if expected_output is not None:
            self.expected_output = expected_output
        self.updated_at = datetime.now()


class MockLabQuestion:
    """Mirrors models.LabQuestion"""
    def __init__(self, question_id: int, title: str, problem: str, question_number: int = 0):
        self.question_id = question_id
        self.title = title
        self.problem = problem
        self.question_number = question_number
        self.question_size = 0
        self.test_case = []
        self.created_at = datetime.now()
        self.updated_at = datetime.now()

    def create_lab_question(self, problem: str, question_number: int):
        self.problem = problem
        self.question_number = question_number
        self.updated_at = datetime.now()

    def add_testcase(self, testcase):
        self.test_case.append(testcase)
        self.question_size = len(self.test_case)
        self.updated_at = datetime.now()

    def delete_testcase(self, testcase_id: int):
        self.test_case = [tc for tc in self.test_case if tc.testcase_id != testcase_id]
        self.question_size = len(self.test_case)
        self.updated_at = datetime.now()

    def edit_lab_question(self, problem: str = None, question_number: int = None):
        if problem is not None:
            self.problem = problem
        if question_number is not None:
            self.question_number = question_number
        self.updated_at = datetime.now()

    def get_testcase(self, testcase_id: int):
        for tc in self.test_case:
            if tc.testcase_id == testcase_id:
                return tc
        return None


class MockLab:
    """Mirrors models.Lab"""
    def __init__(self, lab_id: int, title: str = ""):
        self.lab_id = lab_id
        self.title = title
        self.lab_question = []
        self.classroom_id = None
        self.is_active = False
        self.created_at = datetime.now()
        self.updated_at = datetime.now()

    def create_lab(self, title: str):
        self.title = title
        self.updated_at = datetime.now()

    def add_question(self, question):
        self.lab_question.append(question)
        self.updated_at = datetime.now()

    def delete_lab_question(self, question_id: int):
        self.lab_question = [q for q in self.lab_question if q.question_id != question_id]
        self.updated_at = datetime.now()

    def edit_lab(self, title: str = None):
        if title is not None:
            self.title = title
        self.updated_at = datetime.now()

    def get_question(self, question_id: int):
        for q in self.lab_question:
            if q.question_id == question_id:
                return q
        return None

    def activate(self):
        self.is_active = True
        self.updated_at = datetime.now()

    def deactivate(self):
        self.is_active = False
        self.updated_at = datetime.now()


class MockClassroom:
    """Mirrors models.Classroom"""
    def __init__(self, class_id: int, class_name: str, teacher_id: str):
        self.class_id = class_id
        self.class_name = class_name
        self.class_size = 0
        self.prerequisites = ""
        self.teacher_id = teacher_id
        self.student_ids = []
        self.lab_ids = []
        self.created_at = datetime.now()
        self.updated_at = datetime.now()

    def create_classroom(self, class_id: int, class_name: str,
                         class_size: int, prerequisites: str = ""):
        self.class_id = class_id
        self.class_name = class_name
        self.class_size = class_size
        self.prerequisites = prerequisites
        self.updated_at = datetime.now()

    def add_student(self, student_id: str):
        if student_id not in self.student_ids:
            self.student_ids.append(student_id)
            self.class_size = len(self.student_ids)
            self.updated_at = datetime.now()

    def remove_student(self, student_id: str):
        if student_id in self.student_ids:
            self.student_ids.remove(student_id)
            self.class_size = len(self.student_ids)
            self.updated_at = datetime.now()

    def edit_classroom(self, class_name: str = None, prerequisites: str = None):
        if class_name is not None:
            self.class_name = class_name
        if prerequisites is not None:
            self.prerequisites = prerequisites
        self.updated_at = datetime.now()

    def get_class_info(self) -> dict:
        return {
            "class_id": self.class_id,
            "class_name": self.class_name,
            "class_size": self.class_size,
            "prerequisites": self.prerequisites,
            "teacher_id": self.teacher_id,
            "student_ids": list(self.student_ids),
            "lab_ids": list(self.lab_ids),
        }


class MockResult:
    """Mirrors models.Result"""
    def __init__(self, result_id: int, student_id: str, question_id: int):
        self.result_id = result_id
        self.student_id = student_id
        self.question_id = question_id
        self.code_file = None
        self.score = 0
        self.status = "pending"
        self.submission_time = datetime.now()
        self.created_at = datetime.now()
        self.updated_at = datetime.now()

    def get_result(self) -> dict:
        return {
            "result_id": self.result_id,
            "student_id": self.student_id,
            "question_id": self.question_id,
            "score": self.score,
            "status": self.status,
            "submission_time": self.submission_time,
        }

    def save_result(self, result_id: int, score: int, status: str, code_file=None):
        self.result_id = result_id
        self.score = score
        self.status = status
        self.code_file = code_file
        self.submission_time = datetime.now()
        self.updated_at = datetime.now()


# ── Database lifecycle ───────────────────────────────────────────────────────

def init_database(db_path: str = "data/progcheck.fs"):
    """Initialize ZODB database, with fallback to in-memory mock"""
    global db_instance, storage, mock_db

    try:
        dir_path = os.path.dirname(db_path) if os.path.dirname(db_path) else "."
        os.makedirs(dir_path, exist_ok=True)

        storage = FileStorage.FileStorage(db_path)
        db_instance = DB(storage)

        connection = db_instance.open()
        root = connection.root()

        if 'database' not in root:
            root['database'] = Database()
            transaction.commit()
            print(f"[OK] Database initialized at {db_path}")
        else:
            print(f"[OK] Database loaded from {db_path}")

        connection.close()
    except Exception as e:
        print(f"[WARNING] ZODB initialization failed, using in-memory mock: {e}")
        mock_db_root = MockDatabase()
        mock_db = MockDB(mock_db_root)
        print("[OK] Mock in-memory database initialized")


def get_root():
    """Return (db_root, connection) from ZODB or mock"""
    if db_instance is not None:
        connection = db_instance.open()
        return connection.root()['database'], connection
    elif mock_db is not None:
        connection = mock_db.open()
        return connection.root()['database'], connection
    else:
        raise RuntimeError("Database not initialized. Call init_database() first.")


def close_database():
    """Close database connection"""
    global db_instance, storage
    if db_instance:
        db_instance.close()
    if storage:
        storage.close()
    print("[OK] Database closed")


class DatabaseContext:
    """Context manager for database operations (ZODB or mock)"""
    def __init__(self):
        self.connection = None
        self.root = None

    def __enter__(self):
        if db_instance is None and mock_db is None:
            raise RuntimeError("Database not initialized")
        db = db_instance if db_instance is not None else mock_db
        self.connection = db.open()
        self.root = self.connection.root()['database']
        return self.root

    def __exit__(self, exc_type, _exc_val, _exc_tb):
        if exc_type:
            transaction.abort()
        else:
            transaction.commit()
        if self.connection:
            self.connection.close()


def commit_changes():
    transaction.commit()


def abort_changes():
    transaction.abort()
