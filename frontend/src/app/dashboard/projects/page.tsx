"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../../components/AuthProvider";
import CreateProjectModal from "../../components/CreateProjectModal";
import Link from "next/link";
import {
  FolderKanban,
  Plus,
  Sparkles,
  Clock,
  CheckCircle2,
  ArrowRight,
  Trash2,
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

export default function ProjectsPage() {
  const { token } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const headers = (): Record<string, string> => {
    const h: Record<string, string> = {};
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  };

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/projects`, { headers: headers() });
      if (res.ok) setProjects(await res.json());
    } catch {}
    finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await fetch(`${API_BASE}/projects/${id}`, {
        method: "DELETE",
        headers: headers(),
      });
      if (res.ok) setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {}
  };

  const getProgressPercent = (p: ProjectSummary) =>
    p.total_steps > 0 ? Math.round((p.completed_steps / p.total_steps) * 100) : 0;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Projects</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Create a project and let AI generate the task breakdown
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white hover:bg-zinc-200 text-sm font-semibold text-black transition-all"
        >
          <Plus className="h-4 w-4" />
          New Project
        </button>
      </motion.div>

      {/* Projects Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="p-5 rounded-2xl glass-card flex flex-col gap-4 animate-pulse"
            >
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="flex items-center gap-3 w-3/4">
                  <div className="p-2.5 rounded-lg bg-zinc-800/40 h-8 w-8" />
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="h-3.5 w-full bg-zinc-800/60 rounded-md" />
                    <div className="h-2.5 w-2/3 bg-zinc-800/30 rounded-md" />
                  </div>
                </div>
              </div>

              {/* Progress Bar Track Skeleton */}
              <div className="flex flex-col gap-2 my-1">
                <div className="flex justify-between">
                  <div className="h-2.5 w-12 bg-zinc-800/40 rounded-md" />
                  <div className="h-2.5 w-8 bg-zinc-800/40 rounded-md" />
                </div>
                <div className="h-1.5 rounded-full bg-zinc-800/60" />
              </div>

              {/* Stats Row Skeleton */}
              <div className="flex items-center justify-between gap-4 mt-1 border-t border-zinc-900/60 pt-3">
                <div className="h-3 w-16 bg-zinc-800/30 rounded-md" />
                <div className="h-3 w-16 bg-zinc-800/30 rounded-md" />
                <div className="h-3 w-12 bg-zinc-800/30 rounded-md ml-auto" />
              </div>
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center p-20 rounded-2xl glass-card text-zinc-500 gap-4"
        >
          <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
            <FolderKanban className="h-10 w-10 text-zinc-500" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-zinc-400">No projects yet</p>
            <p className="text-xs text-zinc-600 mt-1">
              Create your first project and AI will generate a task plan
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-white hover:bg-zinc-200 text-xs font-semibold text-black transition-all mt-2"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Create First Project
          </button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project, idx) => {
            const progress = getProgressPercent(project);
            return (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
              >
                <Link
                  href={`/dashboard/projects/${project.id}`}
                  className="block p-5 rounded-2xl glass-card group cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-zinc-800/50 text-zinc-300 shrink-0">
                        <FolderKanban className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white truncate group-hover:text-zinc-300 transition-colors">
                          {project.name}
                        </h3>
                        {project.description && (
                          <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                            {project.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(project.id, e)}
                      className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/5 transition-all opacity-0 group-hover:opacity-100 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-zinc-500 font-mono">Progress</span>
                      <span className="text-[10px] text-zinc-400 font-mono font-semibold">
                        {progress}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-800/80 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-zinc-400 transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="flex items-center gap-4 text-[10px] text-zinc-500 font-mono">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500/60" />
                      {project.completed_steps}/{project.total_steps} steps
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-zinc-600" />
                      {project.task_count} tasks
                    </span>
                    <span className="ml-auto">{formatDate(project.created_at)}</span>
                  </div>

                  <div className="flex justify-end mt-3">
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-700 group-hover:text-zinc-400 transition-colors" />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}

      <CreateProjectModal open={showModal} onClose={() => { setShowModal(false); fetchProjects(); }} />
    </div>
  );
}
