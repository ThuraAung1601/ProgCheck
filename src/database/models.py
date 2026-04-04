"""
ZODB Data Models for ProgCheck
Matches the class diagram exactly, with extra operational fields where noted.
"""
from persistent import Persistent
from persistent.list import PersistentList
from persistent.mapping import PersistentMapping
from datetime import datetime
import bcrypt
from typing import Optional


# ── Not in class diagram but required for UI preferences ────────────────────

class UserSettings(Persistent):
    """User preferences (UI only — not in class diagram)"""
    def __init__(self):
        self.theme = "light"        # "light" | "dark"
        self.auto_save = True
        self.email_alerts = True
        self.display_name = ""
        self.email = ""
        self.phone = ""
        self.created_at = datetime.now()
        self.updated_at = datetime.now()


# ── Class diagram entities ───────────────────────────────────────────────────

class Student(Persistent):
    """
    Class diagram:
      - academicRecord : list<dict<string, string>>
      - name           : string
      - password       : string
      - studentID      : string
    """
    def __init__(self, student_id: str, name: str, password: str):
        self.student_id = student_id                    # studentID: string
        self.name = name                                # name: string
        self.password = self._hash_password(password)  # password: string (hashed)
        self.academic_record = PersistentList()         # academicRecord: list[{lab_id, score}]
        self.settings = UserSettings()                  # extra: UI preferences
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
        """Append {lab_id, score} entry to academic record"""
        self.academic_record.append({"lab_id": lab_id, "score": score})
        self.updated_at = datetime.now()


class Teacher(Persistent):
    """
    Class diagram:
      - coursesTeach : list<Classroom>
      - name         : string
      - password     : string
      - teacherID    : string
    """
    def __init__(self, teacher_id: str, name: str, password: str):
        self.teacher_id = teacher_id                    # teacherID: string
        self.name = name                                # name: string
        self.password = self._hash_password(password)  # password: string (hashed)
        self.courses_teach = PersistentList()           # coursesTeach: list of classroom_ids
        self.settings = UserSettings()                  # extra: UI preferences
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


class TestCase(Persistent):
    """
    Class diagram:
      - expectedOutput : string
      - input          : string
      - testcaseID     : int
    Methods:
      + createTestCase(string, string): void
      + deleteTestCase(int): void      [handled at parent level]
      + editTestCase(string, string, int): void
    """
    def __init__(self, testcase_id: int):
        self.testcase_id = testcase_id  # testcaseID: int
        self.input = ""                 # input: string
        self.expected_output = ""       # expectedOutput: string
        self.created_at = datetime.now()
        self.updated_at = datetime.now()

    def create_testcase(self, input_str: str, expected_output: str):
        """createTestCase(string, string): void"""
        self.input = input_str
        self.expected_output = expected_output
        self.updated_at = datetime.now()

    def edit_testcase(self, input_str: str = None, expected_output: str = None):
        """editTestCase(string, string, int): void"""
        if input_str is not None:
            self.input = input_str
        if expected_output is not None:
            self.expected_output = expected_output
        self.updated_at = datetime.now()


