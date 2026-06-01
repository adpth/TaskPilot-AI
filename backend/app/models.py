from datetime import datetime
from typing import List, Optional
from sqlmodel import Field, Relationship, SQLModel
from sqlalchemy import Column, Integer, ForeignKey

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    name: Optional[str] = Field(default=None)
    hashed_password: Optional[str] = Field(default=None)
    feed_token: Optional[str] = Field(default=None, index=True)
    
    # Behavioral Capacity Settings
    daily_focus_capacity: int = Field(default=240)    # cognitive focus budget in minutes
    average_focus_session: int = Field(default=25)   # target Pomodoro/focus slot in minutes
    
    # Relationships
    projects: List["Project"] = Relationship(back_populates="user")
    schedule_slots: List["ScheduleSlot"] = Relationship(back_populates="user")


class Project(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=True))
    name: str
    description: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    user: Optional[User] = Relationship(back_populates="projects")
    tasks: List["Task"] = Relationship(back_populates="project", sa_relationship_kwargs={"cascade": "all, delete-orphan"})

class Task(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(sa_column=Column(Integer, ForeignKey("project.id", ondelete="CASCADE"), nullable=False))
    title: str
    description: Optional[str] = Field(default=None)
    priority: str = Field(default="medium")  # high, medium, low
    total_duration: int = Field(default=0)    # in minutes
    is_ai_generated: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Behavioral Analytics Telemetry
    cognitive_cost: str = Field(default="medium")       # high (deep focus), medium (standard), low (shallow admin)
    ambiguity_score: float = Field(default=0.0)         # 0.0 (perfectly clear) to 1.0 (highly vague)
    resistance_score: float = Field(default=0.0)        # 0.0 (no friction) to 1.0 (procrastination trigger)
    procrastination_count: int = Field(default=0)      # total times task has overrun/delayed
    difficulty_rating: Optional[int] = Field(default=None) # user assessed level from 1 to 5
    actual_duration: Optional[int] = Field(default=None)   # actual recorded focus time in minutes
    
    # Relationships
    project: Project = Relationship(back_populates="tasks")
    steps: List["TaskStep"] = Relationship(back_populates="task", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
    schedule_slots: List["ScheduleSlot"] = Relationship(back_populates="task")

class TaskStep(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    task_id: int = Field(sa_column=Column(Integer, ForeignKey("task.id", ondelete="CASCADE"), nullable=False))
    title: str
    duration_minutes: int
    completed: bool = Field(default=False)
    order: int = Field(default=0)
    
    # Behavioral Steps Telemetry
    actual_duration: Optional[int] = Field(default=None)   # actual minutes spent
    completed_at: Optional[datetime] = Field(default=None) # completion timestamp for velocity analytics
    
    # Relationships
    task: Task = Relationship(back_populates="steps")

class ScheduleSlot(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    task_id: Optional[int] = Field(default=None, sa_column=Column(Integer, ForeignKey("task.id", ondelete="SET NULL"), nullable=True))
    title: str
    start_time: datetime
    end_time: datetime
    is_locked: bool = Field(default=False)
    is_calendar_event: bool = Field(default=False)  # True if fixed non-schedule slot
    
    # Relationships
    user: Optional[User] = Relationship(back_populates="schedule_slots")
    task: Optional[Task] = Relationship(back_populates="schedule_slots")
