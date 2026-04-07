"""
Lab Management Routes - Updated to match class diagram
Handles Lab, LabQuestion, TestCase, and Result entities
"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List
from src.database import DatabaseContext, Lab, LabQuestion, TestCase, Result, commit_changes
from datetime import datetime
import random

router = APIRouter(prefix="/api/labs", tags=["labs"])


# ========== Request/Response Models ==========

class LabCreateRequest(BaseModel):
    title: str
    classroom_id: int
    active_time: Optional[str] = None    # ISO datetime string, e.g. "2026-04-10T09:00"
    complete_time: Optional[str] = None  # ISO datetime string


class LabResponse(BaseModel):
    lab_id: int
    title: str
    classroom_id: Optional[int]
    status: str          # "inactive" | "active" | "completed"
    active_time: Optional[str]
    complete_time: Optional[str]
    question_count: int
    created_at: str


class LabListResponse(BaseModel):
    labs: List[LabResponse]


class LabQuestionCreateRequest(BaseModel):
    title: str
    problem: str


class TestCaseCreateRequest(BaseModel):
    input: str
    expected_output: str


class TestCaseResponse(BaseModel):
    testcase_id: int
    input: str
    expected_output: str


class LabQuestionResponse(BaseModel):
    question_id: int
    title: str
    problem: str
    question_size: int
    test_cases: List[TestCaseResponse]


class ResultCreateRequest(BaseModel):
    student_id: str
    question_id: int
    code_file: str


class ResultResponse(BaseModel):
    result_id: int
    student_id: str
    question_id: int
    score: int
    status: str
    submission_time: str
    code_file: str = ""


# ========== Helpers ==========

def _parse_dt(dt_str: Optional[str]) -> Optional[datetime]:
    """Parse ISO datetime string to datetime, accepting multiple common formats."""
    if not dt_str:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(dt_str, fmt)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse datetime: {dt_str!r}. Use ISO format e.g. '2026-04-10T09:00'")


def _lab_response(lab: Lab) -> LabResponse:
    return LabResponse(
        lab_id=lab.lab_id,
        title=lab.title,
        classroom_id=lab.classroom_id,
        status=lab.get_current_status(),
        active_time=lab.active_time.isoformat() if lab.active_time else None,
        complete_time=lab.complete_time.isoformat() if lab.complete_time else None,
        question_count=len(lab.lab_question),
        created_at=lab.created_at.isoformat(),
    )


# ========== Lab Routes ==========

@router.post("/create", response_model=LabResponse)
def create_lab(req: LabCreateRequest, teacher_id: str):
    """Create new lab in classroom"""
    # Parse times
    try:
        active_time = _parse_dt(req.active_time)
        complete_time = _parse_dt(req.complete_time)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if active_time and complete_time and complete_time <= active_time:
        raise HTTPException(status_code=422, detail="complete_time must be after active_time")

    lab_id = random.randint(100000, 999999)

    with DatabaseContext() as db:
        if teacher_id not in db.teachers:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher not found")
        if req.classroom_id not in db.classrooms:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found")

        classroom = db.classrooms[req.classroom_id]
        if classroom.teacher_id != teacher_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Teacher can only create labs in their own classrooms")

        while lab_id in db.labs:
            lab_id = random.randint(100000, 999999)

        lab = Lab(lab_id, req.title)
        lab.classroom_id = req.classroom_id
        lab.active_time = active_time
        lab.complete_time = complete_time
        db.labs[lab_id] = lab

        classroom.lab_ids.append(lab_id)
        classroom._p_changed = True

        commit_changes()

    return _lab_response(lab)


@router.get("/classroom/{classroom_id}", response_model=LabListResponse)
def get_classroom_labs(classroom_id: int):
    """Get all labs in a classroom"""
    with DatabaseContext() as db:
        if classroom_id not in db.classrooms:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found")

        classroom = db.classrooms[classroom_id]
        labs = []
        for lab_id in classroom.lab_ids:
            if lab_id in db.labs:
                labs.append(_lab_response(db.labs[lab_id]))

        return LabListResponse(labs=labs)


@router.get("/{lab_id}", response_model=LabResponse)
def get_lab(lab_id: int):
    """Get lab details"""
    with DatabaseContext() as db:
        if lab_id not in db.labs:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lab not found")
        return _lab_response(db.labs[lab_id])


# ========== LabQuestion Routes ==========

@router.post("/{lab_id}/questions", response_model=LabQuestionResponse)
def add_question_to_lab(lab_id: int, req: LabQuestionCreateRequest, teacher_id: str = ""):
    """Add a question to a lab — only allowed when lab is inactive"""
    with DatabaseContext() as db:
        if lab_id not in db.labs:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lab not found")

        lab = db.labs[lab_id]

        if teacher_id:
            if lab.classroom_id not in db.classrooms:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found")
            classroom = db.classrooms[lab.classroom_id]
            if classroom.teacher_id != teacher_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                    detail="Only classroom teacher can add questions")

        if lab_id != 9999 and lab.get_current_status() != "inactive":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Lab can only be edited while it is inactive")

        question_id = random.randint(100000, 999999)
        question = LabQuestion(question_id, req.title, req.problem)
        lab.add_question(question)
        lab._p_changed = True

        commit_changes()

        return LabQuestionResponse(
            question_id=question.question_id,
            title=question.title,
            problem=question.problem,
            question_size=question.question_size,
            test_cases=[],
        )


@router.get("/{lab_id}/questions", response_model=List[LabQuestionResponse])
def get_lab_questions(lab_id: int):
    """Get all questions in a lab"""
    with DatabaseContext() as db:
        if lab_id not in db.labs:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lab not found")

        lab = db.labs[lab_id]
        questions = []
        for question in lab.lab_question:
            test_cases = [
                TestCaseResponse(
                    testcase_id=tc.testcase_id,
                    input=tc.input,
                    expected_output=tc.expected_output,
                )
                for tc in question.test_case
            ]
            questions.append(LabQuestionResponse(
                question_id=question.question_id,
                title=question.title,
                problem=question.problem,
                question_size=question.question_size,
                test_cases=test_cases,
            ))

        return questions


@router.get("/{lab_id}/questions/{question_id}", response_model=LabQuestionResponse)
def get_question(lab_id: int, question_id: int):
    """Get a specific question"""
    with DatabaseContext() as db:
        if lab_id not in db.labs:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lab not found")

        lab = db.labs[lab_id]
        question = lab.get_question(question_id)
        if not question:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

        test_cases = [
            TestCaseResponse(
                testcase_id=tc.testcase_id,
                input=tc.input,
                expected_output=tc.expected_output,
            )
            for tc in question.test_case
        ]
        return LabQuestionResponse(
            question_id=question.question_id,
            title=question.title,
            problem=question.problem,
            question_size=question.question_size,
            test_cases=test_cases,
        )


# ========== TestCase Routes ==========

@router.post("/{lab_id}/questions/{question_id}/testcases", response_model=TestCaseResponse)
def add_testcase_to_question(lab_id: int, question_id: int, req: TestCaseCreateRequest,
                              teacher_id: str = ""):
    """Add a test case to a question — only allowed when lab is inactive"""
    with DatabaseContext() as db:
        if lab_id not in db.labs:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lab not found")

        lab = db.labs[lab_id]
        question = lab.get_question(question_id)
        if not question:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

        if teacher_id:
            if lab.classroom_id not in db.classrooms:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found")
            classroom = db.classrooms[lab.classroom_id]
            if classroom.teacher_id != teacher_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                    detail="Only classroom teacher can add test cases")

        if lab_id != 9999 and lab.get_current_status() != "inactive":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Lab can only be edited while it is inactive")

        testcase_id = random.randint(100000, 999999)
        testcase = TestCase(testcase_id)
        testcase.create_testcase(req.input, req.expected_output)
        question.add_testcase(testcase)
        question._p_changed = True
        lab._p_changed = True

        commit_changes()

        return TestCaseResponse(
            testcase_id=testcase.testcase_id,
            input=testcase.input,
            expected_output=testcase.expected_output,
        )


# ========== Result/Submission Routes ==========

@router.post("/submit", response_model=ResultResponse)
def submit_lab_question(req: ResultCreateRequest):
    """Submit code for a lab question — only allowed while lab is active"""
    with DatabaseContext() as db:
        if req.student_id not in db.students:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

        # Find the lab that owns this question and verify it is active
        owning_lab = None
        for lab in db.labs.values():
            if lab.get_question(req.question_id):
                owning_lab = lab
                break

        if owning_lab and owning_lab.lab_id != 9999:
            lab_status = owning_lab.get_current_status()
            if lab_status != "active":
                detail = ("Lab has not started yet." if lab_status == "inactive"
                          else "Lab has already ended.")
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)

        result_id = random.randint(100000, 999999)
        while result_id in db.results:
            result_id = random.randint(100000, 999999)

        result = Result(result_id, req.student_id, req.question_id)
        result.save_result(result_id, 0, "pending", req.code_file)
        db.results[result_id] = result

        commit_changes()

        return ResultResponse(
            result_id=result.result_id,
            student_id=result.student_id,
            question_id=result.question_id,
            score=result.score,
            status=result.status,
            submission_time=result.submission_time.isoformat(),
            code_file=result.code_file or "",
        )


@router.get("/results/student/{student_id}", response_model=List[ResultResponse])
def get_student_results(student_id: str):
    """Get all results for a student"""
    with DatabaseContext() as db:
        if student_id not in db.students:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

        results = []
        for result in db.results.values():
            if result.student_id == student_id:
                results.append(ResultResponse(
                    result_id=result.result_id,
                    student_id=result.student_id,
                    question_id=result.question_id,
                    score=result.score,
                    status=result.status,
                    submission_time=result.submission_time.isoformat(),
                    code_file=result.code_file or "",
                ))

        return results


@router.get("/results/question/{question_id}", response_model=List[ResultResponse])
def get_question_results(question_id: int):
    """Get all results for a specific question"""
    with DatabaseContext() as db:
        results = []
        for result in db.results.values():
            if result.question_id == question_id:
                results.append(ResultResponse(
                    result_id=result.result_id,
                    student_id=result.student_id,
                    question_id=result.question_id,
                    score=result.score,
                    status=result.status,
                    submission_time=result.submission_time.isoformat(),
                    code_file=result.code_file or "",
                ))

        return results


@router.put("/results/{result_id}", response_model=ResultResponse)
def update_result(result_id: int, score: int, result_status: str):
    """Update result score and status (for grading)"""
    with DatabaseContext() as db:
        if result_id not in db.results:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Result not found")

        result = db.results[result_id]
        result.score = score
        result.status = result_status
        result.updated_at = datetime.now()
        result._p_changed = True

        commit_changes()

        return ResultResponse(
            result_id=result.result_id,
            student_id=result.student_id,
            question_id=result.question_id,
            score=result.score,
            status=result.status,
            submission_time=result.submission_time.isoformat(),
            code_file=result.code_file or "",
        )