class LabQuestion(Persistent):
    """
    Class diagram:
      - title          : string
      - problem        : string
      - questionID     : int
      - questionNumber : int
      - testCase       : list<TestCase>
    Methods:
      + addTestCase(int): void
      + createLabQuestion(string, int): void
      + deleteLabQuestion(int): void   [handled at parent level]
      + editLabQuestion(string, int, int): void
      + getTestCase(int): list<TestCase>
    """
    def __init__(self, question_id: int, title: str, problem: str, question_number: int = 0):
        self.question_id = question_id          # questionID: int
        self.title = title                      # title : string
        self.problem = problem                  # problem: string
        self.question_number = question_number  # questionNumber: int (order within lab)
        self.question_size = 0                  # extra: count of test cases (convenience)
        self.test_case = PersistentList()       # testCase: list<TestCase>
        self.created_at = datetime.now()
        self.updated_at = datetime.now()

    def create_lab_question(self, title: str, problem: str, question_number: int):
        """createLabQuestion(string, int): void"""
        self.title = title
        self.problem = problem
        self.question_number = question_number
        self.updated_at = datetime.now()

    def add_testcase(self, testcase: TestCase):
        """addTestCase(int): void — appends a TestCase object"""
        self.test_case.append(testcase)
        self.question_size = len(self.test_case)
        self.updated_at = datetime.now()

    def delete_testcase(self, testcase_id: int):
        """deleteTestCase handled here for convenience"""
        self.test_case = PersistentList(
            [tc for tc in self.test_case if tc.testcase_id != testcase_id]
        )
        self.question_size = len(self.test_case)
        self.updated_at = datetime.now()

    def edit_lab_question(self, problem: str = None, question_number: int = None):
        """editLabQuestion(string, int, int): void"""
        if problem is not None:
            self.problem = problem
        if question_number is not None:
            self.question_number = question_number
        self.updated_at = datetime.now()

    def get_testcase(self, testcase_id: int) -> Optional[TestCase]:
        """getTestCase(int): list<TestCase> — returns single TestCase by ID"""
        for tc in self.test_case:
            if tc.testcase_id == testcase_id:
                return tc
        return None


class Lab(Persistent):
    """
    Class diagram:
      - labID       : int
      - labQuestion : list<LabQuestion>
    Methods:
      + addQuestion(int): void
      + createLab(string): void
      + deleteLab(int): void           [handled at parent level]
      + editLab(string, int): void
      + getQuestion(int): list<LabQuestions>
    Extra (not in diagram but needed):
      - title         : string
      - classroom_id  : int
      - active_time   : datetime  — when lab becomes accessible to students
      - complete_time : datetime  — when lab closes (no more submissions)
    Status is computed from current time:
      inactive  : before active_time (teacher can edit, students cannot access)
      active    : active_time <= now < complete_time (students can submit)
      completed : now >= complete_time (closed for everyone)
    """
    def __init__(self, lab_id: int, title: str = ""):
        self.lab_id = lab_id                    # labID: int
        self.title = title                      # extra: human-readable title
        self.lab_question = PersistentList()    # labQuestion: list<LabQuestion>
        self.classroom_id = None                # extra: parent classroom reference
        self.active_time = None                 # extra: datetime when lab opens
        self.complete_time = None               # extra: datetime when lab closes
        self.created_at = datetime.now()
        self.updated_at = datetime.now()

    def get_current_status(self) -> str:
        """Compute status based on current time relative to active/complete windows."""
        now = datetime.now()
        if self.active_time is None:
            return "inactive"
        if now < self.active_time:
            return "inactive"
        if self.complete_time is not None and now >= self.complete_time:
            return "completed"
        return "active"

    def create_lab(self, title: str):
        """createLab(string): void"""
        self.title = title
        self.updated_at = datetime.now()

    def add_question(self, question: LabQuestion):
        """addQuestion(int): void — appends a LabQuestion object"""
        self.lab_question.append(question)
        self.updated_at = datetime.now()

    def delete_lab_question(self, question_id: int):
        """deleteLab: remove question by ID"""
        self.lab_question = PersistentList(
            [q for q in self.lab_question if q.question_id != question_id]
        )
        self.updated_at = datetime.now()

    def edit_lab(self, title: str = None):
        """editLab(string, int): void"""
        if title is not None:
            self.title = title
        self.updated_at = datetime.now()

    def get_question(self, question_id: int) -> Optional[LabQuestion]:
        """getQuestion(int): list<LabQuestions> — returns single question by ID"""
        for q in self.lab_question:
            if q.question_id == question_id:
                return q
        return None


