from typing import Any

from pydantic import BaseModel, Field


class TeacherPrepareRequest(BaseModel):
    teacher_id: str | None = None
    class_id: int | None = None
    lab_id: int | None = None
    question_number: int | None = None
    problem_text: str = Field(..., min_length=1)
    use_llm: bool = True
    student_seed_code: str | None = None
    manual_test_cases: list[str] | None = None
    add_test_cases: list[str] = Field(default_factory=list)
    remove_test_cases: list[str] = Field(default_factory=list)


class TeacherPrepareResponse(BaseModel):
    record_id: str
    question_id: str
    teacher_id: str | None = None
    class_id: int | None = None
    lab_id: int | None = None
    question_number: int | None = None
    knowledge_base_prolog: str | None
    generated_test_cases: list[str]
    final_test_cases: list[str]


class StudentAnalyzeRequest(BaseModel):
    teacher_prepare_id: str | None = None
    student_id: str | None = None
    class_id: int | None = None
    lab_id: int | None = None
    question_number: int | None = None
    problem_text: str = Field(..., min_length=1)
    student_code: str = Field(..., min_length=1)
    test_cases: list[str] | None = None
    selected_test_cases: list[str] | None = None
    use_llm: bool = True
    include_logs: bool = False
    auto_fix: bool = False
    max_fix_attempts: int = Field(default=2, ge=1, le=10)


class StudentAnalyzeResponse(BaseModel):
    record_id: str | None = None
    status: str
    analysis: dict[str, Any]
    feedback: str | None
    used_test_cases: list[str]
    execution_traces: list[dict[str, str]]
    logs: list[str] | None


class AutoCorrectRequest(BaseModel):
    teacher_prepare_id: str | None = None
    student_id: str | None = None
    class_id: int | None = None
    lab_id: int | None = None
    question_number: int | None = None
    problem_text: str = Field(..., min_length=1)
    student_code: str = Field(..., min_length=1)
    test_cases: list[str] | None = None
    max_attempts: int = Field(default=2, ge=1, le=10)
    user_message: str | None = None


class AutoCorrectAttempt(BaseModel):
    attempt: int
    status: str
    error: str | None
    corrected_code: str


class AutoCorrectResponse(BaseModel):
    record_id: str | None = None
    status: str
    corrected_code: str | None
    attempts: list[AutoCorrectAttempt]
    final_analysis: dict[str, Any] | None


class RecordResponse(BaseModel):
    id: str
    bucket: str
    created_at: str
    payload: dict[str, Any]


class StudentRegisterRequest(BaseModel):
    student_id: str | None = None
    studentID: str | None = None
    name: str = Field(..., min_length=1)
    password: str = Field(..., min_length=6)


class InstructorRegisterRequest(BaseModel):
    instructor_id: str | None = None
    teacherID: str | None = None
    name: str = Field(..., min_length=1)
    password: str = Field(..., min_length=6)


class RegisterResponse(BaseModel):
    user_id: str
    role: str
    name: str


class LoginRequest(BaseModel):
    user_id: str | None = None
    teacherID: str | None = None
    studentID: str | None = None
    password: str | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    role: str
    name: str


class MeResponse(BaseModel):
    user_id: str
    role: str
    name: str


class CreateClassroomRequest(BaseModel):
    class_name: str = Field(..., min_length=1)
    prerequisites: str | None = None
    class_size: int = Field(default=0, ge=0)
    class_id: int | None = None


class ClassroomResponse(BaseModel):
    class_id: int
    class_name: str
    prerequisites: str | None
    class_size: int
    instructor_id: str
    student_ids: list[str]


class AddStudentRequest(BaseModel):
    student_id: str = Field(..., min_length=1)


class AddStudentResponse(BaseModel):
    status: str
    message: str
    classroom: ClassroomResponse


class CreateLabRequest(BaseModel):
    class_id: int
    lab_id: int
    title: str = Field(..., min_length=1)
    description: str | None = None


class LabResponse(BaseModel):
    class_id: int
    lab_id: int
    title: str
    description: str | None
    instructor_id: str


class CreateLabQuestionRequest(BaseModel):
    class_id: int
    lab_id: int
    question_number: int
    question_id: str | None = None
    problem_text: str = Field(..., min_length=1)
    test_cases: list[str] = Field(default_factory=list)
    teacher_prepare_id: str | None = None


class LabQuestionResponse(BaseModel):
    question_id: str
    class_id: int
    lab_id: int
    question_number: int
    instructor_id: str
    problem_text: str
    test_cases: list[str]
    teacher_prepare_id: str | None


class OpenLabResponse(BaseModel):
    lab: LabResponse
    questions: list[LabQuestionResponse]


class SubmitCodeRequest(BaseModel):
    student_code: str = Field(..., min_length=1)
    selected_test_cases: list[str] | None = None
    use_llm: bool = True
    include_logs: bool = False


class SubmitCodeResponse(BaseModel):
    submission_id: str
    status: str
    message: str
    analysis: dict[str, Any]
    feedback: str | None
    used_test_cases: list[str]
    execution_traces: list[dict[str, str]]
    logs: list[str] | None


class DisplayResultResponse(BaseModel):
    submission_id: str
    status: str
    analysis: dict[str, Any]
    feedback: str | None
    explanation: str | None
    used_test_cases: list[str]
    execution_traces: list[dict[str, str]]
    created_at: str
