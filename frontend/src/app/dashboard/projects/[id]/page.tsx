"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "../../../components/AuthProvider";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  User,
  ChevronRight,
  Check,
  Clock,
  Trash2,
  Plus,
  AlertCircle,
  FolderKanban,
  Play,
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

interface Task {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  priority: "high" | "medium" | "low";
  total_duration: number;
  is_ai_generated: boolean;
  created_at: string;
  steps: TaskStep[];
}

interface ProjectDetail {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  task_count: number;
  total_steps: number;
  completed_steps: number;
  tasks: Task[];
}

interface ManualStepInput {
  title: string;
  duration_minutes: number;
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("medium");
  const [manualSteps, setManualSteps] = useState<ManualStepInput[]>([]);
  const [error, setError] = useState<string | null>(null);

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, [token]);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/projects/${id}`, { headers: headers() });
      if (res.ok) {
        setProject(await res.json());
      } else {
        setError("Project not found");
      }
    } catch {
      setError("Failed to load project");
    }
  }, [id, headers]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const handleToggleStep = async (stepId: number) => {
    try {
      const res = await fetch(`${API_BASE}/steps/${stepId}/toggle`, {
        method: "POST",
        headers: headers(),
      });
      if (res.ok) fetchProject();
    } catch {
      // Optimistic local toggle
      if (project) {
        setProject({
          ...project,
          tasks: project.tasks.map((t) => ({
            ...t,
            steps: t.steps.map((s) =>
              s.id === stepId ? { ...s, completed: !s.completed } : s
            ),
          })),
        });
      }
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: "DELETE",
        headers: headers(),
      });
      if (res.ok) fetchProject();
    } catch {}
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    // Filter empty steps and format estimates
    const parsedSteps = manualSteps
      .filter((s) => s.title.trim() !== "")
      .map((s) => ({
        title: s.title.trim(),
        duration_minutes: Number(s.duration_minutes) || 30,
      }));

    try {
      const res = await fetch(`${API_BASE}/projects/${id}/tasks`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          priority: newTaskPriority,
          steps: parsedSteps.length > 0 ? parsedSteps : undefined,
        }),
      });
      if (res.ok) {
        setNewTaskTitle("");
        setNewTaskPriority("medium");
        setManualSteps([]);
        setShowAddTask(false);
        fetchProject();
      }
    } catch {}
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case "high":
        return "bg-red-500/20 text-red-400 border border-red-500/30";
      case "medium":
        return "bg-amber-500/20 text-amber-400 border border-amber-500/30";
      case "low":
      default:
        return "bg-zinc-800 text-zinc-400 border border-zinc-700/50";
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 text-xs text-red-400 rounded-xl">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white font-semibold transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
        </Link>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col gap-8 animate-pulse">
        {/* Title block Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800/40 pb-6">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div className="h-3.5 w-32 bg-zinc-800/40 rounded-md animate-pulse" />
            <div className="flex items-center gap-2 mt-1">
              <div className="h-6 w-6 bg-zinc-800/60 rounded-lg shrink-0 animate-pulse" />
              <div className="h-6 w-48 bg-zinc-800/80 rounded-md animate-pulse" />
            </div>
            <div className="h-3 w-80 bg-zinc-800/30 rounded-md mt-1 animate-pulse" />
          </div>
          <div className="h-9 w-36 bg-zinc-800/60 rounded-xl shrink-0 animate-pulse" />
        </div>

        {/* Progress Card Skeleton */}
        <div className="p-5 rounded-2xl glass-panel flex flex-col gap-3.5 border border-zinc-800/65 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="h-3.5 w-28 bg-zinc-800/60 rounded-md animate-pulse" />
            <div className="h-4 w-10 bg-zinc-800/80 rounded-md animate-pulse" />
          </div>
          <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-800/20">
            <div className="h-full w-1/4 bg-zinc-800/40 rounded-full" />
          </div>
          <div className="flex items-center gap-6">
            <div className="h-3 w-16 bg-zinc-800/30 rounded-md animate-pulse" />
            <div className="h-3 w-28 bg-zinc-800/30 rounded-md animate-pulse" />
          </div>
        </div>

        {/* Tasks Checklist Grid Skeletons */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 px-1">
            <div className="h-4.5 w-24 bg-zinc-800/60 rounded-md animate-pulse" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="p-4 rounded-xl glass-card flex items-center justify-between gap-3 animate-pulse"
            >
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="h-4 w-4 bg-zinc-800/40 rounded-md shrink-0" />
                <div className="h-3.5 w-1/3 bg-zinc-800/60 rounded-md" />
                <div className="h-4 w-12 bg-zinc-800/30 rounded-md shrink-0 ml-2" />
                <div className="h-4 w-14 bg-zinc-800/35 rounded-md shrink-0" />
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="h-3 w-10 bg-zinc-800/30 rounded-md" />
                <div className="h-3 w-6 bg-zinc-800/30 rounded-md" />
                <div className="h-6 w-6 bg-zinc-800/50 rounded-md" />
                <div className="h-6 w-6 bg-zinc-800/50 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const progress =
    project.total_steps > 0
      ? Math.round((project.completed_steps / project.total_steps) * 100)
      : 0;

  const aiTasks = project.tasks.filter((t) => t.is_ai_generated);
  const manualTasks = project.tasks.filter((t) => !t.is_ai_generated);

  return (
    <div className="flex flex-col gap-8">
      {/* Title block */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800/40 pb-6"
      >
        <div className="min-w-0">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white font-semibold transition-colors mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2 truncate">
            <FolderKanban className="h-6 w-6 text-zinc-400 shrink-0" />
            {project.name}
          </h1>
          {project.description && (
            <p className="text-xs text-zinc-500 mt-1 max-w-xl truncate">
              {project.description}
            </p>
          )}
        </div>

        <button
          onClick={() => {
            setNewTaskTitle("");
            setNewTaskPriority("medium");
            setManualSteps([]);
            setShowAddTask(!showAddTask);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-zinc-200 text-xs font-bold text-black transition-all shadow-md shrink-0 sm:self-end"
        >
          <Plus className="h-3.5 w-3.5" /> Add Custom Task
        </button>
      </motion.div>

      {/* Progress Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="p-5 rounded-2xl glass-panel flex flex-col gap-3.5"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-300">Project Completion</span>
          <span className="text-sm font-bold text-white font-mono">{progress}%</span>
        </div>
        <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-800/20">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="h-full bg-white rounded-full"
          />
        </div>
        <div className="flex items-center gap-6 text-[11px] text-zinc-500 font-mono">
          <span>{project.task_count} tasks</span>
          <span>
            {project.completed_steps}/{project.total_steps} steps completed
          </span>
        </div>
      </motion.div>

      {/* Add Task Form (Vertical Interactive Builder) */}
      <AnimatePresence>
        {showAddTask && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <form
              onSubmit={handleAddTask}
              className="p-6 rounded-2xl glass-panel flex flex-col gap-5 w-full border border-zinc-800/80"
            >
              {/* Task Title & Priority Inputs */}
              <div className="flex flex-col sm:flex-row items-start gap-4 w-full">
                <div className="flex-1 w-full">
                  <label className="text-xs font-semibold text-zinc-300 mb-1.5 block">
                    Task Title
                  </label>
                  <input
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="e.g., Add payment integration"
                    className="glass-input w-full"
                    autoFocus
                  />
                </div>
                <div className="w-full sm:w-40">
                  <label className="text-xs font-semibold text-zinc-300 mb-1.5 block">
                    Priority
                  </label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value)}
                    className="glass-input w-full"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              {/* Sub-steps Checklist Builder */}
              <div className="flex flex-col gap-3.5 border-t border-zinc-800/60 pt-4 mt-1 w-full">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-400">Sub-steps (Optional)</span>
                  <button
                    type="button"
                    onClick={() => setManualSteps([...manualSteps, { title: "", duration_minutes: 30 }])}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-[10px] font-semibold text-zinc-300 hover:text-white transition-all"
                  >
                    <Plus className="h-3 w-3" /> Add Step
                  </button>
                </div>

                <div className="flex flex-col gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {manualSteps.length === 0 ? (
                    <p className="text-[10px] text-zinc-600 italic py-1 font-mono">
                      No custom sub-steps added yet. Tasks without sub-steps will schedule as a single block.
                    </p>
                  ) : (
                    manualSteps.map((step, idx) => (
                      <div key={idx} className="flex items-center gap-3 w-full animate-fadeIn">
                        <div className="flex-grow">
                          <input
                            value={step.title}
                            onChange={(e) => {
                              const copy = [...manualSteps];
                              copy[idx].title = e.target.value;
                              setManualSteps(copy);
                            }}
                            placeholder={`e.g., Step ${idx + 1}`}
                            className="glass-input text-xs w-full"
                          />
                        </div>
                        <div className="w-24 shrink-0">
                          <div className="relative flex items-center">
                            <input
                              type="number"
                              value={step.duration_minutes}
                              onChange={(e) => {
                                const copy = [...manualSteps];
                                copy[idx].duration_minutes = Math.max(1, Number(e.target.value) || 0);
                                setManualSteps(copy);
                              }}
                              className="glass-input text-xs w-full pr-6 font-mono text-center"
                              min="1"
                            />
                            <span className="absolute right-2 text-[9px] font-mono text-zinc-500 pointer-events-none">
                              m
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setManualSteps(manualSteps.filter((_, i) => i !== idx));
                          }}
                          className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-all shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="flex justify-end gap-2 border-t border-zinc-800/60 pt-4 w-full">
                <button
                  type="button"
                  onClick={() => {
                    setNewTaskTitle("");
                    setNewTaskPriority("medium");
                    setManualSteps([]);
                    setShowAddTask(false);
                  }}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 border border-zinc-800 hover:border-zinc-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTaskTitle.trim()}
                  className="px-4 py-1.5 rounded-lg bg-white hover:bg-zinc-200 text-xs font-bold text-black disabled:opacity-50 transition-all shadow-md animate-pulse"
                >
                  Create Task
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI-Generated Tasks */}
      {aiTasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex flex-col gap-3"
        >
          <div className="flex items-center gap-2 px-1">
            <Sparkles className="h-4 w-4 text-zinc-400" />
            <h2 className="text-sm font-bold text-white">AI-Generated Tasks</h2>
            <span className="text-[10px] text-zinc-500 font-mono ml-1">({aiTasks.length})</span>
          </div>
          {aiTasks.map((task, idx) => (
            <TaskCard
              key={task.id}
              task={task}
              idx={idx}
              expanded={expandedTask === task.id}
              onToggleExpand={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
              onToggleStep={handleToggleStep}
              onDelete={handleDeleteTask}
              getPriorityColor={getPriorityColor}
            />
          ))}
        </motion.div>
      )}

      {/* Manual Tasks */}
      {manualTasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="flex flex-col gap-3"
        >
          <div className="flex items-center gap-2 px-1">
            <User className="h-4 w-4 text-zinc-400" />
            <h2 className="text-sm font-bold text-white">Your Tasks</h2>
            <span className="text-[10px] text-zinc-500 font-mono ml-1">({manualTasks.length})</span>
          </div>
          {manualTasks.map((task, idx) => (
            <TaskCard
              key={task.id}
              task={task}
              idx={idx}
              expanded={expandedTask === task.id}
              onToggleExpand={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
              onToggleStep={handleToggleStep}
              onDelete={handleDeleteTask}
              getPriorityColor={getPriorityColor}
            />
          ))}
        </motion.div>
      )}

      {project.tasks.length === 0 && (
        <div className="flex flex-col items-center justify-center p-16 rounded-2xl glass-card text-zinc-500 gap-2">
          <Sparkles className="h-8 w-8 text-zinc-600" />
          <p className="text-sm">No tasks in this project yet</p>
        </div>
      )}
    </div>
  );
}

/* ─── Task Card Sub-Component ─── */

function TaskCard({
  task,
  idx,
  expanded,
  onToggleExpand,
  onToggleStep,
  onDelete,
  getPriorityColor,
}: {
  task: Task;
  idx: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleStep: (stepId: number) => void;
  onDelete: (taskId: number) => void;
  getPriorityColor: (p: string) => string;
}) {
  const completedCount = task.steps.filter((s) => s.completed).length;
  const allDone = task.steps.length > 0 && completedCount === task.steps.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: idx * 0.04 }}
      className={`p-4 rounded-xl glass-card flex flex-col gap-3 ${allDone ? "opacity-60" : ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div
          className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
          onClick={onToggleExpand}
        >
          <ChevronRight
            className={`h-4 w-4 text-zinc-500 transition-transform shrink-0 ${
              expanded ? "rotate-90" : ""
            }`}
          />
          <h4
            className={`text-sm font-bold truncate transition-colors ${
              allDone ? "text-zinc-500 line-through" : "text-white hover:text-zinc-300"
            }`}
          >
            {task.title}
          </h4>
          {task.is_ai_generated ? (
            <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-md font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
              ✨ AI
            </span>
          ) : (
            <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-md font-mono bg-zinc-900 text-zinc-400 border border-zinc-800">
              👤 Manual
            </span>
          )}
          <span
            className={`shrink-0 text-[10px] px-2 py-0.5 rounded-md font-mono ${getPriorityColor(
              task.priority
            )}`}
          >
            {task.priority}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[10px] text-zinc-400 font-mono flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {task.total_duration}m
          </span>
          <span className="text-[10px] text-zinc-500 font-mono">
            {completedCount}/{task.steps.length}
          </span>
          <Link
            href={`/dashboard/focus/${task.id}`}
            className="p-1 rounded-md border border-zinc-800 text-zinc-400 hover:text-emerald-400 bg-zinc-950 flex items-center justify-center transition-all"
            title="Start Focus Session"
          >
            <Play className="h-3 w-3 fill-current" />
          </Link>
          <button
            onClick={() => onDelete(task.id)}
            className="p-1 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/5 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Steps */}
      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="pl-6 border-l border-zinc-800 flex flex-col gap-2.5 mt-1"
        >
          <span className="text-[10px] text-zinc-400 font-semibold tracking-wider uppercase font-mono">
            Steps
          </span>
          {task.steps.length === 0 ? (
            <p className="text-[11px] text-zinc-600 italic">No sub-steps defined</p>
          ) : (
            task.steps.map((step) => (
              <div key={step.id} className="flex items-center justify-between text-xs gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onToggleStep(step.id)}
                    className={`h-4.5 w-4.5 rounded-md border flex items-center justify-center transition-all ${
                      step.completed
                        ? "bg-zinc-200 border-zinc-300 text-black shadow-md"
                        : "border-zinc-700 hover:border-zinc-500 bg-zinc-900"
                    }`}
                  >
                    {step.completed && <Check className="h-3 w-3" />}
                  </button>
                  <span
                    className={`text-zinc-300 ${step.completed ? "line-through text-zinc-500" : ""}`}
                  >
                    {step.title}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-zinc-500">{step.duration_minutes}m</span>
              </div>
            ))
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
