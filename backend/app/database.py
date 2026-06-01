import os
from dotenv import load_dotenv
from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy import text

# Load environment variables
load_dotenv(override=True)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./taskpilot.db")

# Parse Supabase / standard PostgreSQL connection URL corrections
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Configure SQLAlchemy connection pooling safeties
connect_args = {}
engine_args = {"echo": True}

if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False
else:
    # PostgreSQL production pool tuning safeguards (Supabase compatible)
    engine_args.update({
        "pool_size": 10,
        "max_overflow": 20,
        "pool_recycle": 3600,
        "pool_pre_ping": True  # Heartbeat ping to check connection health before using
    })

# Create engine
engine = create_engine(DATABASE_URL, connect_args=connect_args, **engine_args)


def create_db_and_tables():
    """Initializes the database and creates all tables."""
    SQLModel.metadata.create_all(engine)
    
    # Self-healing behavioral columns dynamic migrations
    behavioral_migrations = [
        ("task", "cognitive_cost", "VARCHAR DEFAULT 'medium'"),
        ("task", "ambiguity_score", "FLOAT DEFAULT 0.0"),
        ("task", "resistance_score", "FLOAT DEFAULT 0.0"),
        ("task", "procrastination_count", "INTEGER DEFAULT 0"),
        ("task", "difficulty_rating", "INTEGER"),
        ("task", "actual_duration", "INTEGER"),
        ("taskstep", "actual_duration", "INTEGER"),
        ("taskstep", "completed_at", "DATETIME"),
        ("user", "daily_focus_capacity", "INTEGER DEFAULT 240"),
        ("user", "average_focus_session", "INTEGER DEFAULT 25"),
        ("user", "feed_token", "VARCHAR"),
    ]


    for table, col, col_type in behavioral_migrations:
        try:
            with Session(engine) as session:
                session.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))
                session.commit()
        except Exception:
            pass

def get_session():
    """Dependency generator for database sessions."""
    with Session(engine) as session:
        yield session
