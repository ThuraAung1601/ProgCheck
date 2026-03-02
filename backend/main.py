from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
import os
import re
import hashlib
import hmac
import secrets
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Header
from dotenv import load_dotenv

from backend.actors import Student, Teacher, build_actor
from backend.schemas import (
    AddStudentRequest,
    AddStudentResponse,
    AutoCorrectAttempt,
    AutoCorrectRequest,
    AutoCorrectResponse,
    ClassroomResponse,
    CreateClassroomRequest,
    CreateLabQuestionRequest,
    CreateLabRequest,
    DisplayResultResponse,
    InstructorRegisterRequest,
    LabQuestionResponse,
    LabResponse,
    LoginRequest,
    LoginResponse,
    MeResponse,
    OpenLabResponse,
    RecordResponse,
    RegisterResponse,
    StudentAnalyzeRequest,
    StudentAnalyzeResponse,
    StudentRegisterRequest,
    SubmitCodeRequest,
    SubmitCodeResponse,
    TeacherPrepareRequest,
    TeacherPrepareResponse,
)

from src.checker import PrologChecker
from src.llm_bridge import extract_knowledge_base, generate_test_cases, generate_correct_code
from src.storage import get_store


PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")


app = FastAPI(title="Prolog Debugger API", version="2.0.0")
store = get_store(db_path=os.getenv("ZODB_PATH", "data/zodb.fs"))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000).hex()


def _verify_password(password: str, salt: str, expected_hash: str) -> bool:
    computed = _hash_password(password, salt)
    return hmac.compare_digest(computed, expected_hash)


def _parse_bearer(auth_header: str | None) -> str:
    if not auth_header:
        raise HTTPException(status_code=401, detail="Authorization header required")
    parts = auth_header.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=401, detail="Invalid Authorization header")
    return parts[1].strip()


def _get_session_user(auth_header: str | None, allowed_roles: set[str] | None = None) -> dict[str, Any]:
    token = _parse_bearer(auth_header)
    session = store.get_item("sessions", token)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user_id = session.get("user_id")
    user = store.get_item("users", str(user_id))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if allowed_roles and user.get("role") not in allowed_roles:
        raise HTTPException(status_code=403, detail="Forbidden for this role")
    return user


def _next_numeric_id(bucket: str, field_name: str) -> int:
    items = store.list_items(bucket, limit=10_000)
    if not items:
        return 1
    existing = [int(item.get(field_name, 0)) for item in items if str(item.get(field_name, "")).isdigit()]
    return (max(existing) if existing else 0) + 1


def _create_user(user_id: str, role: str, name: str, password: str) -> RegisterResponse:
    existing = store.get_item("users", user_id)
    if existing:
        raise HTTPException(status_code=409, detail="user_id already exists")

    salt = secrets.token_hex(16)
    user = {
        "user_id": user_id,
        "role": role,
        "name": name,
        "password_salt": salt,
        "password_hash": _hash_password(password, salt),
        "created_at": _now_iso(),
    }
    store.put_item("users", user_id, user)
    return RegisterResponse(user_id=user_id, role=role, name=name)


def _normalize_login_user(req: LoginRequest) -> tuple[str, str]:
    if req.teacherID and req.studentID:
        raise HTTPException(status_code=400, detail="Provide either teacherID or studentID, not both")

    user_id = (req.user_id or req.teacherID or req.studentID or "").strip()
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required (or teacherID/studentID)")

    password = req.password or ""
    if not password:
        raise HTTPException(status_code=400, detail="password is required")

    return user_id, password


def _extract_tests_from_problem(problem_text: str) -> list[str]:
    tests: list[str] = []
    for line in problem_text.splitlines():
        match = re.search(r"(\w+\(.*?\))\s+should\s+be\s+(true|false)", line, re.IGNORECASE)
        if not match:
            continue
        goal, expectation = match.groups()
        expected = f"[{goal}]" if expectation.lower() == "true" else "[]"
        tests.append(f"test({goal}, {expected}).")
    return tests


def _fallback_test_from_student_code(student_code: str) -> list[str]:
    match = re.search(r"^\s*([a-z][A-Za-z0-9_]*)\((.*?)\)\s*\.", student_code, re.MULTILINE)
    if not match:
        return ["test(true, [true])."]
    predicate, args_text = match.groups()
    arg_count = 0 if not args_text.strip() else len([part for part in args_text.split(",") if part.strip()])
    goal_args = ", ".join(["_" for _ in range(arg_count)])
    goal = f"{predicate}({goal_args})" if arg_count > 0 else predicate
    return [f"test({goal}, [{goal}])."]


