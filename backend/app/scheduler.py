from datetime import datetime, date, time, timedelta
from typing import List, Tuple, Optional
from sqlmodel import Session, select
from app.models import Task, TaskStep, ScheduleSlot, Project, User

def compute_free_windows(
    workday_start: datetime,
    workday_end: datetime,
    busy_slots: List[Tuple[datetime, datetime]]
) -> List[Tuple[datetime, datetime]]:
    """
    Computes available free time windows between workday_start and workday_end
    given a list of sorted, non-overlapping busy datetime slots.
    """
    free_windows = []
    current_time = workday_start
    
    for start, end in busy_slots:
        if start > current_time:
            # We found a free window before the meeting start
            free_windows.append((current_time, min(start, workday_end)))
        # Advance the pointer
        current_time = max(current_time, min(end, workday_end))
        if current_time >= workday_end:
            break
            
    if current_time < workday_end:
        free_windows.append((current_time, workday_end))
        
    return free_windows

def schedule_day(
    session: Session,
    user_id: Optional[int],
    target_date: date,
    start_hour: int = 9,
    end_hour: int = 18
) -> List[ScheduleSlot]:
    """
    Optimal multi-day task scheduler. Places tasks sequentially day-by-day,
    respecting priorities, project context-grouping, and the user's focus capacity.
    """
    # 1. Establish initial bounds
    workday_start_target = datetime.combine(target_date, time(start_hour, 0))
    
    # 2. Fetch and delete existing dynamic slots from target_date onwards for a clean-sheet multi-day run
    stmt_to_delete = select(ScheduleSlot).where(
        ScheduleSlot.is_locked == False,
        ScheduleSlot.is_calendar_event == False,
        ScheduleSlot.start_time >= workday_start_target
    )
    if user_id is not None:
        stmt_to_delete = stmt_to_delete.where(ScheduleSlot.user_id == user_id)
    else:
        stmt_to_delete = stmt_to_delete.where(ScheduleSlot.user_id == None)
        
    slots_to_delete = session.exec(stmt_to_delete).all()
    for s in slots_to_delete:
        session.delete(s)
    session.commit()
    
    # 3. Retrieve user focus capacity (default 240 minutes of cognitive focus daily)
    daily_focus_capacity = 240
    if user_id is not None:
        user = session.get(User, user_id)
        if user and user.daily_focus_capacity:
            daily_focus_capacity = user.daily_focus_capacity
            
    # 4. Fetch all projects for this user to schedule sequentially
    proj_stmt = select(Project)
    if user_id is not None:
        proj_stmt = proj_stmt.where(Project.user_id == user_id)
    else:
        proj_stmt = proj_stmt.where(Project.user_id == None)
    projects = session.exec(proj_stmt).all()
    
    # Sort projects based on the highest task priority they contain (highest first, then oldest first)
    priority_map = {"high": 3, "medium": 2, "low": 1}
    
    def get_project_max_priority(p: Project) -> int:
        uncompleted_tasks = [t for t in p.tasks if any(not s.completed for s in t.steps) or not t.steps]
        if not uncompleted_tasks:
            return 0
        return max(priority_map.get(t.priority, 1) for t in uncompleted_tasks)
        
    projects_sorted = sorted(
        projects,
        key=lambda p: (-get_project_max_priority(p), p.created_at or datetime.min)
    )
    
    # 5. Build flat sequential queue of all uncompleted steps across projects
    steps_queue = []
    priority_order = {"high": 1, "medium": 2, "low": 3}
    
    for project in projects_sorted:
        project_tasks = sorted(
            [t for t in project.tasks if any(not s.completed for s in t.steps) or not t.steps],
            key=lambda t: (
                priority_order.get(t.priority, 2),
                -(t.created_at.timestamp() if t.created_at else 0)
            )
        )
        
        for task in project_tasks:
            steps = sorted(task.steps, key=lambda s: s.order)
            if not steps:
                from app.models import TaskStep
                steps = [TaskStep(title=task.title, duration_minutes=task.total_duration or 30, order=0)]
                
            for step in steps:
                if not step.completed:
                    steps_queue.append((task, step, step.duration_minutes))
                    
    # 6. Schedule day-by-day starting from target_date
    current_day = target_date
    new_slots = []
    max_days = 14  # Safety horizon to avoid infinite planning loops
    day_offset = 0
    
    while steps_queue and day_offset < max_days:
        workday_start = datetime.combine(current_day, time(start_hour, 0))
        workday_end = datetime.combine(current_day, time(end_hour, 0))
        
        # Retrieve existing busy slots (Locked slots or calendar sync events) for this day
        stmt = select(ScheduleSlot).where(
            ScheduleSlot.start_time >= workday_start,
            ScheduleSlot.end_time <= workday_end,
            (ScheduleSlot.is_locked == True) | (ScheduleSlot.is_calendar_event == True)
        )
        if user_id is not None:
            stmt = stmt.where(ScheduleSlot.user_id == user_id)
        else:
            stmt = stmt.where(ScheduleSlot.user_id == None)
            
        existing_busy_slots = session.exec(stmt).all()
        
        busy_intervals = [(slot.start_time, slot.end_time) for slot in existing_busy_slots]
        busy_intervals.sort(key=lambda x: x[0])
        merged_busy = []
        for interval in busy_intervals:
            if not merged_busy:
                merged_busy.append(interval)
            else:
                prev_start, prev_end = merged_busy[-1]
                curr_start, curr_end = interval
                if curr_start < prev_end:
                    merged_busy[-1] = (prev_start, max(prev_end, curr_end))
                else:
                    merged_busy.append(interval)
                    
        # Compute free windows for today
        free_windows = compute_free_windows(workday_start, workday_end, merged_busy)
        
        # If no free time windows today, move to the next day
        if not free_windows:
            current_day += timedelta(days=1)
            day_offset += 1
            continue
            
        # Pack queue tasks into today's free windows up to the daily focus capacity limit
        window_idx = 0
        current_win_start, current_win_end = free_windows[window_idx]
        current_pointer = current_win_start
        
        daily_focus_scheduled = 0
        scheduled_indices = []
        
        for i, (task, step, duration) in enumerate(steps_queue):
            # Limit check: if we exceed daily focus capacity, defer remaining to subsequent days
            # (Allows scheduling at least 1 task today if none has been scheduled, to avoid blocking large single tasks)
            if daily_focus_scheduled > 0 and (daily_focus_scheduled + duration) > daily_focus_capacity:
                break
                
            step_duration = timedelta(minutes=duration)
            fit_found = False
            
            while window_idx < len(free_windows):
                remaining_in_window = current_win_end - current_pointer
                
                if remaining_in_window >= step_duration:
                    # Fits today's window!
                    start_time = current_pointer
                    end_time = start_time + step_duration
                    
                    slot_title = f"{task.title}: {step.title}" if step.title != task.title else task.title
                    
                    slot = ScheduleSlot(
                        user_id=user_id,
                        task_id=task.id,
                        title=slot_title,
                        start_time=start_time,
                        end_time=end_time,
                        is_locked=False,
                        is_calendar_event=False
                    )
                    session.add(slot)
                    new_slots.append(slot)
                    
                    current_pointer = end_time
                    daily_focus_scheduled += duration
                    scheduled_indices.append(i)
                    fit_found = True
                    break
                else:
                    # Move to next window today
                    window_idx += 1
                    if window_idx < len(free_windows):
                        current_win_start, current_win_end = free_windows[window_idx]
                        current_pointer = current_win_start
                    else:
                        break
                        
            if window_idx >= len(free_windows):
                # No more time windows left today
                break
                
        # Remove today's scheduled tasks from the queue
        for idx in reversed(scheduled_indices):
            steps_queue.pop(idx)
            
        # Move scheduler date pointers to the next day
        current_day += timedelta(days=1)
        day_offset += 1
        
    session.commit()
    
    # Refresh all slots
    for slot in new_slots:
        session.refresh(slot)
        
    return new_slots


