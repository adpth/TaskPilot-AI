import os
from typing import List, Optional
from pydantic import BaseModel, Field
from google.genai import types
from app.ai_engine import get_genai_client

# structured response schemas
class TaskFrictionAudit(BaseModel):
    cognitive_cost: str = Field(description="Cognitive cost or energy level required: 'high' (deep work focus), 'medium' (standard work), or 'low' (shallow admin/emails).")
    ambiguity_score: float = Field(description="Ambiguity score from 0.0 (perfectly clear, well-defined) to 1.0 (highly vague and abstract, prone to procrastination).")
    resistance_score: float = Field(description="Estimated behavioral resistance score from 0.0 (immediate action) to 1.0 (severe friction and dread).")
    difficulty_rating: int = Field(description="Estimated task complexity level from 1 (very simple) to 5 (extremely complex/demanding).")
    micro_start_steps: List[str] = Field(description="If ambiguity or resistance is high, generate 2-3 highly concrete, 10-minute starter micro-steps to defeat procrastination.")

class WorkloadRealismAudit(BaseModel):
    total_duration_minutes: int = Field(description="Sum of estimated durations of all tasks.")
    deep_work_minutes: int = Field(description="Total minutes of 'high' cognitive cost tasks.")
    realism_score: float = Field(description="Overall workload realism score from 0.0 (impossible/burnout) to 1.0 (fully balanced and healthy).")
    is_overload_risk: bool = Field(description="True if the plan exceeds realistic daily cognitive capabilities.")
    audit_recommendation: str = Field(description="Actionable, encouraging AI advice on how to optimize focus, balance energy, or defer low-priority items.")


def audit_task_friction(title: str, description: Optional[str] = "") -> TaskFrictionAudit:
    """
    Leverages Gemini Structured Outputs to analyze a task's title and description,
    returning cognitive cost, ambiguity, difficulty, and starter micro-steps to defeat friction.
    """
    client = get_genai_client()
    if not client:
        # Graceful sandbox fallback
        has_vague_title = len(title) < 12 or any(word in title.lower() for word in ["work", "do", "task", "stuff", "build"])
        ambiguity = 0.85 if has_vague_title else 0.25
        steps = []
        if ambiguity > 0.5:
            steps = [
                f"Define the specific scope of '{title}' on a single sticky note.",
                "Set a timer for 10 minutes and list the first 3 sub-tasks.",
                "Complete the easiest step first to build immediate momentum."
            ]
        return TaskFrictionAudit(
            cognitive_cost="high" if "code" in title.lower() or "build" in title.lower() else "medium",
            ambiguity_score=ambiguity,
            resistance_score=0.7 if ambiguity > 0.5 else 0.2,
            difficulty_rating=3,
            micro_start_steps=steps
        )

    system_instruction = (
        "You are an expert behavioral scientist, industrial psychologist, and deep-work performance coach. "
        "Evaluate the provided task. Estimate its cognitive cost ('high' for complex deep work, 'medium' for standard tasks, "
        "'low' for shallow administrative work), estimate its ambiguity score from 0.0 (well-defined) to 1.0 (vague/abstract), "
        "and its behavioral resistance (procrastination trigger) from 0.0 to 1.0. "
        "If ambiguity or resistance is high, generate 2-3 highly specific, concrete starter micro-steps lasting under 10 minutes "
        "designed to lower the hurdle rate and build psychological momentum."
    )

    prompt = f"Task Title: {title}\nDescription: {description or 'None'}"

    try:
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=TaskFrictionAudit,
                system_instruction=system_instruction,
                temperature=0.2
            )
        )
        import json
        data = json.loads(response.text)
        return TaskFrictionAudit(**data)
    except Exception as e:
        print(f"Error auditing task friction: {e}")
        return TaskFrictionAudit(
            cognitive_cost="medium",
            ambiguity_score=0.5,
            resistance_score=0.4,
            difficulty_rating=3,
            micro_start_steps=[]
        )


