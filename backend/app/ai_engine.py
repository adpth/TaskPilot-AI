import os
from typing import List
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv(override=True)

# Define Pydantic models for structured output validation
class TaskStepDecomposition(BaseModel):
    title: str = Field(description="Short descriptive title of the sub-task or step.")
    duration_minutes: int = Field(description="Estimated duration for this specific step in minutes.")

class TaskDecomposition(BaseModel):
    title: str = Field(description="Short, action-oriented task title (e.g., 'Set Up Database Schema', 'Design Landing Page').")
    priority: str = Field(description="Priority of the task based on project criticality: 'high', 'medium', or 'low'.")
    estimated_duration: int = Field(description="Total estimated duration in minutes across all steps.")
    steps: List[TaskStepDecomposition] = Field(description="Chronological, sequential sub-steps to complete this task.")

class ProjectTasksResponse(BaseModel):
    tasks: List[TaskDecomposition] = Field(description="Complete list of tasks needed to finish the project.")

def get_genai_client():
    """Initializes the GenAI Client safely."""
    # Read the key dynamically to always reflect any hot-reloaded .env changes!
    key = os.getenv("GEMINI_API_KEY")
    if not key or key.strip() == "":
        return None
    try:
        return genai.Client(api_key=key)
    except Exception as e:
        print(f"Error initializing GenAI Client: {e}")
        return None

def generate_project_tasks(project_name: str, project_description: str = "") -> List[TaskDecomposition]:
    """
    Given a project name and optional description, uses Gemini to generate
    the complete set of tasks needed to finish the project.
    """
    client = get_genai_client()
    if not client:
        # Fallback mock tasks when no API key is present
        return _get_mock_project_tasks(project_name)
    
    system_instruction = (
        "You are a senior project manager and technical lead. "
        "Given a project name and description, decompose it into a comprehensive list of concrete, actionable tasks "
        "that a developer or team would need to complete to finish the project. "
        "Each task should have sequential sub-steps with realistic time estimates in minutes. "
        "Assign priorities ('high', 'medium', 'low') based on dependency order and criticality. "
        "Tasks that must be done first (setup, architecture) should be 'high' priority. "
        "Generate between 4-8 tasks for a typical project."
    )
    
    desc_part = f"\nDescription: {project_description}" if project_description else ""
    prompt = f"Project Name: {project_name}{desc_part}\n\nGenerate the complete task breakdown to finish this project."
    
    try:
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ProjectTasksResponse,
                system_instruction=system_instruction,
                temperature=0.3
            )
        )
        import json
        data = json.loads(response.text)
        return [TaskDecomposition(**task) for task in data.get("tasks", [])]
    except Exception as e:
        print(f"Error calling Gemini API: {e}")
        return _get_mock_project_tasks(project_name)


def _get_mock_project_tasks(project_name: str) -> List[TaskDecomposition]:
    """
    Returns intelligent mock tasks based on common project patterns.
    Ensures the app is fully functional without a Gemini API key.
    """
    return [
        TaskDecomposition(
            title="Project Setup & Architecture",
            priority="high",
            estimated_duration=45,
            steps=[
                TaskStepDecomposition(title="Initialize repository and project structure", duration_minutes=10),
                TaskStepDecomposition(title="Configure development environment and dependencies", duration_minutes=15),
                TaskStepDecomposition(title="Define core architecture and data models", duration_minutes=20),
            ]
        ),
        TaskDecomposition(
            title="Core Feature Implementation",
            priority="high",
            estimated_duration=90,
            steps=[
                TaskStepDecomposition(title="Implement primary business logic", duration_minutes=30),
                TaskStepDecomposition(title="Build data access layer and API endpoints", duration_minutes=30),
                TaskStepDecomposition(title="Create unit tests for core functionality", duration_minutes=30),
            ]
        ),
        TaskDecomposition(
            title="User Interface Development",
            priority="medium",
            estimated_duration=75,
            steps=[
                TaskStepDecomposition(title="Design wireframes and component hierarchy", duration_minutes=15),
                TaskStepDecomposition(title="Build responsive page layouts", duration_minutes=30),
                TaskStepDecomposition(title="Implement interactive features and state management", duration_minutes=30),
            ]
        ),
        TaskDecomposition(
            title="Integration & Testing",
            priority="medium",
            estimated_duration=60,
            steps=[
                TaskStepDecomposition(title="Connect frontend to backend APIs", duration_minutes=20),
                TaskStepDecomposition(title="Write integration and end-to-end tests", duration_minutes=20),
                TaskStepDecomposition(title="Fix bugs and polish edge cases", duration_minutes=20),
            ]
        ),
        TaskDecomposition(
            title="Documentation & Deployment",
            priority="low",
            estimated_duration=45,
            steps=[
                TaskStepDecomposition(title="Write README and API documentation", duration_minutes=15),
                TaskStepDecomposition(title="Configure CI/CD pipeline", duration_minutes=15),
                TaskStepDecomposition(title="Deploy to production and verify", duration_minutes=15),
            ]
        ),
    ]


# Keep legacy function for backward compatibility
def decompose_tasks_ai(raw_input: str) -> List[TaskDecomposition]:
    """Legacy: Decomposes natural language text into tasks. Now wraps generate_project_tasks."""
    return generate_project_tasks(raw_input)