def reschedule_overrun(
    session: Session,
    slot_id: int,
    overrun_minutes: int,
    end_hour: int = 18
) -> List[ScheduleSlot]:
    """
    Intelligent Rescheduling: Shifts subsequent task slots dynamically in response
    to a delay in the current schedule slot, ensuring zero overlaps with busy meetings or locked slots.
    """
    # 1. Fetch the target slot that overran
    slot = session.get(ScheduleSlot, slot_id)
    if not slot:
        return []
        
    overrun_delta = timedelta(minutes=overrun_minutes)
    
    # Update end time of target slot
    slot.end_time += overrun_delta
    session.add(slot)
    session.flush() # Flush to update database record for querying
    
    # 2. Fetch all slots for this day after the target slot's start time
    day_start = datetime.combine(slot.start_time.date(), time(0, 0, 0))
    day_end = datetime.combine(slot.start_time.date(), time(23, 59, 59))
    
    stmt = select(ScheduleSlot).where(
        ScheduleSlot.user_id == slot.user_id,
        ScheduleSlot.start_time >= day_start,
        ScheduleSlot.end_time <= day_end
    ).order_by(ScheduleSlot.start_time.asc())
    
    all_slots = session.exec(stmt).all()
    
    # 3. Separate busy constraints and movable slots
    busy_intervals = []
    movable_slots = []
    
    # The target slot that overran is now a fixed constraint at its new position
    busy_intervals.append((slot.start_time, slot.end_time))
    
    for s in all_slots:
        if s.id == slot.id:
            continue
        if s.is_locked or s.is_calendar_event:
            busy_intervals.append((s.start_time, s.end_time))
        else:
            # Only shift slots that start after the target slot's start time
            if s.start_time >= slot.start_time:
                movable_slots.append(s)
                
    # Sort busy intervals and merge overlaps
    busy_intervals.sort(key=lambda x: x[0])
    merged_busy = []
    for interval in busy_intervals:
        if not merged_busy:
            merged_busy.append(interval)
        else:
            prev_start, prev_end = merged_busy[-1]
            curr_start, curr_end = interval
            if curr_start < prev_end:
                merged_busy[-1] = (prev_start, max(prev_end, curr_end))
            else:
                merged_busy.append(interval)
                
    # 4. Compute available free windows starting from the target slot's end time
    free_windows = compute_free_windows(slot.end_time, day_end, merged_busy)
    
    # 5. Pack the movable slots sequentially into these free windows
    shifted_slots = [slot]
    window_idx = 0
    
    if free_windows:
        current_win_start, current_win_end = free_windows[window_idx]
        current_pointer = current_win_start
        
        for movable in movable_slots:
            duration = movable.end_time - movable.start_time
            
            # Find a free window that fits this duration
            fit_found = False
            while window_idx < len(free_windows):
                remaining_in_window = current_win_end - current_pointer
                if remaining_in_window >= duration:
                    # Fits!
                    movable.start_time = current_pointer
                    movable.end_time = current_pointer + duration
                    session.add(movable)
                    shifted_slots.append(movable)
                    current_pointer = movable.end_time
                    fit_found = True
                    break
                else:
                    window_idx += 1
                    if window_idx < len(free_windows):
                        current_win_start, current_win_end = free_windows[window_idx]
                        current_pointer = current_win_start
                    else:
                        break
            
            if not fit_found:
                # Out of space for the day, delete to keep schedule clean and prevent overlap
                session.delete(movable)
                
    else:
        # No free windows left at all, delete subsequent flexible tasks
        for movable in movable_slots:
            session.delete(movable)
            
    session.commit()
    
    # Refresh all updated slots
    for s in shifted_slots:
        try:
            session.refresh(s)
        except Exception:
            # Slot might have been deleted, ignore
            pass
            
    return shifted_slots