def audit_workload_realism(tasks: List[dict], daily_capacity_minutes: int = 240) -> WorkloadRealismAudit:
    """
    Analyzes the daily task schedule payload and returns an occupational workload realism audit
    identifying focus limits and burnout risks.
    """
    client = get_genai_client()
    
    total_dur = sum(t.get("total_duration", 0) for t in tasks)
    deep_dur = sum(t.get("total_duration", 0) for t in tasks if t.get("cognitive_cost") == "high")
    
    if not client:
        # Sandbox fallback
        is_overload = total_dur > 480 or deep_dur > daily_capacity_minutes
        realism = 0.95 if not is_overload else 0.35
        rec = "Daily workload looks balanced and healthy! Maintain high-focus periods followed by brief mental buffers."
        if is_overload:
            rec = "Workload Alert: You have scheduled excessive deep work or total hours today. High-energy cognitive work is limited to ~4 hours daily. Defer or reschedule non-critical tasks to protect your focus window."
        return WorkloadRealismAudit(
            total_duration_minutes=total_dur,
            deep_work_minutes=deep_dur,
            realism_score=realism,
            is_overload_risk=is_overload,
            audit_recommendation=rec
        )

    system_instruction = (
        "You are an expert occupational therapist, workload consultant, and performance psychologist. "
        "Analyze the user's daily task load. Total work should stay under 480 minutes (8 hours), and highly demanding deep work "
        "(cognitive_cost='high') should not exceed the daily capacity limit (default 240 minutes / 4 hours) to avoid exhaustion. "
        "Judge overall realism (0.0 to 1.0). If they are at risk of overload, identify specific bottleneck tasks, "
        "and provide highly practical, encouraging coaching advice recommending what to delay, slice, or simplify."
    )

    tasks_summary = "\n".join([
        f"- {t.get('title')} ({t.get('total_duration')} mins, Cognitive Cost: {t.get('cognitive_cost') or 'medium'})"
        for t in tasks
    ])
    prompt = f"User Daily Focus Capacity: {daily_capacity_minutes} minutes\nPlanned Tasks:\n{tasks_summary}"

    try:
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=WorkloadRealismAudit,
                system_instruction=system_instruction,
                temperature=0.2
            )
        )
        import json
        data = json.loads(response.text)
        return WorkloadRealismAudit(**data)
    except Exception as e:
        print(f"Error auditing workload realism: {e}")
        return WorkloadRealismAudit(
            total_duration_minutes=total_dur,
            deep_work_minutes=deep_dur,
            realism_score=0.8,
            is_overload_risk=False,
            audit_recommendation="Workload looks standard. Stay focused and protect your rest windows!"
        )


class TaskUnblockResponse(BaseModel):
    unblock_steps: List[str] = Field(description="2-3 highly concrete, 10-minute micro-subtasks that bypass the user's specific blocker to resolve technical/mental inertia.")

def generate_unblock_steps(step_title: str, blocker: str) -> List[str]:
    """
    Leverages Gemini Structured Outputs to analyze a technical/mental blocker
    and returns 2-3 specific micro-steps to get the user moving.
    """
    client = get_genai_client()
    if not client:
        # Sandbox fallback
        return [
            f"Draft a tiny 1-line solution focusing purely on: '{blocker[:30]}...'",
            "Create a dummy mock or hardcoded output to bypass the blocker for now.",
            "Consult the official docs or query a search engine for 5 minutes."
        ]

    system_instruction = (
        "You are an elite software architect, technical mentor, and problem-solving coach. "
        "The user is stuck on a specific task step and has provided a description of their blocker. "
        "Identify the primary root cause of the blocker and generate 2-3 highly actionable, extremely small "
        "micro-subtasks (under 10 minutes each) that will directly unblock them or isolate the problem."
    )

    prompt = f"Active Step: {step_title}\nUser Blocker Description: {blocker}"

    try:
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=TaskUnblockResponse,
                system_instruction=system_instruction,
                temperature=0.2
            )
        )
        import json
        data = json.loads(response.text)
        return data.get("unblock_steps", [])
    except Exception as e:
        print(f"Error generating unblock steps: {e}")
        return [
            "Break down the problem into a single console print or log statement.",
            "Search stackoverflow or official docs for the primary error message."
        ]
