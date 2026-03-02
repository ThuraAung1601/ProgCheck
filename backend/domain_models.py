from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class TestCase:
    testcaseID: int
    input: str
    expectedOutput: str

    @classmethod
    def createTestCase(cls, input_value: str, expected_output: str, testcase_id: int) -> "TestCase":
        return cls(testcaseID=testcase_id, input=input_value, expectedOutput=expected_output)

    def editTestCase(self, input_value: str, expected_output: str, testcase_id: int) -> None:
        if self.testcaseID != testcase_id:
            return
        self.input = input_value
        self.expectedOutput = expected_output


@dataclass
class LabQuestion:
    questionID: int
    questionNumber: int
    problem: str
    testCase: list[TestCase] = field(default_factory=list)
    deleted: bool = False

    @classmethod
    def createLabQuestion(cls, problem: str, question_id: int, question_number: int) -> "LabQuestion":
        return cls(questionID=question_id, questionNumber=question_number, problem=problem)

    def addTestCase(self, testcase_id: int, input_value: str, expected_output: str) -> None:
        self.testCase.append(TestCase.createTestCase(input_value, expected_output, testcase_id))

    def getTestCase(self, testcase_id: int) -> list[TestCase]:
        return [item for item in self.testCase if item.testcaseID == testcase_id]

    def editLabQuestion(self, problem: str, question_number: int, question_id: int) -> None:
        if self.questionID != question_id:
            return
        self.problem = problem
        self.questionNumber = question_number

    def deleteLabQuestion(self, question_id: int) -> None:
        if self.questionID == question_id:
            self.deleted = True


@dataclass
class Lab:
    labID: int
    title: str
    labQuestion: list[LabQuestion] = field(default_factory=list)
    deleted: bool = False

    @classmethod
    def createLab(cls, title: str, lab_id: int) -> "Lab":
        return cls(labID=lab_id, title=title)

    def addQuestion(self, question_id: int, question_number: int, problem: str) -> None:
        self.labQuestion.append(LabQuestion.createLabQuestion(problem, question_id, question_number))

    def getQuestion(self, question_id: int) -> list[LabQuestion]:
        return [question for question in self.labQuestion if question.questionID == question_id and not question.deleted]

    def editLab(self, title: str, lab_id: int) -> None:
        if self.labID == lab_id:
            self.title = title

    def deleteLab(self, lab_id: int) -> None:
        if self.labID == lab_id:
            self.deleted = True


@dataclass
class Classroom:
    classID: int
    className: str
    prerequisites: str
    classSize: int
    students: list[str] = field(default_factory=list)
    labs: list[Lab] = field(default_factory=list)
    deleted: bool = False

    @classmethod
    def createClassroom(
        cls,
        class_id: int,
        class_name: str,
        prerequisites: str,
        class_size: int,
    ) -> "Classroom":
        return cls(
            classID=class_id,
            className=class_name,
            prerequisites=prerequisites,
            classSize=class_size,
        )

    def addStudent(self, student_id: str, class_id: int) -> None:
        if self.classID != class_id:
            return
        if student_id not in self.students:
            self.students.append(student_id)

    def editClassroom(self, class_name: str, prerequisites: str, class_size: int) -> None:
        self.className = class_name
        self.prerequisites = prerequisites
        self.classSize = class_size

    def deleteClassroom(self, class_id: int) -> None:
        if self.classID == class_id:
            self.deleted = True

    def getClassInfo(self, class_id: int) -> tuple["Classroom", list[str]]:
        if self.classID != class_id:
            raise ValueError("class_id does not match classroom")
        return self, list(self.students)


@dataclass
class Result:
    resultID: int
    questionID: int
    studentID: str
    status: str
    score: int
    codeFile: str
    submissionTime: datetime

    @classmethod
    def saveResult(
        cls,
        result_id: int,
        question_id: int,
        student_id: str,
        score: int,
        code_file: str,
        status: str,
    ) -> "Result":
        return cls(
            resultID=result_id,
            questionID=question_id,
            studentID=student_id,
            status=status,
            score=score,
            codeFile=code_file,
            submissionTime=datetime.utcnow(),
        )

    @staticmethod
    def getResult(result_id: int, results: list["Result"]) -> "Result | None":
        for item in results:
            if item.resultID == result_id:
                return item
        return None


__all__ = [
    "Classroom",
    "Lab",
    "LabQuestion",
    "Result",
    "TestCase",
]