def _normalize_test_cases(test_cases: list[str]) -> list[str]:
    normalized: list[str] = []
    for raw in test_cases:
        line = raw.strip()
        if not line:
            continue
        if not line.endswith('.'):
            line = f"{line}."
        if line.startswith("test("):
            normalized.append(line)
            continue
        goal = line[:-1].strip()
        normalized.append(f"test({goal}, [{goal}]).")
    return normalized


def _parse_generated_tests_blob(text: str) -> list[str]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return _normalize_test_cases(lines)


def _apply_test_mutations(
    base_tests: list[str],
    manual_test_cases: list[str] | None,
    add_test_cases: list[str],
    remove_test_cases: list[str],
) -> list[str]:
    if manual_test_cases is not None:
        return _normalize_test_cases(manual_test_cases)

    current = _normalize_test_cases(base_tests)
    to_remove = set(_normalize_test_cases(remove_test_cases))
    current = [test for test in current if test not in to_remove]
    for test in _normalize_test_cases(add_test_cases):
        if test not in current:
            current.append(test)
    return current


def _extract_trace_sections(log: list[str]) -> list[dict[str, str]]:
    traces: list[dict[str, str]] = []
    current_query = ""
    index = 0
    while index < len(log):
        line = (log[index] or "").strip()
        if line.startswith("Query:"):
            current_query = line.replace("Query:", "", 1).strip()
        if line == "Execution Trace:":
            index += 1
            trace_lines: list[str] = []
            while index < len(log):
                next_line = (log[index] or "")
                next_strip = next_line.strip()
                if next_strip in {"Proof Tree:", "---", "Execution Trace:"} or next_strip.startswith("Query:"):
                    break
                if next_line:
                    trace_lines.append(next_line)
                index += 1

            proof_tree = ""
            if index < len(log) and (log[index] or "").strip() == "Proof Tree:":
                index += 1
                proof_lines: list[str] = []
                while index < len(log):
                    next_line = (log[index] or "")
                    next_strip = next_line.strip()
                    if next_strip in {"---", "Execution Trace:"} or next_strip.startswith("Query:"):
                        break
                    if next_line:
                        proof_lines.append(next_line)
                    index += 1
                proof_tree = "\n".join(proof_lines).strip()

            traces.append(
                {
                    "query": current_query,
                    "execution_trace": "\n".join(trace_lines).strip(),
                    "proof_tree": proof_tree,
                }
            )
            continue
        index += 1
    return traces


def _resolve_teacher_bundle(
    teacher_prepare_id: str | None,
    problem_text: str,
    test_cases: list[str] | None,
    selected_test_cases: list[str] | None,
    class_id: int | None,
    lab_id: int | None,
    question_number: int | None,
) -> tuple[str, list[str] | None, list[str] | None]:
    if not teacher_prepare_id:
        return problem_text, test_cases, selected_test_cases

    record = store.get_record("teacher_prepare", teacher_prepare_id)
    if not record:
        raise HTTPException(status_code=404, detail="teacher_prepare_id not found")

    payload = record.get("payload", {})
    saved_request = payload.get("request", {})
    saved_response = payload.get("response", {})

    teacher_problem = str(saved_request.get("problem_text", "")).strip()
    if teacher_problem and problem_text.strip() and teacher_problem != problem_text.strip():
        raise HTTPException(
            status_code=400,
            detail="problem_text does not match teacher_prepare_id",
        )

    teacher_tests = _normalize_test_cases(saved_response.get("final_test_cases", []) or [])

    teacher_class_id = saved_request.get("class_id")
    teacher_lab_id = saved_request.get("lab_id")
    teacher_question_number = saved_request.get("question_number")

    if class_id is not None and teacher_class_id is not None and class_id != teacher_class_id:
        raise HTTPException(status_code=400, detail="class_id does not match teacher_prepare_id")
    if lab_id is not None and teacher_lab_id is not None and lab_id != teacher_lab_id:
        raise HTTPException(status_code=400, detail="lab_id does not match teacher_prepare_id")
    if (
        question_number is not None
        and teacher_question_number is not None
        and question_number != teacher_question_number
    ):
        raise HTTPException(status_code=400, detail="question_number does not match teacher_prepare_id")

    normalized_test_cases = _normalize_test_cases(test_cases or [])
    normalized_selected = _normalize_test_cases(selected_test_cases or [])

    if normalized_test_cases:
        unknown = [test for test in normalized_test_cases if test not in teacher_tests]
        if unknown:
            raise HTTPException(
                status_code=400,
                detail="test_cases contain items not defined in teacher_prepare_id",
            )

    if normalized_selected:
        unknown_selected = [test for test in normalized_selected if test not in teacher_tests]
        if unknown_selected:
            raise HTTPException(
                status_code=400,
                detail="selected_test_cases contain items not defined in teacher_prepare_id",
            )

    tests_to_use = normalized_test_cases if normalized_test_cases else teacher_tests
    selected_to_use = normalized_selected if normalized_selected else None
    return teacher_problem or problem_text, tests_to_use, selected_to_use


