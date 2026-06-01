"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../components/AuthProvider";
import CreateProjectModal from "../components/CreateProjectModal";
import Link from "next/link";
import {
  Sparkles,
  FolderKanban,
  CalendarClock,
  CheckCircle2,
  Clock,
  ArrowRight,
  Play,
  Briefcase,
  Plus,
} from "lucide-react";
import { motion } from "framer-motion";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

interface ProjectSummary {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  task_count: number;
  total_steps: number;
  completed_steps: number;
}

interface ScheduleSlot {
  id: number;
  task_id?: number;
  title: string;
  start_time: string;
  end_time: string;
  is_locked: boolean;
  is_calendar_event: boolean;
}

export default function DashboardOverview() {
  const { user, token } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [workloadAudit, setWorkloadAudit] = useState<{
    total_duration_minutes: number;
    deep_work_minutes: number;
    realism_score: number;
    is_overload_risk: boolean;
    audit_recommendation: string;
  } | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/projects`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setProjects(await res.json());
    } catch { }
  }, [token]);

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/schedule`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setSchedule(await res.json());
    } catch { }
  }, [token]);

  const fetchWorkloadAudit = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/schedule/workload-audit`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setWorkloadAudit(await res.json());
    } catch { }
  }, [token]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchProjects(),
          fetchSchedule(),
          fetchWorkloadAudit(),
        ]);
      } catch (err) {
        console.error("Error loading dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [fetchProjects, fetchSchedule, fetchWorkloadAudit]);

  const totalTasks = projects.reduce((acc, p) => acc + p.task_count, 0);
  const totalSteps = projects.reduce((acc, p) => acc + p.total_steps, 0);
  const completedSteps = projects.reduce((acc, p) => acc + p.completed_steps, 0);
  const scheduledMinutes = schedule.reduce((acc, s) => {
    const start = new Date(s.start_time).getTime();
    const end = new Date(s.end_time).getTime();
    return acc + (end - start) / 60000;
  }, 0);

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const now = new Date();
  const greeting =
    now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const stats = [
    {
      label: "Active Projects",
      value: projects.length,
      icon: FolderKanban,
      color: "text-zinc-300",
      bg: "bg-zinc-800/50 border-zinc-700/50",
    },
    {
      label: "Total Tasks",
      value: totalTasks,
      icon: CheckCircle2,
      color: "text-zinc-300",
      bg: "bg-zinc-800/50 border-zinc-700/50",
    },
    {
      label: "Steps Done",
      value: `${completedSteps}/${totalSteps}`,
      icon: Sparkles,
      color: "text-zinc-300",
      bg: "bg-zinc-800/50 border-zinc-700/50",
    },
    {
      label: "Scheduled Time",
      value: `${Math.round(scheduledMinutes)}m`,
      icon: Clock,
      color: "text-zinc-300",
      bg: "bg-zinc-800/50 border-zinc-700/50",
    },
  ];

  const getProgress = (p: ProjectSummary) =>
    p.total_steps > 0 ? Math.round((p.completed_steps / p.total_steps) * 100) : 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-row justify-between">
        {/* Welcome Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {greeting}, {user?.name?.split(" ")[0] || "there"}
          </h1>
          <p className="text-sm text-zinc-400 mt-1">{dateStr}</p>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="flex flex-wrap gap-3"
        >
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white hover:bg-zinc-200 text-sm font-semibold text-black transition-all"
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
          <Link
            href="/dashboard/schedule"
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-zinc-700 bg-zinc-900/50 hover:bg-zinc-800 text-sm font-semibold text-zinc-300 transition-all"
          >
            <CalendarClock className="h-4 w-4 text-zinc-400" />
            View Schedule
          </Link>
        </motion.div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="p-5 rounded-2xl glass-card flex flex-col gap-3 animate-pulse"
              >
                <div className="h-9 w-9 rounded-xl bg-zinc-800/40 border border-zinc-700/40" />
                <div className="flex flex-col gap-2 mt-1">
                  <div className="h-6 w-16 bg-zinc-800/60 rounded-md" />
                  <div className="h-3 w-24 bg-zinc-800/30 rounded-md" />
                </div>
              </div>
            ))
          : stats.map((stat, i) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.07 }}
                  className="p-5 rounded-2xl glass-card flex flex-col gap-3"
                >
                  <div
                    className={`h-9 w-9 rounded-xl border flex items-center justify-center ${stat.bg}`}
                  >
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">{stat.value}</p>
                    <p className="text-[11px] text-zinc-500 font-medium mt-0.5">{stat.label}</p>
                  </div>
                </motion.div>
              );
            })}
      </div>

      {/* Two-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Schedule Preview */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="p-6 rounded-2xl glass-panel flex flex-col gap-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-zinc-400" />
              <h3 className="text-sm font-bold text-white">Today&apos;s Schedule</h3>
            </div>
            <Link
              href="/dashboard/schedule"
              className="text-[11px] text-zinc-400 hover:text-white font-semibold flex items-center gap-1 transition-colors"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2.5 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="p-3 rounded-xl flex items-center gap-3 border border-zinc-800 bg-zinc-900/20"
                >
                  <div className="h-7 w-7 rounded-lg bg-zinc-805 h-7 w-7" />
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="h-3.5 w-1/2 bg-zinc-800/60 rounded-md" />
                    <div className="h-2.5 w-1/4 bg-zinc-800/30 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          ) : schedule.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-zinc-500 gap-2">
              <CalendarClock className="h-8 w-8 text-zinc-600" />
              <p className="text-xs">No scheduled slots yet</p>
              <Link
                href="/dashboard/schedule"
                className="text-xs text-zinc-400 hover:text-white font-semibold transition-colors"
              >
                Generate schedule →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {schedule.slice(0, 4).map((slot) => (
                <div
                  key={slot.id}
                  className={`p-3 rounded-xl flex items-center gap-3 border ${slot.is_calendar_event
                    ? "bg-zinc-900/40 border-zinc-800"
                    : "bg-zinc-800/20 border-zinc-700/30"
                    }`}
                >
                  <div
                    className={`p-1.5 rounded-lg ${slot.is_calendar_event
                      ? "bg-zinc-800 text-zinc-400"
                      : "bg-zinc-800/50 text-zinc-300"
                      }`}
                  >
                    {slot.is_calendar_event ? (
                      <Briefcase className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{slot.title}</p>
                    <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                      {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                    </p>
                  </div>
                </div>
              ))}
              {schedule.length > 4 && (
                <p className="text-[10px] text-zinc-500 text-center mt-1">
                  +{schedule.length - 4} more slots
                </p>
              )}
            </div>
          )}
        </motion.div>

        {/* Recent Projects Preview */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="p-6 rounded-2xl glass-panel flex flex-col gap-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-zinc-400" />
              <h3 className="text-sm font-bold text-white">Recent Projects</h3>
            </div>
            <Link
              href="/dashboard/projects"
              className="text-[11px] text-zinc-400 hover:text-white font-semibold flex items-center gap-1 transition-colors"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2.5 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="p-3 rounded-xl border border-zinc-800 bg-zinc-900/20 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 w-1/2">
                    <div className="h-7 w-7 rounded-lg bg-zinc-805 h-7 w-7 animate-pulse" />
                    <div className="h-3.5 w-full bg-zinc-800/60 rounded-md" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-1.5 rounded-full bg-zinc-800/40" />
                    <div className="h-3 w-6 bg-zinc-800/30 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-zinc-500 gap-2">
              <Sparkles className="h-8 w-8 text-zinc-600" />
              <p className="text-xs">No projects yet</p>
              <button
                onClick={() => setShowModal(true)}
                className="text-xs text-zinc-400 hover:text-white font-semibold transition-colors"
              >
                Create your first project →
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {projects.slice(0, 4).map((project) => (
                <Link
                  key={project.id}
                  href={`/dashboard/projects/${project.id}`}
                  className="p-3 rounded-xl glass-card flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-1.5 rounded-lg bg-zinc-800/50 text-zinc-300 shrink-0">
                      <FolderKanban className="h-3.5 w-3.5" />
                    </div>
                    <h4 className="text-xs font-semibold text-white truncate group-hover:text-zinc-300 transition-colors">
                      {project.name}
                    </h4>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-16 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-zinc-400 transition-all"
                        style={{ width: `${getProgress(project)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono w-8 text-right">
                      {getProgress(project)}%
                    </span>
                  </div>
                </Link>
              ))}
              {projects.length > 4 && (
                <p className="text-[10px] text-zinc-500 text-center mt-1">
                  +{projects.length - 4} more projects
                </p>
              )}
            </div>
          )}
        </motion.div>
      </div>

      <CreateProjectModal open={showModal} onClose={() => { setShowModal(false); fetchProjects(); }} />
    </div>
  );
}
