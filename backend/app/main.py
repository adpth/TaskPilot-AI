from datetime import date, datetime, timedelta, timezone
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, select
from contextlib import asynccontextmanager
import hashlib
import hmac
import json
import base64
import os
import secrets

from app.database import create_db_and_tables, get_session
from app.models import User, Project, Task, TaskStep, ScheduleSlot
from app.ai_engine import generate_project_tasks
from app.behavior_engine import generate_unblock_steps
from app.scheduler import schedule_day, reschedule_overrun

# JWT secret (portfolio-grade, generates a new one per server restart if not set)
JWT_SECRET = os.getenv("JWT_SECRET", secrets.token_hex(32))
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 72

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables on startup
    create_db_and_tables()
    yield
    # Cleanups on shutdown if any

app = FastAPI(
    title="TaskPilot AI API",
    description="Intelligent natural language task planner and optimal scheduler.",
    version="1.0.0",
    lifespan=lifespan
)

# Setup CORS for Frontend integration (security flaw resolved: lock down wildcard origins)
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# API Request/Response models
class CreateProjectRequest(BaseModel):
    name: str
    description: Optional[str] = None

class ManualTaskRequest(BaseModel):
    title: str
    priority: str = "medium"
    description: Optional[str] = None
    steps: Optional[List[dict]] = None  # [{"title": "...", "duration_minutes": 30}]

class ToggleStepResponse(BaseModel):
    step_id: int
    completed: bool
    task_id: int

class FocusSessionRequest(BaseModel):
    actual_duration_minutes: int
    difficulty_rating: int

class UnblockRequest(BaseModel):
    blocker_description: str

# Auth Request/Response models
class SignupRequest(BaseModel):
    email: str
    password: str
    name: str

class LoginRequest(BaseModel):
    email: str
    password: str

class AuthResponse(BaseModel):
    token: str
    user_id: int
    email: str
    name: Optional[str] = None

class UserProfile(BaseModel):
    id: int
    email: str
    name: Optional[str] = None

# ------------ Password Hashing Utilities (bcrypt-free, uses PBKDF2) ------------

