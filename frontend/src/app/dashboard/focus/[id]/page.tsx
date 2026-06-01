"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../components/AuthProvider";
import Link from "next/link";
import {
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
  ChevronRight,
  Flame,
  Check,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

interface TaskStep {
  id: number;
  task_id: number;
  title: string;
  duration_minutes: number;
  completed: boolean;
  order: number;
}

interface TaskDetail {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  priority: "high" | "medium" | "low";
  total_duration: number;
  is_ai_generated: boolean;
  steps: TaskStep[];
}

export default function FocusModePage() {
  const { id } = useParams();
  const { token } = useAuth();
  const router = useRouter();

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Focus Timer States
  const [isActive, setIsActive] = useState(false);
  const [isOverrun, setIsOverrun] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [overrunSeconds, setOverrunSeconds] = useState(0);
  const [initialSeconds, setInitialSeconds] = useState(0);

  // Blocker Overlay UI states
  const [showBlockerModal, setShowBlockerModal] = useState(false);
  const [activeStepForBlocker, setActiveStepForBlocker] = useState<TaskStep | null>(null);
  const [blockerText, setBlockerText] = useState("");
  const [unblockingLoading, setUnblockingLoading] = useState(false);

  // Session complete telemetry states
  const [showTelemetryModal, setShowTelemetryModal] = useState(false);
  const [difficultyRating, setDifficultyRating] = useState(3);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchTask(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Main dynamic timer ticking effect
  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => {
        if (!isOverrun) {
          setSecondsRemaining((prev) => {
            if (prev <= 1) {
              // Transition into overrun stopwatch mode
              setIsOverrun(true);
              return 0;
            }
            return prev - 1;
          });
        } else {
          setOverrunSeconds((prev) => prev + 1);
        }
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, isOverrun]);

  const headers = (): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  };

  const fetchTask = async (isInitial = false) => {
    try {
      const res = await fetch(`${API_BASE}/tasks/${id}`, { headers: headers() });
      if (res.ok) {
        const taskData = await res.json() as TaskDetail;
        setTask(taskData);
        if (isInitial) {
          const totalSecs = taskData.total_duration * 60;
          setSecondsRemaining(totalSecs);
          setInitialSeconds(totalSecs);
        }
        setError(null);
      } else {
        setError("This task was not found. Please verify the URL or try planning it first!");
      }
    } catch {
      setError("Failed to fetch task information. Check your internet connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStep = async (stepId: number) => {
    try {
      const res = await fetch(`${API_BASE}/steps/${stepId}/toggle`, {
        method: "POST",
        headers: headers(),
      });
      if (res.ok) {
        // Refresh local details
        if (task) {
          const updatedSteps = task.steps.map((s) =>
            s.id === stepId ? { ...s, completed: !s.completed } : s
          );
          setTask({ ...task, steps: updatedSteps });
        }
      }
    } catch {}
  };

  // Submit focus session telemetry back to database telemetry
  const handleSubmitTelemetry = async () => {
    if (!task) return;

    const estimatedDuration = task.total_duration;
    // Calculated total minutes spent on this focus session
    const actualDurationMinutes = Math.round(
      (initialSeconds - secondsRemaining + overrunSeconds) / 60
    );

    try {
      const res = await fetch(`${API_BASE}/tasks/${task.id}/focus-session`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify({
          actual_duration_minutes: Math.max(1, actualDurationMinutes),
          difficulty_rating: difficultyRating,
        }),
      });

      if (res.ok) {
        // Exit and go back to active schedule
        router.push("/dashboard/schedule");
      }
    } catch {
      router.push("/dashboard/schedule");
    }
  };

  // Submit blocker explanation to Gemini contextual unblocker endpoint
  const handleUnblockStep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !activeStepForBlocker || !blockerText.trim()) return;

    setUnblockingLoading(true);
    try {
      const res = await fetch(`${API_BASE}/tasks/${task.id}/steps/${activeStepForBlocker.id}/unblock`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ blocker_description: blockerText.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        // Refresh local task steps
        await fetchTask();
        setShowBlockerModal(false);
        setBlockerText("");
        setActiveStepForBlocker(null);
      }
    } catch {
      setError("Failed to unblock. Check server connection.");
    } finally {
      setUnblockingLoading(false);
    }
  };

  const formatTimerDigits = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    const padding = (val: number) => String(val).padStart(2, "0");
    if (hrs > 0) {
      return `${padding(hrs)}:${padding(mins)}:${padding(secs)}`;
    }
    return `${padding(mins)}:${padding(secs)}`;
  };

  // SVG Circular Dash Calculation
  const strokeRadius = 135;
  const strokeCircumference = 2 * Math.PI * strokeRadius;
  const strokeOffset = initialSeconds
    ? strokeCircumference - (secondsRemaining / initialSeconds) * strokeCircumference
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030014]">
        <div className="h-10 w-10 rounded-full border-2 border-white border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#030014] gap-5 p-4 text-center">
        <div className="flex items-center gap-2.5 p-3 px-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 max-w-sm">
          <AlertCircle className="h-4.5 w-4.5 shrink-0" />
          {error || "An unexpected error occurred while loading this focus session."}
        </div>
        <Link
          href="/dashboard/schedule"
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white font-semibold transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Schedule
        </Link>
      </div>
    );
  }

  const stepsDone = task.steps.filter((s) => s.completed).length;
  const progressRatio = task.steps.length > 0 ? stepsDone / task.steps.length : 0;

  return (
    <div className="fixed inset-0 bg-[#030014] text-zinc-200 z-50 overflow-y-auto flex flex-col items-center justify-center p-6 sm:p-12">
      {/* Immersive Breathing Cosmic Background Glow */}
      <div className="absolute top-[-20%] left-[-20%] w-[160%] h-[140%] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-800/10 via-[#030014] to-[#030014] -z-10 animate-pulse pointer-events-none" />

      {/* Main Focus Content layout */}
      <div className="max-w-4xl w-full flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-16 relative">
        {/* Left Section: Circular animated Timer block */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center"
        >
          <div className="relative h-[310px] w-[310px] flex items-center justify-center select-none">
            {/* Pulsing visual glow ring behind progress */}
            <div className={`absolute inset-6 rounded-full blur-3xl opacity-20 transition-all ${
              isActive ? (isOverrun ? "bg-red-500 animate-pulse" : "bg-white animate-pulse") : "bg-zinc-800"
            }`} />

            {/* SVG Progress Ring */}
            <svg className="absolute transform -rotate-90" width="310" height="310">
              {/* Grid Background Circle */}
              <circle
                className="text-zinc-900"
                strokeWidth="6"
                stroke="currentColor"
                fill="transparent"
                r={strokeRadius}
                cx="155"
                cy="155"
              />
              {/* Active Progress Circle */}
              <motion.circle
                className={`${isOverrun ? "text-red-500" : "text-white"}`}
                strokeWidth="7"
                strokeDasharray={strokeCircumference}
                strokeDashoffset={isOverrun ? 0 : strokeOffset}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
                r={strokeRadius}
                cx="155"
                cy="155"
                transition={{ duration: 0.4 }}
              />
            </svg>

            {/* Digital Timer Content */}
            <div className="flex flex-col items-center gap-1.5 z-10 text-center">
              {isOverrun ? (
                <>
                  <span className="text-[10px] tracking-wider uppercase font-mono font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Flame className="h-3 w-3 animate-bounce" /> Overrun
                  </span>
                  <span className="text-4xl font-extrabold font-mono text-red-500 tracking-tighter drop-shadow-md select-text">
                    +{formatTimerDigits(overrunSeconds)}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[9px] tracking-widest uppercase font-mono font-semibold text-zinc-500">
                    {isActive ? "Deep Focus" : "Focus Paused"}
                  </span>
                  <span className="text-4xl font-extrabold font-mono text-white tracking-tighter drop-shadow-md select-text">
                    {formatTimerDigits(secondsRemaining)}
                  </span>
                </>
              )}
              <span className="text-[10px] text-zinc-500 font-mono mt-1">
                est: {task.total_duration}m
              </span>
            </div>
          </div>

          {/* Action timer button group */}
          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={() => {
                setIsActive(false);
                setIsOverrun(false);
                setSecondsRemaining(initialSeconds);
                setOverrunSeconds(0);
              }}
              className="p-3 rounded-2xl bg-zinc-950 border border-zinc-900 text-zinc-500 hover:text-zinc-300 hover:border-zinc-800 transition-all shadow-md"
              title="Reset Session"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIsActive(!isActive)}
              className={`flex items-center gap-2 px-7 py-3 rounded-2xl font-bold text-sm shadow-xl transition-all ${
                isActive
                  ? "bg-zinc-800 border border-zinc-700 text-white hover:bg-zinc-700"
                  : "bg-white text-black hover:bg-zinc-200"
              }`}
            >
              {isActive ? (
                <>
                  <Pause className="h-4 w-4 fill-white" /> Pause
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-black" /> Start Flow
                </>
              )}
            </button>
            <button
              onClick={() => setShowTelemetryModal(true)}
              className="flex items-center justify-center p-3 rounded-2xl bg-zinc-950 border border-zinc-900 text-emerald-400 hover:text-emerald-300 hover:border-emerald-500/20 hover:bg-emerald-500/5 transition-all shadow-md"
              title="Complete Task"
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
          </div>
        </motion.div>

        {/* Right Section: Focus active task card + Sub-steps checklist */}
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex-grow w-full lg:max-w-md flex flex-col gap-6"
        >
          {/* Header Task Panel */}
          <div className="p-6 rounded-2xl glass-panel flex flex-col gap-3 relative overflow-hidden">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[9px] bg-zinc-900/60 border border-zinc-850 px-2 py-0.5 rounded text-zinc-400 font-mono tracking-wider uppercase">
                  Target Workpiece
                </span>
                <h2 className="text-lg font-extrabold text-white mt-1.5 leading-snug truncate">
                  {task.title}
                </h2>
              </div>
              <span className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-zinc-950 border border-zinc-850 text-zinc-400 font-mono tracking-wide uppercase">
                {task.priority} Priority
              </span>
            </div>

            {task.description && (
              <p className="text-xs text-zinc-400 font-medium leading-relaxed">
                {task.description}
              </p>
            )}

            {/* Task Completion Progress */}
            <div className="flex flex-col gap-2 mt-2 border-t border-zinc-850/60 pt-4">
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                <span>Task Steps Completed</span>
                <span>
                  {stepsDone}/{task.steps.length}
                </span>
              </div>
              <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-900">
                <div
                  style={{ width: `${progressRatio * 100}%` }}
                  className="h-full bg-white rounded-full transition-all duration-300"
                />
              </div>
            </div>
          </div>

          {/* Sub-steps focus checklist builder */}
          <div className="p-6 rounded-2xl glass-panel flex flex-col gap-4">
            <h3 className="text-xs font-bold text-zinc-400 font-mono uppercase tracking-wider">
              Focus Checklist
            </h3>

            <div className="flex flex-col gap-3.5 max-h-[300px] overflow-y-auto pr-1">
              {task.steps.length === 0 ? (
                <p className="text-xs text-zinc-500 italic py-2">
                  No sub-steps defined. Maintain focus and track your time!
                </p>
              ) : (
                task.steps.map((step) => {
                  const stepIsActive = !step.completed && !task.steps.find((s) => !s.completed && s.order < step.order);

                  return (
                    <div
                      key={step.id}
                      className={`flex items-center justify-between gap-3 text-xs p-3 rounded-xl border transition-all ${
                        step.completed
                          ? "bg-zinc-950/40 border-zinc-900/60 text-zinc-500 opacity-60"
                          : stepIsActive
                          ? "bg-zinc-850/40 border-zinc-700/80 text-white shadow-md shadow-zinc-950/20 scale-[1.01]"
                          : "bg-zinc-950/10 border-zinc-900/40 text-zinc-400"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button
                          onClick={() => handleToggleStep(step.id)}
                          className={`h-4.5 w-4.5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                            step.completed
                              ? "bg-zinc-200 border-zinc-300 text-black"
                              : "border-zinc-700 hover:border-zinc-500 bg-zinc-950"
                          }`}
                        >
                          {step.completed && <Check className="h-3 w-3" />}
                        </button>
                        <span className={`truncate font-medium ${step.completed ? "line-through" : ""}`}>
                          {step.title}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono text-zinc-500">
                          {step.duration_minutes}m
                        </span>

                        {stepIsActive && (
                          <button
                            onClick={() => {
                              setActiveStepForBlocker(step);
                              setShowBlockerModal(true);
                            }}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-950 hover:bg-zinc-800 border border-zinc-850 hover:border-zinc-700 text-[9px] text-zinc-400 hover:text-white transition-all font-semibold"
                          >
                            <HelpCircle className="h-2.5 w-2.5" /> Stuck?
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* AI Blocker Resolution "Are you stuck?" Modal Overlay */}
      <AnimatePresence>
        {showBlockerModal && activeStepForBlocker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4"
          >
            <div className="p-6 rounded-2xl glass-panel max-w-md w-full flex flex-col gap-4 shadow-2xl border border-zinc-800/80">
              <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4.5 w-4.5 text-zinc-400" />
                  <h3 className="text-sm font-bold text-white">AI Contextual Unblocker</h3>
                </div>
                <span className="text-[9px] bg-zinc-900 border border-zinc-850 px-2 py-0.5 rounded font-mono font-semibold uppercase text-zinc-400">
                  Step stuck
                </span>
              </div>

              <div className="flex flex-col gap-1.5 p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-900">
                <span className="text-[9px] text-zinc-500 font-mono tracking-wider uppercase">Active Step</span>
                <p className="text-xs font-bold text-white leading-relaxed">{activeStepForBlocker.title}</p>
              </div>

              <form onSubmit={handleUnblockStep} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-zinc-300">
                    What is blocking your progress?
                  </label>
                  <textarea
                    value={blockerText}
                    onChange={(e) => setBlockerText(e.target.value)}
                    placeholder="Describe the error, blocker, or mental hurdle (e.g., 'Webpack throws a CORS error' or 'I don't know where to initialize the engine')"
                    className="glass-input text-xs w-full min-h-[90px] resize-none"
                    required
                    autoFocus
                  />
                </div>

                <div className="flex justify-end gap-2 border-t border-zinc-800/40 pt-3.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowBlockerModal(false);
                      setBlockerText("");
                      setActiveStepForBlocker(null);
                    }}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 border border-zinc-800 hover:border-zinc-700 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={unblockingLoading || !blockerText.trim()}
                    className="px-4 py-1.5 rounded-lg bg-white hover:bg-zinc-200 text-xs font-bold text-black disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-md shrink-0"
                  >
                    {unblockingLoading ? (
                      <>
                        <div className="h-3 w-3 rounded-full border border-black border-t-transparent animate-spin" />
                        Unrolling...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5 shrink-0" />
                        Get AI Heuristics
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Post-Session Telemetry Assessment Modal Overlay */}
      <AnimatePresence>
        {showTelemetryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4"
          >
            <div className="p-6 rounded-2xl glass-panel max-w-sm w-full flex flex-col items-center text-center gap-5 shadow-2xl border border-zinc-800/80">
              <div className="flex flex-col items-center gap-1 select-none">
                <CheckCircle2 className="h-10 w-10 text-emerald-400 animate-pulse" />
                <h3 className="text-base font-extrabold text-white mt-3">Workpiece Complete!</h3>
                <p className="text-xs text-zinc-500 font-medium mt-1">Excellent focus work session. Let's record telemetry.</p>
              </div>

              {/* Difficulty Star Selector (1-5) */}
              <div className="flex flex-col gap-2.5 w-full items-center">
                <label className="text-xs font-semibold text-zinc-300">
                  How complex / high-friction was this task?
                </label>
                <div className="flex items-center gap-2 mt-1">
                  {[1, 2, 3, 4, 5].map((val) => (
                    <button
                      key={val}
                      onClick={() => setDifficultyRating(val)}
                      className={`h-9 w-9 rounded-xl border text-sm font-extrabold font-mono transition-all ${
                        difficultyRating === val
                          ? "bg-white border-zinc-200 text-black shadow-md"
                          : "border-zinc-800 text-zinc-400 bg-zinc-950/60 hover:text-white"
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between w-full px-5 text-[9px] text-zinc-500 mt-1 font-mono uppercase font-semibold">
                  <span>1 - Shallow/Admin</span>
                  <span>5 - Cognitively Brutal</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 border-t border-zinc-800/40 pt-4 mt-1.5 w-full">
                <button
                  type="button"
                  onClick={() => setShowTelemetryModal(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 border border-zinc-800 hover:border-zinc-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitTelemetry}
                  className="px-5 py-1.5 rounded-lg bg-white hover:bg-zinc-200 text-xs font-bold text-black transition-all shadow-md shrink-0"
                >
                  Log Telemetry & Exit
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
