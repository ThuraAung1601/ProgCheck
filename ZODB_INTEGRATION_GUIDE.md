# ZODB Integration Guide - ProgCheck Database System

## Overview

ProgCheck now uses **ZODB** (Zope Object Database) as a persistent data store for managing user accounts, classrooms, labs, and settings. This guide explains the complete integration.

---

## What Was Added

### 1. **Backend - Database Layer** (`src/database/`)

#### **models.py**
Defines persistent classes for ZODB:
- **`UserSettings`**: Theme, auto-save, email alerts, profile info
- **`Student`**: Student account with ID, username, password hash, enrolled classrooms
- **`Teacher`**: Teacher account with ID, username, password hash, owned classrooms
- **`Classroom`**: Course container with students, labs, and metadata
- **`Lab`**: Assignment/lab with active status, submissions, metadata
- **`Database`**: Root container holding all objects

**Key Features:**
- Password hashing using bcrypt
- Auto-tracking of created/updated timestamps
- Persistent lists and mappings for relationships

#### **db.py**
Database connection and transaction management:
- `init_database()`: Initialize ZODB FileStorage
- `DatabaseContext`: Context manager for safe database operations
- `commit_changes()`: Persist changes
- `abort_changes()`: Rollback changes

### 2. **Backend - API Routes** (`src/routes/`)

#### **auth.py** - `/api/auth/*`
```
POST /api/auth/register       Register new student or teacher
POST /api/auth/login/student  Student login
POST /api/auth/login/teacher  Teacher login
```

#### **settings.py** - `/api/settings/*`
```
GET  /api/settings/profile/{user_id}           Get user settings
PUT  /api/settings/profile/{user_id}           Update settings (auto-save)
POST /api/settings/password-change/{user_id}   Change password
```

#### **classrooms.py** - `/api/classrooms/*`
```
POST /api/classrooms/create                    Create classroom
GET  /api/classrooms/teacher/{teacher_id}      Get teacher's classrooms
GET  /api/classrooms/student/{student_id}      Get student's classrooms
POST /api/classrooms/{classroom_id}/enroll-student/{student_id}
POST /api/classrooms/{classroom_id}/remove-student/{student_id}
PUT  /api/classrooms/{classroom_id}            Update classroom
```

#### **labs.py** - `/api/labs/*`
```
POST /api/labs/create                          Create lab
GET  /api/labs/classroom/{classroom_id}        Get classroom labs
POST /api/labs/{lab_id}/activate               Teacher activates lab
POST /api/labs/{lab_id}/deactivate             Teacher deactivates lab
POST /api/labs/{lab_id}/submit                 Student submits solution
GET  /api/labs/{lab_id}/submissions/{student_id}
```

### 3. **Frontend - Enhanced Authentication**

#### **LoginPage.js Updates**
- Now makes actual API calls to `/api/auth/login/{role}` and `/api/auth/register`
- Supports both login and registration flows
- Stores auth token, userId, and role in localStorage
- Improved error handling and user feedback

#### **SettingsPage.js Updates**
- Fetches user settings from `/api/settings/profile/{user_id}`
- Auto-save settings changes (debounced)
- Theme selection (light/dark)
- Auto-save toggle
- Email alerts toggle
- Password change form
- Display name, email, phone management

### 4. **Main Application** (`webui/main.py`)

Added to FastAPI app:
```python
# Startup: Initialize ZODB database
# Shutdown: Close database connection
# Include routers: auth, settings, classrooms, labs
```

---

## Database Structure

### FileStorage Location
```
data/progcheck.fs  # ZODB database file
data/progcheck.fs.index  # Index file (auto-created)
data/progcheck.fs.lock  # Lock file (auto-created)
```

### Object Hierarchy
```
Database (root)
├── students {student_id: Student}
├── teachers {teacher_id: Teacher}
├── classrooms {classroom_id: Classroom}
└── labs {lab_id: Lab}
```

---

## Installation & Setup

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

New packages added:
- `ZODB>=5.3.0` - Object database
- `persistent>=4.10.0` - Persistence support
- `bcrypt>=4.0.0` - Password hashing
- `python-dotenv>=1.0.0` - Environment management

### 2. Initialize Database
The database auto-initializes on first startup. No manual setup required!

### 3. Start the Server
```bash
# Backend
cd webui
python -m uvicorn main:app --reload

# Frontend (in another terminal)
cd webui/frontend
npm start
```

---

## Workflow Examples

### Student Registration & Login

1. **Register**
   ```
   POST /api/auth/register
   {
     "username": "john_doe",
     "password": "secure_password",
     "role": "student",
     "student_id": "66011148"
   }
   ```

