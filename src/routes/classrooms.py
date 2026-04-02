"""
Classroom Management Routes
"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List
from src.database import DatabaseContext, Classroom, commit_changes
from datetime import datetime
import uuid

router = APIRouter(prefix="/api/classrooms", tags=["classrooms"])


class ClassroomCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""


class ClassroomResponse(BaseModel):
    classroom_id: str
    name: str
    description: str
    teacher_id: str
    students: List[str]
    labs: List[str]
    created_at: str


class ClassroomListResponse(BaseModel):
    classrooms: List[ClassroomResponse]


@router.post("/create", response_model=ClassroomResponse)
def create_classroom(req: ClassroomCreateRequest, teacher_id: str):
    """Create a new classroom (teacher only)"""
    classroom_id = f"class_{uuid.uuid4().hex[:8]}"
    
    with DatabaseContext() as db:
        # Verify teacher exists
        if teacher_id not in db.teachers:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Teacher not found"
            )
        
        # Create classroom
        classroom = Classroom(classroom_id, req.name, teacher_id, req.description)
        db.classrooms[classroom_id] = classroom
        
        # Add to teacher's classrooms
        teacher = db.teachers[teacher_id]
        teacher.owned_classrooms.append(classroom_id)
        teacher._p_changed = True
        
        commit_changes()
    
    return ClassroomResponse(
        classroom_id=classroom_id,
        name=req.name,
        description=req.description,
        teacher_id=teacher_id,
        students=[],
        labs=[],
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
        
        for classroom_id in teacher.owned_classrooms:
            if classroom_id in db.classrooms:
                c = db.classrooms[classroom_id]
                classrooms.append(ClassroomResponse(
                    classroom_id=c.classroom_id,
                    name=c.name,
                    description=c.description,
                    teacher_id=c.teacher_id,
                    students=list(c.students),
                    labs=list(c.labs),
                    created_at=c.created_at.isoformat()
                ))
        
        return ClassroomListResponse(classrooms=classrooms)


@router.get("/student/{student_id}", response_model=ClassroomListResponse)
def get_student_classrooms(student_id: str):
    """Get all classrooms student is enrolled in"""
    with DatabaseContext() as db:
        if student_id not in db.students:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student not found"
            )
        
        student = db.students[student_id]
        classrooms = []
        
        for classroom_id in student.enrolled_classrooms:
            if classroom_id in db.classrooms:
                c = db.classrooms[classroom_id]
                classrooms.append(ClassroomResponse(
                    classroom_id=c.classroom_id,
                    name=c.name,
                    description=c.description,
                    teacher_id=c.teacher_id,
                    students=list(c.students),
                    labs=list(c.labs),
                    created_at=c.created_at.isoformat()
                ))
        
        return ClassroomListResponse(classrooms=classrooms)


@router.get("/{classroom_id}", response_model=ClassroomResponse)
def get_classroom(classroom_id: str):
    """Get classroom details"""
    with DatabaseContext() as db:
        if classroom_id not in db.classrooms:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found"
            )
        
        c = db.classrooms[classroom_id]
        return ClassroomResponse(
            classroom_id=c.classroom_id,
            name=c.name,
            description=c.description,
            teacher_id=c.teacher_id,
            students=list(c.students),
            labs=list(c.labs),
            created_at=c.created_at.isoformat()
        )


@router.post("/{classroom_id}/enroll-student/{student_id}")
def enroll_student(classroom_id: str, student_id: str, teacher_id: str = ""):
    """Enroll student in classroom (teacher or direct enrollment)"""
    with DatabaseContext() as db:
        if classroom_id not in db.classrooms:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found"
            )
        if student_id not in db.students:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student not found"
            )
        
        classroom = db.classrooms[classroom_id]
        
        # Verify teacher if provided
        if teacher_id and classroom.teacher_id != teacher_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only classroom teacher can enroll students"
            )
        
        # Enroll student
        classroom.add_student(student_id)
        
        # Add classroom to student's list
        student = db.students[student_id]
        if classroom_id not in student.enrolled_classrooms:
            student.enrolled_classrooms.append(classroom_id)
            student._p_changed = True
        
        classroom._p_changed = True
        commit_changes()
    
    return {"message": "Student enrolled successfully"}


@router.post("/{classroom_id}/remove-student/{student_id}")
def remove_student(classroom_id: str, student_id: str, teacher_id: str = ""):
    """Remove student from classroom"""
    with DatabaseContext() as db:
        if classroom_id not in db.classrooms:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found"
            )
        
        classroom = db.classrooms[classroom_id]
        
        # Verify teacher
        if teacher_id and classroom.teacher_id != teacher_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only classroom teacher can remove students"
            )
        
        # Remove student
        classroom.remove_student(student_id)
        
        # Remove classroom from student's list
        if student_id in db.students:
            student = db.students[student_id]
            if classroom_id in student.enrolled_classrooms:
                student.enrolled_classrooms.remove(classroom_id)
                student._p_changed = True
        
        classroom._p_changed = True
        commit_changes()
    
    return {"message": "Student removed successfully"}


@router.put("/{classroom_id}", response_model=ClassroomResponse)
def update_classroom(classroom_id: str, req: ClassroomCreateRequest, teacher_id: str = ""):
    """Update classroom details"""
    with DatabaseContext() as db:
        if classroom_id not in db.classrooms:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found"
            )
        
        classroom = db.classrooms[classroom_id]
        
        # Verify teacher
        if teacher_id and classroom.teacher_id != teacher_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only classroom teacher can update"
            )
        
        # Update fields
        classroom.name = req.name
        classroom.description = req.description
        classroom.updated_at = datetime.now()
        classroom._p_changed = True
        
        commit_changes()
        
        return ClassroomResponse(
            classroom_id=classroom.classroom_id,
            name=classroom.name,
            description=classroom.description,
            teacher_id=classroom.teacher_id,
            students=list(classroom.students),
            labs=list(classroom.labs),
            created_at=classroom.created_at.isoformat()
        )
