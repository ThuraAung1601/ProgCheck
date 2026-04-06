"""
User Settings Routes
"""
from fastapi import APIRouter, HTTPException, status, Header
from pydantic import BaseModel
from typing import Optional
from src.database import DatabaseContext, commit_changes
from datetime import datetime

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    theme: Optional[str] = None  # "light" or "dark"
    auto_save: Optional[bool] = None
    email_alerts: Optional[bool] = None
    tab_size: Optional[int] = None  # 2 or 4
    email: Optional[str] = None
    phone: Optional[str] = None


class SettingsResponse(BaseModel):
    display_name: str
    theme: str
    auto_save: bool
    email_alerts: bool
    tab_size: int
    email: Optional[str]
    phone: Optional[str]



@router.get("/profile/{user_id}", response_model=SettingsResponse)
def get_settings(user_id: str, role: str = "student"):
    """Get user settings"""
    with DatabaseContext() as db:
        if role == "student":
            if user_id not in db.students:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Student not found"
                )
            user = db.students[user_id]
        else:  # teacher
            if user_id not in db.teachers:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Teacher not found"
                )
            user = db.teachers[user_id]
        
        settings = user.settings
        return SettingsResponse(
            display_name=settings.display_name,
            theme=settings.theme,
            auto_save=settings.auto_save,
            email_alerts=settings.email_alerts,
            tab_size=getattr(settings, 'tab_size', 2),
            email=settings.email,
            phone=settings.phone
        )


@router.put("/profile/{user_id}", response_model=SettingsResponse)
def update_settings(user_id: str, req: SettingsUpdateRequest, role: str = "student"):
    """Update user settings (auto-save friendly)"""
    with DatabaseContext() as db:
        if role == "student":
            if user_id not in db.students:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Student not found"
                )
            user = db.students[user_id]
        else:  # teacher
            if user_id not in db.teachers:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Teacher not found"
                )
            user = db.teachers[user_id]
        
        settings = user.settings
        
        # Update only provided fields
        if req.display_name is not None:
            settings.display_name = req.display_name
        if req.theme is not None:
            if req.theme not in ["light", "dark"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="theme must be 'light' or 'dark'"
                )
            settings.theme = req.theme
        if req.auto_save is not None:
            settings.auto_save = req.auto_save
        if req.email_alerts is not None:
            settings.email_alerts = req.email_alerts
        if req.tab_size is not None:
            if req.tab_size not in [2, 4]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="tab_size must be 2 or 4"
                )
            settings.tab_size = req.tab_size
        if req.email is not None:
            settings.email = req.email
        if req.phone is not None:
            settings.phone = req.phone
        
        settings.updated_at = datetime.now()
        user.updated_at = datetime.now()
        
        # Mark object as changed (for ZODB to track)
        user._p_changed = True
        
        commit_changes()
        
        return SettingsResponse(
            display_name=settings.display_name,
            theme=settings.theme,
            auto_save=settings.auto_save,
            email_alerts=settings.email_alerts,
            tab_size=getattr(settings, 'tab_size', 2),
            email=settings.email,
            phone=settings.phone
        )


@router.post("/password-change/{user_id}")
def change_password(user_id: str, old_password: str, new_password: str, role: str = "student"):
    """Change user password"""
    with DatabaseContext() as db:
        if role == "student":
            if user_id not in db.students:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Student not found"
                )
            user = db.students[user_id]
        else:  # teacher
            if user_id not in db.teachers:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Teacher not found"
                )
            user = db.teachers[user_id]
        
        # Verify old password
        if not user.verify_password(old_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Old password is incorrect"
            )
        
        # Update password
        user.update_password(new_password)
        user._p_changed = True
        
        commit_changes()
        
        return {"message": "Password changed successfully"}