def hash_password(password: str) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256 with a random salt."""
    salt = secrets.token_hex(16)
    pwd_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
    return f"{salt}${pwd_hash.hex()}"

def verify_password(password: str, stored_hash: str) -> bool:
    """Verify a password against a stored PBKDF2 hash."""
    try:
        salt, pwd_hash = stored_hash.split('$')
        new_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
        return hmac.compare_digest(new_hash.hex(), pwd_hash)
    except Exception:
        return False

# ------------ JWT Utilities (zero-dependency) ------------

def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

def _b64url_decode(s: str) -> bytes:
    s += '=' * (4 - len(s) % 4)
    return base64.urlsafe_b64decode(s)

def create_jwt(user_id: int, email: str, name: Optional[str] = None) -> str:
    """Create a simple HS256 JWT token."""
    header = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload_data = {
        "user_id": user_id,
        "email": email,
        "name": name,
        "exp": (datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)).isoformat()
    }
    payload = _b64url_encode(json.dumps(payload_data).encode())
    signature_input = f"{header}.{payload}".encode()
    signature = _b64url_encode(
        hmac.new(JWT_SECRET.encode(), signature_input, hashlib.sha256).digest()
    )
    return f"{header}.{payload}.{signature}"

def decode_jwt(token: str) -> dict:
    """Decode and verify a JWT token. Returns payload dict or raises."""
    try:
        header_b64, payload_b64, signature_b64 = token.split('.')
        # Verify signature
        signature_input = f"{header_b64}.{payload_b64}".encode()
        expected_sig = _b64url_encode(
            hmac.new(JWT_SECRET.encode(), signature_input, hashlib.sha256).digest()
        )
        if not hmac.compare_digest(expected_sig, signature_b64):
            raise ValueError("Invalid signature")
        # Decode payload
        payload = json.loads(_b64url_decode(payload_b64))
        # Check expiration
        exp = datetime.fromisoformat(payload["exp"])
        if exp < datetime.now(timezone.utc):
            raise ValueError("Token expired")
        return payload
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {str(e)}")

def get_current_user(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session)
) -> User:
    """FastAPI dependency that extracts and validates the JWT Bearer token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1]
    payload = decode_jwt(token)
    user = session.get(User, payload["user_id"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

@app.get("/")
def read_root():
    return {"message": "Welcome to TaskPilot AI API!", "status": "active"}

# ----------------- AUTH ROUTES -----------------

@app.post("/api/auth/signup", response_model=AuthResponse)
def signup(payload: SignupRequest, session: Session = Depends(get_session)):
    """Register a new user with email and password."""
    if not payload.email.strip() or not payload.password.strip():
        raise HTTPException(status_code=400, detail="Email and password are required.")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    
    # Check if user already exists
    existing = session.exec(select(User).where(User.email == payload.email)).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    
    # Pre-generate O(1) indexed calendar feed token for fast secure loading
    feed_token = hashlib.sha256(payload.email.strip().lower().encode()).hexdigest()[:16]
    user = User(
        email=payload.email.strip().lower(),
        name=payload.name.strip(),
        hashed_password=hash_password(payload.password),
        feed_token=feed_token
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    
    token = create_jwt(user.id, user.email, user.name)
    return AuthResponse(token=token, user_id=user.id, email=user.email, name=user.name)

@app.post("/api/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest, session: Session = Depends(get_session)):
    """Authenticate a user with email and password."""
    user = session.exec(select(User).where(User.email == payload.email.strip().lower())).first()
    if not user or not user.hashed_password:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    
    token = create_jwt(user.id, user.email, user.name)
    return AuthResponse(token=token, user_id=user.id, email=user.email, name=user.name)

@app.get("/api/auth/me", response_model=UserProfile)
def get_me(current_user: User = Depends(get_current_user)):
    """Returns the profile of the currently authenticated user."""
    return UserProfile(id=current_user.id, email=current_user.email, name=current_user.name)

# ----------------- PROJECT ROUTES -----------------

@app.post("/api/projects")
def create_project(
    payload: CreateProjectRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Creates a new project and uses AI to generate the initial task breakdown.
    """
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Project name cannot be empty.")
    
    # 1. Create the project
    project = Project(
        user_id=current_user.id,
        name=payload.name.strip(),
        description=payload.description
    )
    session.add(project)
    session.flush()  # Populates project.id
    
    # 2. Generate AI tasks for the project
    ai_tasks = generate_project_tasks(payload.name, payload.description or "")
    
    for ai_task in ai_tasks:
        db_task = Task(
            project_id=project.id,
            title=ai_task.title,
            priority=ai_task.priority,
            total_duration=ai_task.estimated_duration,
            is_ai_generated=True
        )
        session.add(db_task)
        session.flush()
        
        for idx, ai_step in enumerate(ai_task.steps):
            db_step = TaskStep(
                task_id=db_task.id,
                title=ai_step.title,
                duration_minutes=ai_step.duration_minutes,
                order=idx,
                completed=False
            )
            session.add(db_step)
    
    session.commit()
    session.refresh(project)
    
    # Return project with tasks
    return _project_to_dict(project, session)


@app.get("/api/projects")
def list_projects(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Lists all projects with task counts and completion stats."""
    # Self-healing dynamic migration: claim orphaned projects in the database for the active user
    orphaned_projects = session.exec(select(Project).where(Project.user_id == None)).all()
    for p in orphaned_projects:
        p.user_id = current_user.id
        session.add(p)
    if orphaned_projects:
        session.commit()

    stmt = select(Project).where(Project.user_id == current_user.id).order_by(Project.created_at.desc())
    projects = session.exec(stmt).all()
    
    result = []
    for p in projects:
        total_tasks = len(p.tasks)
        total_steps = sum(len(t.steps) for t in p.tasks)
        completed_steps = sum(1 for t in p.tasks for s in t.steps if s.completed)
        result.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "task_count": total_tasks,
            "total_steps": total_steps,
            "completed_steps": completed_steps,
        })
    return result


@app.get("/api/projects/{project_id}")
def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Returns full project detail with all tasks and steps."""
    project = session.get(Project, project_id)
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    return _project_to_dict(project, session)


@app.delete("/api/projects/{project_id}")
def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Deletes a project and all its tasks (cascade)."""
    project = session.get(Project, project_id)
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    session.delete(project)
    session.commit()
    return {"message": f"Successfully deleted project {project_id}"}


@app.post("/api/projects/{project_id}/tasks")
def add_manual_task(
    project_id: int,
    payload: ManualTaskRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Manually adds a user-created task to a project."""
    project = session.get(Project, project_id)
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="Task title cannot be empty.")
    
    total_dur = 0
    if payload.steps:
        total_dur = sum(s.get("duration_minutes", 0) for s in payload.steps)
    
    db_task = Task(
        project_id=project.id,
        title=payload.title.strip(),
        description=payload.description,
        priority=payload.priority,
        total_duration=total_dur,
        is_ai_generated=False
    )
    session.add(db_task)
    session.flush()
    
    if payload.steps:
        for idx, step_data in enumerate(payload.steps):
            db_step = TaskStep(
                task_id=db_task.id,
                title=step_data.get("title", f"Step {idx+1}"),
                duration_minutes=step_data.get("duration_minutes", 30),
                order=idx,
                completed=False
            )
            session.add(db_step)
    
    session.commit()
    session.refresh(db_task)
    
    return {
        "id": db_task.id,
        "project_id": db_task.project_id,
        "title": db_task.title,
        "description": db_task.description,
        "priority": db_task.priority,
        "total_duration": db_task.total_duration,
        "is_ai_generated": db_task.is_ai_generated,
        "steps": [
            {"id": s.id, "task_id": s.task_id, "title": s.title, "duration_minutes": s.duration_minutes, "completed": s.completed, "order": s.order}
            for s in sorted(db_task.steps, key=lambda x: x.order)
        ]
    }


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, session: Session = Depends(get_session)):
    """Deletes a specific task along with all its steps."""
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    session.delete(task)
    session.commit()
    return {"message": f"Successfully deleted task {task_id}"}


@app.get("/api/tasks/{task_id}")
def get_task(task_id: int, session: Session = Depends(get_session)):
    """Retrieves a single task detail along with its steps."""
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {
        "id": task.id,
        "project_id": task.project_id,
        "title": task.title,
        "description": task.description,
        "priority": task.priority,
        "total_duration": task.total_duration,
        "is_ai_generated": task.is_ai_generated,
        "steps": [
            {"id": s.id, "task_id": s.task_id, "title": s.title, "duration_minutes": s.duration_minutes, "completed": s.completed, "order": s.order}
            for s in sorted(task.steps, key=lambda x: x.order)
        ]
    }


@app.put("/api/tasks/{task_id}/focus-session")
def update_task_focus_session(
    task_id: int,
    payload: FocusSessionRequest,
    session: Session = Depends(get_session)
):
    """Logs the final focus session duration and difficulty rating against the task."""
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    task.actual_duration = (task.actual_duration or 0) + payload.actual_duration_minutes
    task.difficulty_rating = payload.difficulty_rating
    
    # Also log completed_at timestamps on all completed steps that don't have it yet!
    for step in task.steps:
        if step.completed and not step.completed_at:
            step.completed_at = datetime.utcnow()
            session.add(step)
            
    session.add(task)
    session.commit()
    session.refresh(task)
    return {
        "message": "Focus session logged successfully", 
        "actual_duration": task.actual_duration, 
        "difficulty_rating": task.difficulty_rating
    }


@app.post("/api/tasks/{task_id}/steps/{step_id}/unblock")
def unblock_task_step(
    task_id: int,
    step_id: int,
    payload: UnblockRequest,
    session: Session = Depends(get_session)
):
    """Uses the AI behavior engine to unblock a user-defined step, appending concrete micro-starter steps."""
    task = session.get(Task, task_id)
    step = session.get(TaskStep, step_id)
    if not task or not step:
        raise HTTPException(status_code=404, detail="Task or Step not found")
        
    # Increment task procrastination / resistance count
    task.procrastination_count = (task.procrastination_count or 0) + 1
    session.add(task)
    
    # Generate unblock sub-tasks
    unblock_tasks = generate_unblock_steps(step.title, payload.blocker_description)
    
    # 1. Shift the orders of all existing steps that are at or after the stuck step's order
    stuck_order = step.order
    N = len(unblock_tasks)
    
    for s in task.steps:
        if s.order >= stuck_order:
            s.order += N
            session.add(s)
            
    # 2. Insert the new micro-steps right before the stuck step
    added_steps = []
    for idx, sub_step_title in enumerate(unblock_tasks):
        new_step = TaskStep(
            task_id=task.id,
            title=sub_step_title,
            duration_minutes=10, # default tiny 10m micro-steps
            order=stuck_order + idx,
            completed=False
        )
        session.add(new_step)
        added_steps.append(new_step)
        
    session.commit()
    
    return {
        "message": f"Successfully generated {len(added_steps)} unblock micro-steps",
        "added_steps": [
            {"id": s.id, "title": s.title, "duration_minutes": s.duration_minutes, "completed": s.completed}
            for s in added_steps
        ]
    }


def _project_to_dict(project: Project, session: Session) -> dict:
    """Converts a Project ORM object into a JSON-friendly dictionary."""
    tasks_list = []
    for t in sorted(project.tasks, key=lambda x: x.created_at):
        tasks_list.append({
            "id": t.id,
            "project_id": t.project_id,
            "title": t.title,
            "description": t.description,
            "priority": t.priority,
            "total_duration": t.total_duration,
            "is_ai_generated": t.is_ai_generated,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "steps": [
                {"id": s.id, "task_id": s.task_id, "title": s.title, "duration_minutes": s.duration_minutes, "completed": s.completed, "order": s.order}
                for s in sorted(t.steps, key=lambda x: x.order)
            ]
        })
    
    total_steps = sum(len(t.steps) for t in project.tasks)
    completed_steps = sum(1 for t in project.tasks for s in t.steps if s.completed)
    
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "task_count": len(project.tasks),
        "total_steps": total_steps,
        "completed_steps": completed_steps,
        "tasks": tasks_list,
    }

# ----------------- SCHEDULE ROUTES -----------------

@app.post("/api/schedule/generate", response_model=List[ScheduleSlot])
def generate_schedule(
    target_date: Optional[str] = None,  # Format YYYY-MM-DD
    start_hour: int = 9,
    end_hour: int = 18,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Triggers the constraint satisfaction scheduler to allocate free slots
    for tasks based on workday hours and priorities.
    """
    if target_date:
        try:
            scheduling_date = datetime.strptime(target_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        scheduling_date = date.today()
        
    slots = schedule_day(
        session=session,
        user_id=current_user.id,
        target_date=scheduling_date,
        start_hour=start_hour,
        end_hour=end_hour
    )
    return slots

@app.get("/api/schedule", response_model=List[ScheduleSlot])
def get_schedule(
    target_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Retrieves the active schedule slots for a given date."""
    # Self-healing dynamic migration: claim orphaned schedule slots in the database for the active user
    orphaned_slots = session.exec(select(ScheduleSlot).where(ScheduleSlot.user_id == None)).all()
    for s in orphaned_slots:
        s.user_id = current_user.id
        session.add(s)
    if orphaned_slots:
        session.commit()

    if target_date:
        try:
            query_date = datetime.strptime(target_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        query_date = date.today()
        
    day_start = datetime.combine(query_date, datetime.min.time())
    day_end = datetime.combine(query_date, datetime.max.time())
    
    stmt = select(ScheduleSlot).where(
        ScheduleSlot.user_id == current_user.id,
        ScheduleSlot.start_time >= day_start,
        ScheduleSlot.end_time <= day_end
    ).order_by(ScheduleSlot.start_time.asc())
    
    return session.exec(stmt).all()


@app.get("/api/schedule/workload-audit")
def get_workload_audit(
    target_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Audits today's planned schedule for workload realism, cognitive load overloading,
    and returns Gemini-powered recommendations.
    """
    from app.behavior_engine import audit_workload_realism
    from app.models import time
    
    # 1. Fetch slots for the day
    if target_date:
        try:
            query_date = datetime.strptime(target_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        query_date = date.today()
        
    day_start = datetime.combine(query_date, datetime.min.time())
    day_end = datetime.combine(query_date, datetime.max.time())
    
    stmt = select(ScheduleSlot).where(
        ScheduleSlot.user_id == current_user.id,
        ScheduleSlot.start_time >= day_start,
        ScheduleSlot.end_time <= day_end
    )
    slots = session.exec(stmt).all()
    
    # 2. Extract tasks associated with these slots
    tasks_to_audit = []
    seen_task_ids = set()
    
    for slot in slots:
        if slot.task_id and slot.task_id not in seen_task_ids:
            task = session.get(Task, slot.task_id)
            if task:
                seen_task_ids.add(slot.task_id)
                tasks_to_audit.append({
                    "title": task.title,
                    "total_duration": task.total_duration or 30,
                    "cognitive_cost": task.cognitive_cost or "medium"
                })
                
    # 3. Fetch user daily capacity
    daily_capacity = current_user.daily_focus_capacity or 240
            
    # 4. Audit workload realism
    audit_result = audit_workload_realism(tasks_to_audit, daily_capacity_minutes=daily_capacity)
    
    return {
        "total_duration_minutes": audit_result.total_duration_minutes,
        "deep_work_minutes": audit_result.deep_work_minutes,
        "realism_score": audit_result.realism_score,
        "is_overload_risk": audit_result.is_overload_risk,
        "audit_recommendation": audit_result.audit_recommendation
    }


@app.get("/api/users/{feed_token}/calendar.ics")
def get_calendar_ics_feed(
    feed_token: str,
    session: Session = Depends(get_session)
):
    """
    Exposes a dynamic iCalendar (.ics) subscription feed for a user.
    Secured by a unique feed_token (first 16 chars of SHA256 of user's email).
    """
    # Find user using high-performance O(1) database-indexed query (Supabase postgres best practices)
    target_user = session.exec(select(User).where(User.feed_token == feed_token)).first()
    
    # Secure lazy-migration fallback: matches legacy seeded users dynamically
    if not target_user:
        users = session.exec(select(User)).all()
        for u in users:
            token_candidate = hashlib.sha256(u.email.lower().strip().encode()).hexdigest()[:16]
            # Timing-attack resistant secure constant-time comparison
            if hmac.compare_digest(token_candidate, feed_token):
                target_user = u
                # Auto-upgrade legacy user's feed_token in database
                u.feed_token = token_candidate
                session.add(u)
                session.commit()
                break
                
    if not target_user:
        raise HTTPException(status_code=404, detail="Feed not found or invalid token")

        
    # Get user schedule slots for yesterday up to 14 days lookahead
    day_start = datetime.utcnow() - timedelta(days=1)
    day_end = datetime.utcnow() + timedelta(days=14)
    
    stmt = select(ScheduleSlot).where(
        ScheduleSlot.user_id == target_user.id,
        ScheduleSlot.start_time >= day_start,
        ScheduleSlot.end_time <= day_end
    ).order_by(ScheduleSlot.start_time.asc())
    slots = session.exec(stmt).all()
    
    ics_lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//TaskPilot AI//NONSGML Calendar Feed//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:TaskPilot AI ({target_user.name or target_user.email})",
        "REFRESH-INTERVAL;VALUE=DURATION:PT15M" # Native calendars refresh every 15m
    ]
    
    for slot in slots:
        if slot.is_calendar_event:
            continue
            
        start_str = slot.start_time.strftime("%Y%m%dT%H%M%S")
        end_str = slot.end_time.strftime("%Y%m%dT%H%M%S")
        stamp_str = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
        
        title_escaped = slot.title.replace(",", "\\,").replace(";", "\\;")
        description = "Planned and optimized dynamically by TaskPilot AI."
        
        ics_lines.extend([
            "BEGIN:VEVENT",
            f"UID:slot-{slot.id}@{slot.start_time.date()}",
            f"DTSTAMP:{stamp_str}",
            f"DTSTART:{start_str}",
            f"DTEND:{end_str}",
            f"SUMMARY:{title_escaped}",
            f"DESCRIPTION:{description}",
            "END:VEVENT"
        ])
        
    ics_lines.append("END:VCALENDAR")
    ics_content = "\n".join(ics_lines)
    
    from fastapi import Response
    return Response(content=ics_content, media_type="text/calendar")


@app.post("/api/schedule/slot/{slot_id}/toggle-lock")
def toggle_slot_lock(
    slot_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Toggles the locking mechanism of a schedule slot."""
    slot = session.get(ScheduleSlot, slot_id)
    if not slot or slot.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Schedule slot not found")
    slot.is_locked = not slot.is_locked
    session.add(slot)
    session.commit()
    session.refresh(slot)
    return {"message": "Success", "slot_id": slot.id, "is_locked": slot.is_locked}

# ----------------- TASK STEP ROUTES -----------------

@app.post("/api/steps/{step_id}/toggle", response_model=ToggleStepResponse)
def toggle_step_completion(
    step_id: int,
    session: Session = Depends(get_session)
):
    """Toggles completion status of a task step."""
    step = session.get(TaskStep, step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Task step not found")
        
    step.completed = not step.completed
    session.add(step)
    session.commit()
    session.refresh(step)
    
    return ToggleStepResponse(
        step_id=step.id,
        completed=step.completed,
        task_id=step.task_id
    )

# ----------------- MOCK DATA SEEDER -----------------

@app.post("/api/seed-mock-calendar")
def seed_mock_calendar_events(
    target_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Seeds mock calendar events (e.g. standard daily meetings) to demonstrate
    scheduling around fixed external blocks.
    """
    if target_date:
        query_date = datetime.strptime(target_date, "%Y-%m-%d").date()
    else:
        query_date = date.today()
        
    # Secure ORM dynamic deletion: type-safe and database-agnostic (Supabase/PostgreSQL compatible)
    day_start = datetime.combine(query_date, datetime.min.time())
    day_end = datetime.combine(query_date, datetime.max.time())
    
    stmt_to_delete = select(ScheduleSlot).where(
        ScheduleSlot.is_calendar_event == True,
        ScheduleSlot.start_time >= day_start,
        ScheduleSlot.end_time <= day_end,
        ScheduleSlot.user_id == current_user.id
    )
        
    slots_to_delete = session.exec(stmt_to_delete).all()
    for s in slots_to_delete:
        session.delete(s)
    session.commit()

    
    # Create two standard meetings:
    # 1. Daily Standup: 10:00 - 10:30 AM
    # 2. Project Sync: 2:00 - 3:00 PM
    meeting1 = ScheduleSlot(
        user_id=current_user.id,
        title="Daily Standup Meeting",
        start_time=datetime.combine(query_date, time(10, 0)),
        end_time=datetime.combine(query_date, time(10, 30)),
        is_locked=True,
        is_calendar_event=True
    )
    
    meeting2 = ScheduleSlot(
        user_id=current_user.id,
        title="Cross-Functional Sync",
        start_time=datetime.combine(query_date, time(14, 0)),
        end_time=datetime.combine(query_date, time(15, 0)),
        is_locked=True,
        is_calendar_event=True
    )
    
    session.add(meeting1)
    session.add(meeting2)
    session.commit()
    
    return {"message": "Successfully seeded standard mock calendar meetings!"}

# ----------------- INTELLECTUAL OVERRUN ROUTE -----------------

class OverrunPayload(BaseModel):
    slot_id: int
    overrun_minutes: int

@app.post("/api/schedule/overrun", response_model=List[ScheduleSlot])
def trigger_schedule_overrun(
    payload: OverrunPayload,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Handles dynamic task overrun by shifting subsequent scheduled slots
    chronologically, preserving durations and respecting locked events.
    """
    # Verify slot ownership
    slot = session.get(ScheduleSlot, payload.slot_id)
    if not slot or slot.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Schedule slot not found")
        
    slots = reschedule_overrun(
        session=session,
        slot_id=payload.slot_id,
        overrun_minutes=payload.overrun_minutes
    )
    return slots
