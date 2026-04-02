"""
Lab Management Routes
"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List
from src.database import DatabaseContext, Lab, commit_changes
from datetime import datetime, date
import uuid

router = APIRouter(prefix="/api/labs", tags=["labs"])


class LabCreateRequest(BaseModel):
    title: str
    description: str
    classroom_id: str
    problem_file: Optional[str] = ""
    test_file: Optional[str] = ""
    due_date: Optional[str] = None


class LabResponse(BaseModel):
    lab_id: str
    title: str
    description: str
    classroom_id: str
    teacher_id: str
    is_active: bool
    problem_file: str
    test_file: str
    due_date: Optional[str]
    submissions_count: int
    created_at: str


class LabListResponse(BaseModel):
    labs: List[LabResponse]


class SubmissionResponse(BaseModel):
    student_id: str
    code: str
    timestamp: str
    feedback: Optional[str] = None


@router.post("/create", response_model=LabResponse)
def create_lab(req: LabCreateRequest, teacher_id: str):
    """Create new lab/assignment in classroom"""
    lab_id = f"lab_{uuid.uuid4().hex[:8]}"
    
    with DatabaseContext() as db:
        # Verify teacher and classroom exist
        if teacher_id not in db.teachers:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Teacher not found"
            )
        if req.classroom_id not in db.classrooms:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found"
            )
        
        # Verify teacher owns classroom
        classroom = db.classrooms[req.classroom_id]
        if classroom.teacher_id != teacher_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Teacher can only create labs in their own classrooms"
            )
        
        # Create lab
        lab = Lab(lab_id, req.title, req.description, teacher_id, req.classroom_id)
        lab.problem_file = req.problem_file
        lab.test_file = req.test_file
        if req.due_date:
            lab.due_date = req.due_date
        
        db.labs[lab_id] = lab
        
        # Add lab to classroom
        classroom.add_lab(lab_id)
        classroom._p_changed = True
        
        commit_changes()
    
    return LabResponse(
        lab_id=lab_id,
        title=req.title,
        description=req.description,
        classroom_id=req.classroom_id,
        teacher_id=teacher_id,
        is_active=False,
        problem_file=req.problem_file or "",
        test_file=req.test_file or "",
        due_date=req.due_date,
        submissions_count=0,
        created_at=datetime.now().isoformat()
    )


@router.get("/classroom/{classroom_id}", response_model=LabListResponse)
def get_classroom_labs(classroom_id: str):
    """Get all labs in a classroom"""
    with DatabaseContext() as db:
        if classroom_id not in db.classrooms:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found"
            )
        
        classroom = db.classrooms[classroom_id]
        labs = []
        
        for lab_id in classroom.labs:
            if lab_id in db.labs:
                lab = db.labs[lab_id]
                labs.append(LabResponse(
                    lab_id=lab.lab_id,
                    title=lab.title,
                    description=lab.description,
                    classroom_id=lab.classroom_id,
                    teacher_id=lab.teacher_id,
                    is_active=lab.is_active,
                    problem_file=lab.problem_file,
                    test_file=lab.test_file,
                    due_date=lab.due_date,
                    submissions_count=len([s for s in lab.submissions.values() if s]),
                    created_at=lab.created_at.isoformat()
                ))
        
        return LabListResponse(labs=labs)


@router.get("/{lab_id}", response_model=LabResponse)
def get_lab(lab_id: str):
    """Get lab details"""
    with DatabaseContext() as db:
        if lab_id not in db.labs:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lab not found"
            )
        
        lab = db.labs[lab_id]
        return LabResponse(
            lab_id=lab.lab_id,
            title=lab.title,
            description=lab.description,
            classroom_id=lab.classroom_id,
            teacher_id=lab.teacher_id,
            is_active=lab.is_active,
            problem_file=lab.problem_file,
            test_file=lab.test_file,
            due_date=lab.due_date,
            submissions_count=len([s for s in lab.submissions.values() if s]),
            created_at=lab.created_at.isoformat()
        )


@router.post("/{lab_id}/activate")
def activate_lab(lab_id: str, teacher_id: str = ""):
    """Activate lab (make it visible/accessible to students)"""
    with DatabaseContext() as db:
        if lab_id not in db.labs:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lab not found"
            )
        
        lab = db.labs[lab_id]
        
        # Verify teacher
        if teacher_id and lab.teacher_id != teacher_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only lab creator can activate"
            )
        
        lab.activate()
        lab._p_changed = True
        commit_changes()
    
    return {"message": "Lab activated successfully", "status": "active"}


@router.post("/{lab_id}/deactivate")
def deactivate_lab(lab_id: str, teacher_id: str = ""):
    """Deactivate lab (hide from students)"""
    with DatabaseContext() as db:
        if lab_id not in db.labs:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lab not found"
            )
        
        lab = db.labs[lab_id]
        
        # Verify teacher
        if teacher_id and lab.teacher_id != teacher_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only lab creator can deactivate"
            )
        
        lab.deactivate()
        lab._p_changed = True
        commit_changes()
    
    return {"message": "Lab deactivated successfully", "status": "inactive"}


@router.post("/{lab_id}/submit")
def submit_lab(lab_id: str, student_id: str, code: str, feedback: Optional[str] = None):
    """Submit lab solution (student submission)"""
    with DatabaseContext() as db:
        if lab_id not in db.labs:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lab not found"
            )
        
        lab = db.labs[lab_id]
        
        # Verify lab is active
        if not lab.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Lab is not active. Teacher must activate it first."
            )
        
        # Add submission
        submission_data = {
            'code': code,
            'feedback': feedback,
        }
        lab.add_submission(student_id, submission_data)
        lab._p_changed = True
        
        commit_changes()
    
    return {"message": "Submission recorded successfully", "lab_id": lab_id, "student_id": student_id}


@router.get("/{lab_id}/submissions/{student_id}", response_model=List[SubmissionResponse])
def get_student_submissions(lab_id: str, student_id: str):
    """Get all submissions for a student in a lab"""
    with DatabaseContext() as db:
        if lab_id not in db.labs:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lab not found"
            )
        
        lab = db.labs[lab_id]
        
        if student_id not in lab.submissions or not lab.submissions[student_id]:
            return []
        
        submissions = []
        for sub in lab.submissions[student_id]:
            submissions.append(SubmissionResponse(
                student_id=student_id,
                code=sub.get('code', ''),
                timestamp=sub.get('timestamp', datetime.now()).isoformat(),
                feedback=sub.get('feedback')
            ))
        
        return submissions


@router.put("/{lab_id}", response_model=LabResponse)
def update_lab(lab_id: str, req: LabCreateRequest, teacher_id: str = ""):
    """Update lab details"""
    with DatabaseContext() as db:
        if lab_id not in db.labs:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lab not found"
            )
        
        lab = db.labs[lab_id]
        
        # Verify teacher
        if teacher_id and lab.teacher_id != teacher_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only lab creator can update"
            )
        
        # Update fields
        lab.title = req.title
        lab.description = req.description
        lab.problem_file = req.problem_file
        lab.test_file = req.test_file
        if req.due_date:
            lab.due_date = req.due_date
        lab.updated_at = datetime.now()
        lab._p_changed = True
        
        commit_changes()
        
        return LabResponse(
            lab_id=lab.lab_id,
            title=lab.title,
            description=lab.description,
            classroom_id=lab.classroom_id,
            teacher_id=lab.teacher_id,
            is_active=lab.is_active,
            problem_file=lab.problem_file,
            test_file=lab.test_file,
            due_date=lab.due_date,
            submissions_count=len([s for s in lab.submissions.values() if s]),
            created_at=lab.created_at.isoformat()
        )
