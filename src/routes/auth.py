"""
Authentication and User Management Routes
"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from src.database import DatabaseContext, Student, Teacher, commit_changes
import uuid

router = APIRouter(prefix="/api/auth", tags=["authentication"])


# Pydantic models for request/response
class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    role: str  # "student" or "teacher"
    student_id: Optional[str] = None  # Required for students
    teacher_id: Optional[str] = None  # Required for teachers


class UserResponse(BaseModel):
    id: str
    username: str
    role: str
    email: Optional[str] = None
    display_name: Optional[str] = None


class AuthResponse(BaseModel):
    user: UserResponse
    token: str


@router.post("/register", response_model=AuthResponse)
def register(req: RegisterRequest):
    """Register a new student or teacher account"""
    if req.role == "student":
        if not req.student_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="student_id required for student registration"
            )
        user_id = req.student_id
    elif req.role == "teacher":
        if not req.teacher_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="teacher_id required for teacher registration"
            )
        user_id = req.teacher_id
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="role must be 'student' or 'teacher'"
        )

    with DatabaseContext() as db:
        if req.role == "student":
            if user_id in db.students:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Student already registered"
                )
            user_obj = Student(user_id, req.username, req.password)
            db.students[user_id] = user_obj
        else:
            if user_id in db.teachers:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Teacher already registered"
                )
            user_obj = Teacher(user_id, req.username, req.password)
            db.teachers[user_id] = user_obj

        # Extract values while connection is still open
        email = user_obj.settings.email or None
        display_name = user_obj.settings.display_name or req.username
        commit_changes()

    token = str(uuid.uuid4())
    return AuthResponse(
        user=UserResponse(
            id=user_id,
            username=req.username,
            role=req.role,
            email=email,
            display_name=display_name,
        ),
        token=token,
    )


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, role: str = "student"):
    """Login as student or teacher"""

    with DatabaseContext() as db:
        if role == "student":
            users = db.students
            user_type = "student"
        elif role == "teacher":
            users = db.teachers
            user_type = "teacher"
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="role must be 'student' or 'teacher'"
            )

        # Find user by name
        user = None
        user_id = None
        for uid, u in users.items():
            if u.name == req.username:
                user = u
                user_id = uid
                break

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password"
            )

        if not user.verify_password(req.password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password"
            )

        # Extract all values while connection is still open
        username = user.name
        email = user.settings.email or None
        display_name = user.settings.display_name or user.name

    token = str(uuid.uuid4())
    return AuthResponse(
        user=UserResponse(
            id=user_id,
            username=username,
            role=user_type,
            email=email,
            display_name=display_name,
        ),
        token=token,
    )


@router.post("/login/student")
def login_student(req: LoginRequest):
    """Login as student"""
    return login(req, role="student")


@router.post("/login/teacher")
def login_teacher(req: LoginRequest):
    """Login as teacher"""
    return login(req, role="teacher")