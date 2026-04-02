# Quick Start: ProgCheck with ZODB

## Installation

```bash
# 1. Install new dependencies
pip install -r requirements.txt

# 2. The database will auto-initialize on first run!
# No manual setup needed.
```

## Start the Project

```bash
# Terminal 1 - Backend
cd webui
python -m uvicorn main:app --reload

# Terminal 2 - Frontend  
cd webui/frontend
npm start
```

Visit **http://localhost:3000**

---

## Test Account Creation

### Create Your First Student Account
1. Click **"Student Login"** on homepage
2. Click **"Don't have an account? Create one"**
3. Fill in:
   - **Student ID**: 66011148 (or any ID)
   - **Username**: testuser
   - **Password**: password123
4. Click **"Create Account"**

### Create Teacher Account
1. Click **"Teacher Login"** on homepage  
2. Click **"Don't have an account? Create one"**
3. Fill in:
   - **Teacher ID**: T-001 (or any ID)
   - **Username**: teacher1
   - **Password**: password123
4. Click **"Create Account"**

---

## What You Can Do Now

### As a Student
✅ Log in with your credentials  
✅ View and update profile settings  
✅ Change password  
✅ Set theme preference (light/dark)  
✅ Enable/disable auto-save  
✅ Manage email alerts  
✅ View enrolled classrooms (coming soon)  

### As a Teacher
✅ Log in with your credentials  
✅ Create new classrooms  
✅ Add labs/assignments to classrooms  
✅ **Activate/Deactivate labs** (students can only do active labs)  
✅ Manage settings  
✅ View student submissions (coming soon)  

---

## Key Features

### 🔐 Secure Authentication
- Password hashing with bcrypt
- Login/Registration flow
- Persistent sessions (stores token in browser)

### 💾 Auto-Save Settings
- Changes save automatically after 1.5 seconds
- No need to click "Save" button
- Changes persist permanently in database

### 📚 Classroom Management
Create classrooms for different courses:
```
Right-click on Dashboard → Settings → Classroom & Labs
```

### 🧪 Lab Activation System
Teachers **must activate** labs before students can access them:
```
Create Lab → [Inactive] → Click "Activate" → [Active]
Students can now submit solutions
```

### 📊 User Settings
Access from Dashboard → Settings Icon:
- Display name
- Email address
- Theme (light/dark)
- Auto-save toggle
- Email alerts toggle
- Password change

---

## Database File Location

Your data is stored in:
```
data/progcheck.fs
data/progcheck.fs.index
data/progcheck.fs.lock
```

These files persist all user data, classrooms, labs, and settings!

---

## Reset Database (if needed)

To delete all data and start fresh:
```bash
rm -f data/progcheck.fs*
# Restart server - fresh database auto-initializes
```

---

## API Endpoints

All endpoints automatically available:

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login/student` - Student login
- `POST /api/auth/login/teacher` - Teacher login

### Settings
- `GET /api/settings/profile/{user_id}` - Get settings
- `PUT /api/settings/profile/{user_id}` - Update settings
- `POST /api/settings/password-change/{user_id}` - Change password

### Classrooms
- `POST /api/classrooms/create` - Create classroom
- `GET /api/classrooms/teacher/{teacher_id}` - List teacher's classrooms
- `GET /api/classrooms/student/{student_id}` - List student's classrooms

### Labs
- `POST /api/labs/create` - Create lab
- `GET /api/labs/classroom/{classroom_id}` - List classroom labs
- `POST /api/labs/{lab_id}/activate` - Activate lab
- `POST /api/labs/{lab_id}/deactivate` - Deactivate lab
- `POST /api/labs/{lab_id}/submit` - Submit solution

---

## Example Flow

### 1. Teacher Sets Up Course

```
1. Register/Login as teacher (T-001)
2. Go to Settings → Classrooms
3. Click "New Classroom"
4. Create "Prolog 101"
5. Click "Add Lab"
6. Create "Factorial Lab"
7. Click "Activate" to make it available to students
```

### 2. Student Takes Lab

```
1. Register/Login as student (66011148)
2. Enroll in "Prolog 101" classroom
3. View "Factorial Lab" (only if active!)
4. Submit solution
5. See feedback
```

### 3. Both Manage Settings

```
1. Login as any user
2. Go to Settings
3. Change display name
4. Switch theme
5. Enable auto-save
6. Change password
```

---

## Troubleshooting

### "Lab is not active"
**Problem**: Student trying to access lab but getting error  
**Solution**: Teacher must activate the lab first! Go to Classrooms → Lab → Click "Activate"

### Settings not saving
**Problem**: Changes not persisting  
**Solution**: Check browser console for errors. Reset database if needed (see above)

### Login error
**Problem**: Can't log in with correct credentials  
**Solution**: Make sure you registered the account first. Try creating a new test account.

### Database errors
**Problem**: "Database not initialized" error  
**Solution**: Restart the backend server. It auto-initializes on startup.

---

## Next Steps

1. ✅ Test account creation (student & teacher)
2. ✅ Create a classroom
3. ✅ Create and activate a lab
4. ✅ Update your profile settings
5. ✅ Change your password
6. 📝 Integrate with existing Prolog checker UI

---

## Support

For issues or questions, check:
1. Browser console (F12 → Console tab)
2. Server logs (Backend terminal)
3. ZODB_INTEGRATION_GUIDE.md (detailed documentation)

Enjoy using ProgCheck with ZODB! 🎉