2. **Login**
   ```
   POST /api/auth/login/student
   {
     "username": "john_doe",
     "password": "secure_password"
   }
   ```

3. **Response**
   ```json
   {
     "user": {
       "id": "66011148",
       "username": "john_doe",
       "role": "student",
       "email": "",
       "display_name": ""
     },
     "token": "uuid-token-string"
   }
   ```

### Teacher Creates Classroom & Lab

1. **Create Classroom**
   ```
   POST /api/classrooms/create?teacher_id={teacher_id}
   {
     "name": "Prolog 101",
     "description": "Introduction to Logic Programming"
   }
   ```

2. **Create Lab**
   ```
   POST /api/labs/create?teacher_id={teacher_id}
   {
     "title": "Factorial Problem",
     "description": "Implement recursive factorial",
     "classroom_id": "class_abc123",
     "problem_file": "data/examples/factorial_problem.txt",
     "test_file": "data/test_files/factorial_test.pl"
   }
   ```

3. **Activate Lab** (Students can only do labs when active)
   ```
   POST /api/labs/{lab_id}/activate?teacher_id={teacher_id}
   ```

### Student Updates Settings

1. **Update Settings** (auto-saved)
   ```
   PUT /api/settings/profile/{user_id}?role=student
   {
     "display_name": "John Doe",
     "theme": "dark",
     "auto_save": true,
     "email_alerts": true,
     "email": "john@kmitl.ac.th"
   }
   ```

---

## Key Features

### ✅ Complete Data Persistence
- Student/Teacher accounts
- Classrooms and enrollment
- Labs and submissions
- User settings and preferences

### ✅ Auto-Save
- Settings update with debounced auto-save (1.5s)
- No need to click "Save"
- Changes persist to ZODB immediately

### ✅ Lab Status Management
- Teachers must activate labs first
- Students can only access active labs
- Prevents accidental access to incomplete assignments

### ✅ User Settings
- Theme preference (light/dark)
- Auto-save toggle
- Email alerts
- Display name customization
- Email and phone contact info

### ✅ Password Security
- bcrypt hashing (salt + iterations)
- Secure password change endpoint
- Old password verification required

### ✅ Multi-Role Support
- Student and Teacher roles
- Separate login endpoints
- Role-based access control

---

## Frontend Integration

### localStorage Usage
```javascript
localStorage.setItem('authToken', token);      // Auth token
localStorage.setItem('userId', user.id);       // Current user ID
localStorage.setItem('userRole', user.role);   // student or teacher
```

### API Calls Pattern
```javascript
fetch('/api/endpoint', {
  method: 'POST/PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
  },
  body: JSON.stringify(data)
})
```

---

## Next Steps

### Recommended Additions
1. **Student Classrooms View** - Show enrolled classrooms
2. **Lab Submissions** - Implement submission portal
3. **Grade Management** - Teacher grading interface
4. **Email Notifications** - Send alerts for active labs
5. **Backup System** - Regular database backups

### Optional Enhancements
1. JWT tokens (currently using UUID)
2. Email verification
3. Password reset flow
4. Audit logging
5. Data export functionality

---

## Troubleshooting

### Database File Issues
```bash
# Delete old database to start fresh
rm -f data/progcheck.fs*

# Restart server - new database auto-initializes
```

### Connection Errors
```python
# Check if database initialized in main.py startup event
# Verify data/ directory exists
# Check file permissions on data/ directory
```

### Transaction Issues
```python
# Always use DatabaseContext() for transactions
with DatabaseContext() as db:
    # make changes
    # auto-commits on exit
    pass
```

---

## File Structure

```
src/
├── database/
│   ├── __init__.py
│   ├── db.py               # Connection management
│   └── models.py           # ZODB persistent classes
├── routes/
│   ├── __init__.py
│   ├── auth.py             # Authentication
│   ├── settings.py         # User settings
│   ├── classrooms.py       # Classroom management
│   └── labs.py             # Lab management
└── ... (existing code)

webui/
├── main.py                 # Updated with ZODB integration
├── frontend/src/
│   ├── pages/
│   │   ├── LoginPage.js    # Updated with API calls
│   │   └── SettingsPage.js # Updated with API calls
│   └── ... (other files)

data/
├── progcheck.fs            # ZODB database file (created on first run)
└── ... (existing example files)
```

---

## Summary

The ZODB integration provides a complete, persistent database system for ProgCheck while maintaining simplicity and ease of use. All user-facing changes are handled through REST APIs, making it easy to extend functionality in the future.

**Key Achievement:** Full-stack implementation of user accounts, classrooms, labs, and settings with automatic persistence!
