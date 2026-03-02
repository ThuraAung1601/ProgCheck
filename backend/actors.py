from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException


@dataclass
class Actor:
    user: dict[str, Any]
    store: Any

    @property
    def user_id(self) -> str:
        return str(self.user.get("user_id", ""))

    @property
    def name(self) -> str:
        return str(self.user.get("name", ""))

    @property
    def password(self) -> str:
        return str(self.user.get("password_hash", ""))


@dataclass
class Student(Actor):
    @property
    def student_id(self) -> str:
        return self.user_id

    @property
    def studentID(self) -> str:
        return self.student_id

    @property
    def academicRecord(self) -> list[dict[str, str]]:
        submissions = self.store.list_items("submissions", limit=10_000)
        records: list[dict[str, str]] = []
        for submission in submissions:
            if str(submission.get("student_id", "")) != self.student_id:
                continue
            records.append(
                {
                    "submission_id": str(submission.get("submission_id", "")),
                    "question_id": str(submission.get("question_id", "")),
                    "class_id": str(submission.get("class_id", "")),
                    "lab_id": str(submission.get("lab_id", "")),
                    "status": str(submission.get("status", "")),
                    "score": str(submission.get("score", "")),
                    "submission_time": str(submission.get("created_at", "")),
                }
            )
        records.sort(key=lambda item: item.get("submission_time", ""), reverse=True)
        return records

    def list_classrooms(self) -> list[dict[str, Any]]:
        classrooms = self.store.list_items("classrooms", limit=10_000)
        return [room for room in classrooms if self.student_id in room.get("student_ids", [])]

    def list_labs(self) -> list[dict[str, Any]]:
        labs = self.store.list_items("labs", limit=10_000)
        enrolled_ids = {int(room.get("class_id")) for room in self.list_classrooms()}
        return [lab for lab in labs if int(lab.get("class_id", -1)) in enrolled_ids]

    def ensure_class_enrolled(self, class_id: int) -> dict[str, Any]:
        classroom = self.store.get_item("classrooms", str(class_id))
        if not classroom:
            raise HTTPException(status_code=404, detail="Classroom not found")
        if self.student_id not in classroom.get("student_ids", []):
            raise HTTPException(status_code=403, detail="Student is not enrolled in this classroom")
        return classroom


@dataclass
class Teacher(Actor):
    @property
    def teacher_id(self) -> str:
        return self.user_id

    @property
    def teacherID(self) -> str:
        return self.teacher_id

    @property
    def instructor_id(self) -> str:
        return self.teacher_id

    @property
    def coursesTeach(self) -> list[dict[str, Any]]:
        return self.list_classrooms()

    def list_classrooms(self) -> list[dict[str, Any]]:
        classrooms = self.store.list_items("classrooms", limit=10_000)
        return [room for room in classrooms if room.get("instructor_id") == self.teacher_id]

    def list_labs(self) -> list[dict[str, Any]]:
        labs = self.store.list_items("labs", limit=10_000)
        own_class_ids = {int(room.get("class_id")) for room in self.list_classrooms()}
        return [lab for lab in labs if int(lab.get("class_id", -1)) in own_class_ids]

    def ensure_class_owner(self, class_id: int) -> dict[str, Any]:
        classroom = self.store.get_item("classrooms", str(class_id))
        if not classroom:
            raise HTTPException(status_code=404, detail="Classroom not found")
        if classroom.get("instructor_id") != self.teacher_id:
            raise HTTPException(status_code=403, detail="Only classroom instructor can manage this classroom")
        return classroom


def build_actor(user: dict[str, Any], store: Any) -> Actor:
    role = user.get("role")
    if role == "student":
        return Student(user=user, store=store)
    if role == "instructor":
        return Teacher(user=user, store=store)
    return Actor(user=user, store=store)


StudentActor = Student
InstructorActor = Teacher
