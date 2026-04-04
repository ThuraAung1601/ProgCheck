"""
Classroom Management Routes - Updated to match class diagram
"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List
from src.database import DatabaseContext, Classroom, commit_changes
from datetime import datetime
import random

router = APIRouter(prefix="/api/classrooms", tags=["classrooms"])

class Student(BaseModel):
    student_id: str
    username: str
    email: str


class ClassroomCreateRequest(BaseModel):
    class_name: str
    prerequisites: Optional[str] = ""


class ClassroomResponse(BaseModel):
    class_id: int
    class_name: str
    class_size: int
    prerequisites: str
    teacher_id: str
    student_ids: List[str]
    lab_ids: List[int]
    created_at: str


class ClassroomListResponse(BaseModel):
    classrooms: List[ClassroomResponse]


class ClassRoomStudentListResponse(BaseModel):
    students: List[Student]


@router.post("/create", response_model=ClassroomResponse)
def create_classroom(req: ClassroomCreateRequest, teacher_id: str):
    """Create a new classroom (teacher only)"""
    # Generate random class_id (int)
    class_id = random.randint(100000, 999999)
    
    with DatabaseContext() as db:
        # Verify teacher exists
        if teacher_id not in db.teachers:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Teacher not found"
            )
        
        # Ensure unique class_id
        while class_id in db.classrooms:
            class_id = random.randint(100000, 999999)
        
        # Create classroom - matches class diagram: Classroom(class_id, class_name, teacher_id)
        classroom = Classroom(class_id, req.class_name, teacher_id)
        classroom.prerequisites = req.prerequisites
        db.classrooms[class_id] = classroom
        
        # Add to teacher's courses_teach (changed from owned_classrooms)
        teacher = db.teachers[teacher_id]
        teacher.courses_teach.append(class_id)
        teacher._p_changed = True
        
        commit_changes()
    
    return ClassroomResponse(
        class_id=class_id,
        class_name=req.class_name,
        class_size=0,
        prerequisites=req.prerequisites,
        teacher_id=teacher_id,
        student_ids=[],
        lab_ids=[],
        created_at=datetime.now().isoformat()
    )


@router.get("/teacher/{teacher_id}", response_model=ClassroomListResponse)
def get_teacher_classrooms(teacher_id: str):
    """Get all classrooms owned by teacher"""
    with DatabaseContext() as db:
        if teacher_id not in db.teachers:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Teacher not found"
            )
        
        teacher = db.teachers[teacher_id]
        classrooms = []
        
        # Changed from owned_classrooms to courses_teach
        for class_id in teacher.courses_teach:
            if class_id in db.classrooms:
                c = db.classrooms[class_id]
                classrooms.append(ClassroomResponse(
                    class_id=c.class_id,
                    class_name=c.class_name,
                    class_size=c.class_size,
                    prerequisites=c.prerequisites,
                    teacher_id=c.teacher_id,
                    student_ids=list(c.student_ids),
                    lab_ids=list(c.lab_ids),
                    created_at=c.created_at.isoformat()
                ))
        
        return ClassroomListResponse(classrooms=classrooms)


@router.get("/student/{student_id}", response_model=ClassroomListResponse)
def get_student_classrooms(student_id: str):
    """Get all classrooms student is enrolled in - search through all classrooms"""
    with DatabaseContext() as db:
        if student_id not in db.students:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student not found"
            )
        
        classrooms = []
        
        # Search all classrooms to find where student is enrolled
        for class_id, classroom in db.classrooms.items():
            if student_id in classroom.student_ids:
                classrooms.append(ClassroomResponse(
                    class_id=classroom.class_id,
                    class_name=classroom.class_name,
                    class_size=classroom.class_size,
                    prerequisites=classroom.prerequisites,
                    teacher_id=classroom.teacher_id,
                    student_ids=list(classroom.student_ids),
                    lab_ids=list(classroom.lab_ids),
                    created_at=classroom.created_at.isoformat()
                ))
        
        return ClassroomListResponse(classrooms=classrooms)


@router.get("/{class_id}", response_model=ClassroomResponse)
def get_classroom(class_id: int):
    """Get classroom details"""
    with DatabaseContext() as db:
        if class_id not in db.classrooms:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found"
            )
        
        c = db.classrooms[class_id]
        return ClassroomResponse(
            class_id=c.class_id,
            class_name=c.class_name,
            class_size=c.class_size,
            prerequisites=c.prerequisites,
            teacher_id=c.teacher_id,
            student_ids=list(c.student_ids),
            lab_ids=list(c.lab_ids),
            created_at=c.created_at.isoformat()
        )
    
@router.get("/{class_id}/students", response_model=ClassRoomStudentListResponse)
def get_classroom_students(class_id: int):
    """Get list of students in a classroom"""
    with DatabaseContext() as db:
        if class_id not in db.classrooms:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found"
            )
        
        classroom = db.classrooms[class_id]

        students = []
        for student_id in classroom.student_ids:
            if student_id in db.students:
                s = db.students[student_id]
                students.append(Student(
                    student_id=s.student_id,
                    username=getattr(s.settings, "display_name", None) or s.name,
                    email=s.settings.email
                ))

        return ClassRoomStudentListResponse(
            students=students
        )


@router.post("/{class_id}/enroll-student/{student_id}")
def enroll_student(class_id: int, student_id: str, teacher_id: str = ""):
    """Enroll student in classroom (teacher or direct enrollment)"""
    with DatabaseContext() as db:
        if class_id not in db.classrooms:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found"
            )
        if student_id not in db.students:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student not found"
            )
        
        classroom = db.classrooms[class_id]
        
        # Verify teacher if provided
        if teacher_id and classroom.teacher_id != teacher_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only classroom teacher can enroll students"
            )
        
        # Enroll student
        classroom.add_student(student_id)
        classroom._p_changed = True
        commit_changes()
    
    return {"message": "Student enrolled successfully"}


@router.post("/{class_id}/remove-student/{student_id}")
def remove_student(class_id: int, student_id: str, teacher_id: str = ""):
    """Remove student from classroom"""
    with DatabaseContext() as db:
        if class_id not in db.classrooms:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found"
            )
        
        classroom = db.classrooms[class_id]
        
        # Verify teacher
        if teacher_id and classroom.teacher_id != teacher_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only classroom teacher can remove students"
            )
        
        # Remove student
        if student_id in classroom.student_ids:
            classroom.student_ids.remove(student_id)
            classroom.class_size = len(classroom.student_ids)
            classroom.updated_at = datetime.now()
            classroom._p_changed = True
        
        commit_changes()
    
    return {"message": "Student removed successfully"}


@router.put("/{class_id}", response_model=ClassroomResponse)
def update_classroom(class_id: int, req: ClassroomCreateRequest, teacher_id: str = ""):
    """Update classroom details"""
    with DatabaseContext() as db:
        if class_id not in db.classrooms:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found"
            )
        
        classroom = db.classrooms[class_id]
        
        # Verify teacher
        if teacher_id and classroom.teacher_id != teacher_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only classroom teacher can update"
            )
        
        # Update fields using edit_classroom method
        classroom.edit_classroom(class_name=req.class_name, prerequisites=req.prerequisites)
        classroom._p_changed = True
        
        commit_changes()
        
        return ClassroomResponse(
            class_id=classroom.class_id,
            class_name=classroom.class_name,
            class_size=classroom.class_size,
            prerequisites=classroom.prerequisites,
            teacher_id=classroom.teacher_id,
            student_ids=list(classroom.student_ids),
            lab_ids=list(classroom.lab_ids),
            created_at=classroom.created_at.isoformat()
        )