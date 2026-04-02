"""
ZODB Data Models for ProgCheck
Persistent classes for storing user data, classrooms, labs, and settings
"""
from persistent import Persistent
from persistent.list import PersistentList
from persistent.mapping import PersistentMapping
from datetime import datetime
import bcrypt
from typing import Optional, Dict, List


class UserSettings(Persistent):
    """User preferences and settings"""
    def __init__(self):
        self.theme = "light"  # "light" or "dark"
        self.auto_save = True
        self.email_alerts = True
        self.display_name = ""
        self.email = ""
        self.phone = ""
        self.created_at = datetime.now()
        self.updated_at = datetime.now()


class Student(Persistent):
    """Student account and metadata"""
    def __init__(self, student_id: str, username: str, password: str):
        self.student_id = student_id
        self.username = username
        self.password_hash = self._hash_password(password)
        self.settings = UserSettings()
        self.enrolled_classrooms = PersistentList()  # List of classroom IDs
        self.completed_labs = PersistentMapping()  # {lab_id: submission_data}
        self.created_at = datetime.now()
        self.updated_at = datetime.now()

    @staticmethod
    def _hash_password(password: str) -> str:
        """Hash password using bcrypt"""
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    def verify_password(self, password: str) -> bool:
        """Verify password against hash"""
        return bcrypt.checkpw(password.encode('utf-8'), self.password_hash.encode('utf-8'))

    def update_password(self, new_password: str):
        """Update password"""
        self.password_hash = self._hash_password(new_password)
        self.updated_at = datetime.now()


class Teacher(Persistent):
    """Teacher account and metadata"""
    def __init__(self, teacher_id: str, username: str, password: str):
        self.teacher_id = teacher_id
        self.username = username
        self.password_hash = self._hash_password(password)
        self.settings = UserSettings()
        self.owned_classrooms = PersistentList()  # List of classroom IDs
        self.created_at = datetime.now()
        self.updated_at = datetime.now()

    @staticmethod
    def _hash_password(password: str) -> str:
        """Hash password using bcrypt"""
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    def verify_password(self, password: str) -> bool:
        """Verify password against hash"""
        return bcrypt.checkpw(password.encode('utf-8'), self.password_hash.encode('utf-8'))

    def update_password(self, new_password: str):
        """Update password"""
        self.password_hash = self._hash_password(new_password)
        self.updated_at = datetime.now()


class Lab(Persistent):
    """Lab/Assignment configuration"""
    def __init__(self, lab_id: str, title: str, description: str, teacher_id: str, classroom_id: str):
        self.lab_id = lab_id
        self.title = title
        self.description = description
        self.teacher_id = teacher_id
        self.classroom_id = classroom_id
        self.is_active = False  # Students can only access when active
        self.problem_file = ""  # Path to problem description
        self.test_file = ""  # Path to test file
        self.due_date = None  # Optional deadline
        self.submissions = PersistentMapping()  # {student_id: [submission1, submission2, ...]}
        self.created_at = datetime.now()
        self.updated_at = datetime.now()

    def activate(self):
        """Activate lab for student access"""
        self.is_active = True
        self.updated_at = datetime.now()

    def deactivate(self):
        """Deactivate lab"""
        self.is_active = False
        self.updated_at = datetime.now()

    def add_submission(self, student_id: str, submission_data: Dict):
        """Add student submission"""
        if student_id not in self.submissions:
            self.submissions[student_id] = PersistentList()
        submission_data['timestamp'] = datetime.now()
        self.submissions[student_id].append(submission_data)
        self.updated_at = datetime.now()


class Classroom(Persistent):
    """Classroom/Course container"""
    def __init__(self, classroom_id: str, name: str, teacher_id: str, description: str = ""):
        self.classroom_id = classroom_id
        self.name = name
        self.description = description
        self.teacher_id = teacher_id
        self.students = PersistentList()  # List of student IDs
        self.labs = PersistentList()  # List of lab IDs in this classroom
        self.created_at = datetime.now()
        self.updated_at = datetime.now()

    def add_student(self, student_id: str):
        """Enroll student in classroom"""
        if student_id not in self.students:
            self.students.append(student_id)
            self.updated_at = datetime.now()

    def remove_student(self, student_id: str):
        """Remove student from classroom"""
        if student_id in self.students:
            self.students.remove(student_id)
            self.updated_at = datetime.now()

    def add_lab(self, lab_id: str):
        """Add lab to classroom"""
        if lab_id not in self.labs:
            self.labs.append(lab_id)
            self.updated_at = datetime.now()

    def remove_lab(self, lab_id: str):
        """Remove lab from classroom"""
        if lab_id in self.labs:
            self.labs.remove(lab_id)
            self.updated_at = datetime.now()


class Database(Persistent):
    """Root database container"""
    def __init__(self):
        self.students = PersistentMapping()  # {student_id: Student}
        self.teachers = PersistentMapping()  # {teacher_id: Teacher}
        self.classrooms = PersistentMapping()  # {classroom_id: Classroom}
        self.labs = PersistentMapping()  # {lab_id: Lab}
        self.created_at = datetime.now()