class Classroom(Persistent):
    """
    Class diagram:
      - classID       : int
      - className     : string
      - classSize     : int
      - prerequisites : string
    Methods:
      + addStudent(string, int): void
      + createClassroom(int, string, int, int): void
      + deleteClassroom(int): void     [handled at parent level]
      + editClassroom(string, int, int): void
      + getClassInfo(int): <ClassRoom, list<Student>>
    Extra (not in diagram but needed):
      - teacher_id  : string
      - student_ids : list<string>
      - lab_ids     : list<int>
    """
    def __init__(self, class_id: int, class_name: str, teacher_id: str):
        self.class_id = class_id                # classID: int
        self.class_name = class_name            # className: string
        self.class_size = 0                     # classSize: int
        self.prerequisites = ""                 # prerequisites: string
        self.teacher_id = teacher_id            # extra: owning teacher
        self.student_ids = PersistentList()     # extra: enrolled student IDs
        self.lab_ids = PersistentList()         # extra: assigned lab IDs
        self.created_at = datetime.now()
        self.updated_at = datetime.now()

    def create_classroom(self, class_id: int, class_name: str,
                         class_size: int, prerequisites: str = ""):
        """createClassroom(int, string, int, int): void"""
        self.class_id = class_id
        self.class_name = class_name
        self.class_size = class_size
        self.prerequisites = prerequisites
        self.updated_at = datetime.now()

    def add_student(self, student_id: str):
        """addStudent(string, int): void"""
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
        """editClassroom(string, int, int): void"""
        if class_name is not None:
            self.class_name = class_name
        if prerequisites is not None:
            self.prerequisites = prerequisites
        self.updated_at = datetime.now()

    def get_class_info(self) -> dict:
        """getClassInfo(int): <ClassRoom, list<Student>>"""
        return {
            "class_id": self.class_id,
            "class_name": self.class_name,
            "class_size": self.class_size,
            "prerequisites": self.prerequisites,
            "teacher_id": self.teacher_id,
            "student_ids": list(self.student_ids),
            "lab_ids": list(self.lab_ids),
        }

    def delete_classroom(self):
        """deleteClassroom(int): void — caller removes from DB mapping"""
        self.updated_at = datetime.now()


class Result(Persistent):
    """
    Class diagram:
      - codeFile       : File
      - questionID     : int
      - resultID       : int
      - score          : int
      - status         : string
      - studentID      : string
      - submissionTime : DateTime
    Methods:
      + getResult(int): Result
      + saveResult(int, int, string, File): void
    """
    def __init__(self, result_id: int, student_id: str, question_id: int):
        self.result_id = result_id              # resultID: int
        self.student_id = student_id            # studentID: string
        self.question_id = question_id          # questionID: int
        self.code_file = None                   # codeFile: File (stored as string)
        self.score = 0                          # score: int
        self.status = "pending"                 # status: string
        self.submission_time = datetime.now()   # submissionTime: DateTime
        self.created_at = datetime.now()
        self.updated_at = datetime.now()

    def get_result(self) -> dict:
        """getResult(int): Result"""
        return {
            "result_id": self.result_id,
            "student_id": self.student_id,
            "question_id": self.question_id,
            "score": self.score,
            "status": self.status,
            "submission_time": self.submission_time,
        }

    def save_result(self, result_id: int, score: int, status: str, code_file):
        """saveResult(int, int, string, File): void"""
        self.result_id = result_id
        self.score = score
        self.status = status
        self.code_file = code_file
        self.submission_time = datetime.now()
        self.updated_at = datetime.now()


# ── Root container ───────────────────────────────────────────────────────────

class Database(Persistent):
    """ZODB root container — holds all top-level mappings"""
    def __init__(self):
        self.students = PersistentMapping()     # {student_id : Student}
        self.teachers = PersistentMapping()     # {teacher_id : Teacher}
        self.classrooms = PersistentMapping()   # {class_id   : Classroom}
        self.labs = PersistentMapping()         # {lab_id     : Lab}
        self.results = PersistentMapping()      # {result_id  : Result}
        self.created_at = datetime.now()