def _run_analysis_internal(
    problem_text: str,
    student_code: str,
    test_cases: list[str],
    use_llm: bool,
    auto_fix: bool,
    max_fix_attempts: int,
    include_logs: bool,
) -> StudentAnalyzeResponse:
    with TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        problem_file = temp_path / "problem.txt"
        student_file = temp_path / "student.pl"
        test_case_file = temp_path / "tests.pl"

        problem_file.write_text(problem_text)
        student_file.write_text(student_code)

        normalized_tests = _normalize_test_cases(test_cases)
        if not normalized_tests:
            normalized_tests = _extract_tests_from_problem(problem_text)
        if not normalized_tests:
            normalized_tests = _fallback_test_from_student_code(student_code)

        tests_text = "\n".join(normalized_tests)
        test_case_file.write_text(tests_text)

        checker = PrologChecker(
            problem_file,
            student_file,
            use_llm=use_llm,
            test_cases_file=test_case_file,
            auto_fix=auto_fix,
            max_fix_attempts=max_fix_attempts,
            fix_output_path=None,
        )

        if not use_llm:
            checker.api_key = None

        log: list[str] = []

        if checker.check_syntax(log):
            checker.test_case_goals = checker._parse_tests_to_goals(tests_text)
            analysis = checker.run_analysis(tests_text, log)
            checker.gen_feedback(analysis, log)
            if auto_fix:
                checker._attempt_auto_fix(analysis, tests_text, log)
        else:
            if checker.syntax_error:
                analysis = {
                    "status": "syntax_error",
                    "error": checker.syntax_error.get("type"),
                    "syntax_error": checker.syntax_error,
                }
                checker.gen_feedback(analysis, log)
                if auto_fix:
                    checker._attempt_auto_fix(analysis, None, log)
            else:
                analysis = {
                    "status": "unknown",
                    "error": "syntax_check_failed",
                }

        feedback = checker.last_llm_feedback or checker._build_human_feedback(analysis)
        traces = _extract_trace_sections(log)

        return StudentAnalyzeResponse(
            status=analysis.get("status", "unknown"),
            analysis=_to_jsonable(analysis),
            feedback=feedback,
            used_test_cases=normalized_tests,
            execution_traces=traces,
            logs=log if include_logs else None,
        )


def _to_jsonable(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, list):
        return [_to_jsonable(item) for item in value]
    if isinstance(value, tuple):
        return [_to_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _to_jsonable(item) for key, item in value.items()}
    return str(value)


def _resolve_lab_key(class_id: int, lab_id: int) -> str:
    return f"{class_id}:{lab_id}"


def _as_actor(user: dict[str, Any]) -> Student | Teacher:
    actor = build_actor(user, store)
    if isinstance(actor, (Student, Teacher)):
        return actor
    raise HTTPException(status_code=403, detail="Unsupported role")


def _ensure_lab_access(user: dict[str, Any], class_id: int) -> dict[str, Any]:
    classroom = store.get_item("classrooms", str(class_id))
    if not classroom:
        raise HTTPException(status_code=404, detail="Classroom not found")

    if user["role"] == "instructor":
        if classroom.get("instructor_id") != user["user_id"]:
            raise HTTPException(status_code=403, detail="Forbidden")
    else:
        if user["user_id"] not in classroom.get("student_ids", []):
            raise HTTPException(status_code=403, detail="Student is not enrolled in this classroom")
    return classroom


def _status_message_from_analysis(response: StudentAnalyzeResponse) -> tuple[str, str]:
    status = response.status
    details_blob = " ".join(
        [
            str(response.analysis.get("error", "")),
            str(response.feedback or ""),
            " ".join(response.logs or []),
        ]
    ).lower()

    timeout_tokens = ("timeout", "time out", "infinite recursion", "stack overflow")
    if any(token in details_blob for token in timeout_tokens):
        return "execution_timeout", "Execution timed out. Please check for infinite recursion or non-terminating rules."
    if status == "syntax_error":
        return "syntax_error", "Syntax error detected in submitted code."
    if status == "correct":
        return "correct", "Submission passed all tests."
    if status == "logic_error":
        return "logic_error", "Submission failed one or more test cases."
    return status, "Submission analyzed."


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.on_event("shutdown")
def _shutdown_store() -> None:
    store.close()


@app.post("/auth/register/student", response_model=RegisterResponse)
def register_student(req: StudentRegisterRequest) -> RegisterResponse:
    student_id = (req.student_id or req.studentID or "").strip()
    if not student_id:
        raise HTTPException(status_code=400, detail="student_id is required (or studentID)")
    return _create_user(student_id, "student", req.name.strip(), req.password)


@app.post("/auth/register/instructor", response_model=RegisterResponse)
def register_instructor(req: InstructorRegisterRequest) -> RegisterResponse:
    instructor_id = (req.instructor_id or req.teacherID or "").strip()
    if not instructor_id:
        raise HTTPException(status_code=400, detail="instructor_id is required (or teacherID)")
    return _create_user(instructor_id, "instructor", req.name.strip(), req.password)


@app.post("/auth/login", response_model=LoginResponse)
def login(req: LoginRequest) -> LoginResponse:
    user_id, password = _normalize_login_user(req)

    user = store.get_item("users", user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not _verify_password(password, user["password_salt"], user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = secrets.token_urlsafe(32)
    session = {
        "token": token,
        "user_id": user["user_id"],
        "role": user["role"],
        "created_at": _now_iso(),
    }
    store.put_item("sessions", token, session)
    return LoginResponse(
        access_token=token,
        user_id=user["user_id"],
        role=user["role"],
        name=user["name"],
    )


@app.post("/auth/logout")
def logout(authorization: str | None = Header(default=None)) -> dict[str, str]:
    token = _parse_bearer(authorization)
    deleted = store.delete_item("sessions", token)
    if not deleted:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return {"status": "logged_out"}


@app.get("/auth/me", response_model=MeResponse)
def me(authorization: str | None = Header(default=None)) -> MeResponse:
    user = _get_session_user(authorization)
    return MeResponse(user_id=user["user_id"], role=user["role"], name=user["name"])


@app.post("/classrooms", response_model=ClassroomResponse)
def create_classroom(req: CreateClassroomRequest, authorization: str | None = Header(default=None)) -> ClassroomResponse:
    instructor = _get_session_user(authorization, {"instructor"})
    class_id = req.class_id if req.class_id is not None else _next_numeric_id("classrooms", "class_id")
    key = str(class_id)
    if store.get_item("classrooms", key):
        raise HTTPException(status_code=409, detail="class_id already exists")

    classroom = {
        "class_id": class_id,
        "class_name": req.class_name,
        "prerequisites": req.prerequisites,
        "class_size": req.class_size,
        "instructor_id": instructor["user_id"],
        "student_ids": [],
        "created_at": _now_iso(),
    }
    store.put_item("classrooms", key, classroom)
    return ClassroomResponse(**classroom)


@app.post("/classrooms/{class_id}/students", response_model=AddStudentResponse)
def add_student_to_classroom(class_id: int, req: AddStudentRequest, authorization: str | None = Header(default=None)) -> AddStudentResponse:
    instructor = _get_session_user(authorization, {"instructor"})
    classroom = store.get_item("classrooms", str(class_id))
    if not classroom:
        raise HTTPException(status_code=404, detail="Classroom not found")
    if classroom["instructor_id"] != instructor["user_id"]:
        raise HTTPException(status_code=403, detail="Only classroom instructor can add students")

    student = store.get_item("users", req.student_id)
    if not student or student.get("role") != "student":
        raise HTTPException(status_code=404, detail="Student not found")

    student_ids = list(classroom.get("student_ids", []))
    if req.student_id in student_ids:
        return AddStudentResponse(
            status="already_enrolled",
            message="Student already enrolled",
            classroom=ClassroomResponse(**classroom),
        )

    student_ids.append(req.student_id)
    classroom["student_ids"] = student_ids
    store.put_item("classrooms", str(class_id), classroom)

    membership = {
        "class_id": class_id,
        "student_id": req.student_id,
        "added_by": instructor["user_id"],
        "added_at": _now_iso(),
    }
    store.put_item("classroom_members", f"{class_id}:{req.student_id}", membership)
    return AddStudentResponse(
        status="added",
        message="Student added to classroom",
        classroom=ClassroomResponse(**classroom),
    )


@app.get("/classrooms", response_model=list[ClassroomResponse])
def list_classrooms(authorization: str | None = Header(default=None)) -> list[ClassroomResponse]:
    user = _get_session_user(authorization)
    actor = _as_actor(user)
    classrooms = actor.list_classrooms()
    return [ClassroomResponse(**room) for room in classrooms]


@app.get("/labs", response_model=list[LabResponse])
def list_labs(authorization: str | None = Header(default=None)) -> list[LabResponse]:
    user = _get_session_user(authorization)
    actor = _as_actor(user)
    labs = actor.list_labs()
    labs.sort(key=lambda item: (int(item.get("class_id", 0)), int(item.get("lab_id", 0))))
    return [LabResponse(**lab) for lab in labs]


@app.post("/labs", response_model=LabResponse)
def create_lab(req: CreateLabRequest, authorization: str | None = Header(default=None)) -> LabResponse:
    instructor = _get_session_user(authorization, {"instructor"})
    actor = _as_actor(instructor)
    assert isinstance(actor, Teacher)
    actor.ensure_class_owner(req.class_id)

    lab_key = _resolve_lab_key(req.class_id, req.lab_id)
    if store.get_item("labs", lab_key):
        raise HTTPException(status_code=409, detail="Lab already exists")

    lab = {
        "class_id": req.class_id,
        "lab_id": req.lab_id,
        "title": req.title.strip(),
        "description": req.description,
        "instructor_id": instructor["user_id"],
        "created_at": _now_iso(),
    }
    store.put_item("labs", lab_key, lab)
    return LabResponse(**lab)


@app.get("/labs/{class_id}/{lab_id}/open", response_model=OpenLabResponse)
def open_lab(class_id: int, lab_id: int, authorization: str | None = Header(default=None)) -> OpenLabResponse:
    user = _get_session_user(authorization)
    actor = _as_actor(user)
    if isinstance(actor, Teacher):
        actor.ensure_class_owner(class_id)
    else:
        actor.ensure_class_enrolled(class_id)

    lab = store.get_item("labs", _resolve_lab_key(class_id, lab_id))
    if not lab:
        raise HTTPException(status_code=404, detail="Lab not found")

    questions_raw = store.list_items("lab_questions", limit=10_000)
    questions = [
        LabQuestionResponse(**question)
        for question in questions_raw
        if int(question.get("class_id", -1)) == class_id and int(question.get("lab_id", -1)) == lab_id
    ]
    questions.sort(key=lambda question: question.question_number)
    return OpenLabResponse(lab=LabResponse(**lab), questions=questions)


@app.post("/labs/questions", response_model=LabQuestionResponse)
def create_lab_question(req: CreateLabQuestionRequest, authorization: str | None = Header(default=None)) -> LabQuestionResponse:
    instructor = _get_session_user(authorization, {"instructor"})
    classroom = store.get_item("classrooms", str(req.class_id))
    if not classroom:
        raise HTTPException(status_code=404, detail="Classroom not found")
    if classroom["instructor_id"] != instructor["user_id"]:
        raise HTTPException(status_code=403, detail="Only classroom instructor can create lab questions")

    if not store.get_item("labs", _resolve_lab_key(req.class_id, req.lab_id)):
        raise HTTPException(status_code=404, detail="Lab not found")

    question_id = req.question_id or f"q-{req.class_id}-{req.lab_id}-{req.question_number}"
    if store.get_item("lab_questions", question_id):
        raise HTTPException(status_code=409, detail="question_id already exists")

    question = {
        "question_id": question_id,
        "class_id": req.class_id,
        "lab_id": req.lab_id,
        "question_number": req.question_number,
        "instructor_id": instructor["user_id"],
        "problem_text": req.problem_text,
        "test_cases": _normalize_test_cases(req.test_cases),
        "teacher_prepare_id": req.teacher_prepare_id,
        "created_at": _now_iso(),
    }
    store.put_item("lab_questions", question_id, question)
    return LabQuestionResponse(**question)


@app.get("/labs/questions/{question_id}", response_model=LabQuestionResponse)
def get_lab_question(question_id: str, authorization: str | None = Header(default=None)) -> LabQuestionResponse:
    user = _get_session_user(authorization)
    question = store.get_item("lab_questions", question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    classroom = store.get_item("classrooms", str(question["class_id"]))
    if not classroom:
        raise HTTPException(status_code=404, detail="Classroom not found")

    if user["role"] == "instructor":
        if classroom["instructor_id"] != user["user_id"]:
            raise HTTPException(status_code=403, detail="Forbidden")
    else:
        if user["user_id"] not in classroom.get("student_ids", []):
            raise HTTPException(status_code=403, detail="Forbidden")

    return LabQuestionResponse(**question)


@app.post("/labs/questions/{question_id}/submit", response_model=SubmitCodeResponse)
def submit_code_for_question(
    question_id: str,
    req: SubmitCodeRequest,
    authorization: str | None = Header(default=None),
) -> SubmitCodeResponse:
    student = _get_session_user(authorization, {"student"})
    question = store.get_item("lab_questions", question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    class_id = int(question["class_id"])
    lab_id = int(question["lab_id"])
    classroom = _ensure_lab_access(student, class_id)
    if student["user_id"] not in classroom.get("student_ids", []):
        raise HTTPException(status_code=403, detail="Student is not enrolled in this classroom")

    base_tests = _normalize_test_cases(question.get("test_cases", []))
    selected_tests = _normalize_test_cases(req.selected_test_cases or [])
    if selected_tests:
        unknown = [test for test in selected_tests if test not in base_tests]
        if unknown:
            raise HTTPException(status_code=400, detail="selected_test_cases contain unknown tests")
        tests_to_run = selected_tests
    else:
        tests_to_run = base_tests

    analysis_response = _run_analysis_internal(
        problem_text=question["problem_text"],
        student_code=req.student_code,
        test_cases=tests_to_run,
        use_llm=req.use_llm,
        auto_fix=False,
        max_fix_attempts=1,
        include_logs=req.include_logs,
    )

    status, message = _status_message_from_analysis(analysis_response)
    submission_id = f"submission-{_next_numeric_id('submissions', 'seq')}"
    student_record_id = store.save_record(
        "student_analyze",
        {
            "request": {
                "question_id": question_id,
                "student_id": student["user_id"],
                "class_id": class_id,
                "lab_id": lab_id,
                "student_code": req.student_code,
                "selected_test_cases": req.selected_test_cases,
                "use_llm": req.use_llm,
                "include_logs": req.include_logs,
            },
            "response": _to_jsonable(analysis_response.model_dump()),
            "source": "submit_code",
        },
    )
    submission_payload = {
        "submission_id": submission_id,
        "seq": _next_numeric_id("submissions", "seq"),
        "question_id": question_id,
        "class_id": class_id,
        "lab_id": lab_id,
        "student_id": student["user_id"],
        "student_code": req.student_code,
        "problem_text": question["problem_text"],
        "status": status,
        "message": message,
        "analysis": _to_jsonable(analysis_response.analysis),
        "feedback": analysis_response.feedback,
        "used_test_cases": analysis_response.used_test_cases,
        "execution_traces": analysis_response.execution_traces,
        "logs": analysis_response.logs,
        "student_analyze_record_id": student_record_id,
        "created_at": _now_iso(),
    }
    store.put_item("submissions", submission_id, submission_payload)

    return SubmitCodeResponse(
        submission_id=submission_id,
        status=status,
        message=message,
        analysis=submission_payload["analysis"],
        feedback=submission_payload["feedback"],
        used_test_cases=submission_payload["used_test_cases"],
        execution_traces=submission_payload["execution_traces"],
        logs=submission_payload["logs"],
    )


@app.get("/submissions/{submission_id}", response_model=DisplayResultResponse)
def display_submission_result(
    submission_id: str,
    enhance_feedback: bool = False,
    authorization: str | None = Header(default=None),
) -> DisplayResultResponse:
    user = _get_session_user(authorization)
    submission = store.get_item("submissions", submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Result not found")

    classroom = _ensure_lab_access(user, int(submission["class_id"]))
    if user["role"] == "student" and submission.get("student_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Students can only view their own submissions")
    if user["role"] == "instructor" and classroom.get("instructor_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    explanation = submission.get("feedback")
    if enhance_feedback:
        api_key = os.getenv("GROQ_API_KEY")
        if api_key:
            try:
                from src.llm_bridge import translate_to_natural_language

                explanation = translate_to_natural_language(
                    submission.get("analysis", {}),
                    submission.get("problem_text", ""),
                    submission.get("student_code", ""),
                    api_key,
                )
            except Exception:
                explanation = submission.get("feedback")

    return DisplayResultResponse(
        submission_id=submission_id,
        status=str(submission.get("status", "unknown")),
        analysis=_to_jsonable(submission.get("analysis", {})),
        feedback=submission.get("feedback"),
        explanation=explanation,
        used_test_cases=_to_jsonable(submission.get("used_test_cases", [])),
        execution_traces=_to_jsonable(submission.get("execution_traces", [])),
        created_at=str(submission.get("created_at", "")),
    )


@app.post("/teacher/prepare", response_model=TeacherPrepareResponse)
def teacher_prepare(req: TeacherPrepareRequest) -> TeacherPrepareResponse:
    api_key = os.getenv("GROQ_API_KEY")

    knowledge_base = None
    generated_tests: list[str] = []

    if req.use_llm and api_key:
        try:
            knowledge_base = extract_knowledge_base(req.problem_text, api_key)
            seed_code = req.student_seed_code or knowledge_base or "fact(dummy)."
            generated_blob = generate_test_cases(req.problem_text, seed_code, api_key)
            generated_tests = _parse_generated_tests_blob(generated_blob)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"LLM preparation failed: {exc}") from exc
    else:
        generated_tests = _extract_tests_from_problem(req.problem_text)

    if not generated_tests:
        generated_tests = ["test(true, [true])."]

    final_tests = _apply_test_mutations(
        generated_tests,
        req.manual_test_cases,
        req.add_test_cases,
        req.remove_test_cases,
    )

    response = TeacherPrepareResponse(
        record_id="",
        question_id="",
        teacher_id=req.teacher_id,
        class_id=req.class_id,
        lab_id=req.lab_id,
        question_number=req.question_number,
        knowledge_base_prolog=knowledge_base,
        generated_test_cases=generated_tests,
        final_test_cases=final_tests,
    )
    response.record_id = store.save_record(
        "teacher_prepare",
        {
            "request": _to_jsonable(req.model_dump()),
            "response": _to_jsonable(response.model_dump()),
        },
    )
    response.question_id = response.record_id
    return response


@app.post("/student/analyze", response_model=StudentAnalyzeResponse)
def student_analyze(req: StudentAnalyzeRequest) -> StudentAnalyzeResponse:
    resolved_problem, resolved_tests, resolved_selected = _resolve_teacher_bundle(
        req.teacher_prepare_id,
        req.problem_text,
        req.test_cases,
        req.selected_test_cases,
        req.class_id,
        req.lab_id,
        req.question_number,
    )
    selected_tests = resolved_selected if resolved_selected else resolved_tests
    response = _run_analysis_internal(
        problem_text=resolved_problem,
        student_code=req.student_code,
        test_cases=selected_tests or [],
        use_llm=req.use_llm,
        auto_fix=req.auto_fix,
        max_fix_attempts=req.max_fix_attempts,
        include_logs=req.include_logs,
    )
    response.record_id = store.save_record(
        "student_analyze",
        {
            "request": _to_jsonable(req.model_dump()),
            "response": _to_jsonable(response.model_dump()),
        },
    )
    return response


@app.post("/student/run-selected-tests", response_model=StudentAnalyzeResponse)
def run_selected_tests(req: StudentAnalyzeRequest) -> StudentAnalyzeResponse:
    if not req.selected_test_cases:
        raise HTTPException(status_code=400, detail="selected_test_cases is required")
    resolved_problem, _, resolved_selected = _resolve_teacher_bundle(
        req.teacher_prepare_id,
        req.problem_text,
        req.test_cases,
        req.selected_test_cases,
        req.class_id,
        req.lab_id,
        req.question_number,
    )
    if not resolved_selected:
        raise HTTPException(status_code=400, detail="selected_test_cases is required")
    response = _run_analysis_internal(
        problem_text=resolved_problem,
        student_code=req.student_code,
        test_cases=resolved_selected,
        use_llm=req.use_llm,
        auto_fix=False,
        max_fix_attempts=req.max_fix_attempts,
        include_logs=req.include_logs,
    )
    response.record_id = store.save_record(
        "student_analyze",
        {
            "request": _to_jsonable(req.model_dump()),
            "response": _to_jsonable(response.model_dump()),
            "mode": "selected_tests",
        },
    )
    return response


@app.post("/student/autocorrect", response_model=AutoCorrectResponse)
def student_autocorrect(req: AutoCorrectRequest) -> AutoCorrectResponse:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="GROQ_API_KEY is required for auto-correction")

    try:
        with TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            problem_file = temp_path / "problem.txt"
            student_file = temp_path / "student.pl"
            test_case_file = temp_path / "tests.pl"

            resolved_problem, resolved_tests, _ = _resolve_teacher_bundle(
                req.teacher_prepare_id,
                req.problem_text,
                req.test_cases,
                None,
                req.class_id,
                req.lab_id,
                req.question_number,
            )

            problem_file.write_text(resolved_problem)
            student_file.write_text(req.student_code)

            normalized_tests = _normalize_test_cases(resolved_tests or [])
            if not normalized_tests:
                normalized_tests = _extract_tests_from_problem(resolved_problem)
            if not normalized_tests:
                normalized_tests = _fallback_test_from_student_code(req.student_code)
            tests_text = "\n".join(normalized_tests)
            test_case_file.write_text(tests_text)

            checker = PrologChecker(
                problem_file,
                student_file,
                use_llm=True,
                test_cases_file=test_case_file,
                auto_fix=False,
                max_fix_attempts=req.max_attempts,
                fix_output_path=None,
            )

            log: list[str] = []
            if checker.check_syntax(log):
                checker.test_case_goals = checker._parse_tests_to_goals(tests_text)
                analysis = checker.run_analysis(tests_text, log)
                checker.gen_feedback(analysis, log)
            else:
                analysis = {
                    "status": "syntax_error",
                    "error": (checker.syntax_error or {}).get("type", "syntax_error"),
                    "syntax_error": checker.syntax_error,
                }
                checker.gen_feedback(analysis, log)

            if analysis.get("status") == "correct":
                response = AutoCorrectResponse(
                    record_id=None,
                    status="already_correct",
                    corrected_code=req.student_code,
                    attempts=[],
                    final_analysis=_to_jsonable(analysis),
                )
                response.record_id = store.save_record(
                    "autocorrect",
                    {
                        "request": _to_jsonable(req.model_dump()),
                        "response": _to_jsonable(response.model_dump()),
                    },
                )
                return response

            attempts: list[AutoCorrectAttempt] = []
            current_code = req.student_code
            current_analysis = analysis
            base_feedback = checker.last_llm_feedback or checker._build_human_feedback(current_analysis)
            if req.user_message:
                base_feedback = f"{base_feedback}\n\nStudent request: {req.user_message}"

            for attempt_index in range(1, req.max_attempts + 1):
                corrected = generate_correct_code(
                    resolved_problem,
                    current_code,
                    base_feedback,
                    str(current_analysis.get("error")),
                    api_key,
                )
                corrected_code = checker._extract_code_block(corrected) or current_code
                current_analysis = checker._evaluate_candidate(corrected_code, tests_text, log)

                attempts.append(
                    AutoCorrectAttempt(
                        attempt=attempt_index,
                        status=current_analysis.get("status", "unknown"),
                        error=str(current_analysis.get("error")) if current_analysis.get("error") else None,
                        corrected_code=corrected_code,
                    )
                )

                if current_analysis.get("status") == "correct":
                    response = AutoCorrectResponse(
                        record_id=None,
                        status="corrected",
                        corrected_code=corrected_code,
                        attempts=attempts,
                        final_analysis=_to_jsonable(current_analysis),
                    )
                    response.record_id = store.save_record(
                        "autocorrect",
                        {
                            "request": _to_jsonable(req.model_dump()),
                            "response": _to_jsonable(response.model_dump()),
                        },
                    )
                    return response

                current_code = corrected_code
                base_feedback = checker._build_human_feedback(current_analysis)
                if req.user_message:
                    base_feedback = f"{base_feedback}\n\nStudent request: {req.user_message}"

            response = AutoCorrectResponse(
                record_id=None,
                status="not_corrected",
                corrected_code=current_code,
                attempts=attempts,
                final_analysis=_to_jsonable(current_analysis),
            )
            response.record_id = store.save_record(
                "autocorrect",
                {
                    "request": _to_jsonable(req.model_dump()),
                    "response": _to_jsonable(response.model_dump()),
                },
            )
            return response
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/analyze", response_model=StudentAnalyzeResponse)
def analyze_compat(req: StudentAnalyzeRequest) -> StudentAnalyzeResponse:
    return student_analyze(req)


@app.get("/records/{bucket}", response_model=list[RecordResponse])
def list_records(bucket: str, limit: int = 50) -> list[RecordResponse]:
    if bucket not in {"teacher_prepare", "student_analyze", "autocorrect"}:
        raise HTTPException(status_code=400, detail="Invalid bucket")
    return [RecordResponse(**_to_jsonable(item)) for item in store.list_records(bucket, limit=limit)]


@app.get("/records/{bucket}/{record_id}", response_model=RecordResponse)
def get_record(bucket: str, record_id: str) -> RecordResponse:
    if bucket not in {"teacher_prepare", "student_analyze", "autocorrect"}:
        raise HTTPException(status_code=400, detail="Invalid bucket")
    record = store.get_record(bucket, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return RecordResponse(**_to_jsonable(record))
