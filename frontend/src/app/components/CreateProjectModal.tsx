"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { Sparkles, X, FolderPlus, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
}

export default function CreateProjectModal({ open, onClose }: CreateProjectModalProps) {
  const { token } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setError(null);
    setLoading(true);

    const messages = [
      "Analyzing project scope...",
      "Generating task breakdown via Gemini AI...",
      "Estimating timelines and priorities...",
      "Saving project structure...",
    ];
    for (const msg of messages) {
      setLoadingMessage(msg);
      await new Promise((r) => setTimeout(r, 700));
    }

    try {
      const res = await fetch(`${API_BASE}/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to create project");
      }

      const data = await res.json();
      setName("");
      setDescription("");
      onClose();
      router.push(`/dashboard/projects/${data.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="p-8 rounded-2xl glass-panel max-w-lg w-full flex flex-col gap-6"
          >
            {loading ? (
              /* Loading State */
              <div className="flex flex-col items-center text-center gap-5 py-6">
                <div className="relative">
                  <div className="h-16 w-16 rounded-full border-2 border-zinc-500 border-t-transparent animate-spin flex items-center justify-center">
                    <Sparkles className="h-6 w-6 text-zinc-300 animate-pulse" />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <h4 className="text-base font-bold text-white">Creating Project</h4>
                  <p className="text-xs text-zinc-400 font-mono">{loadingMessage}</p>
                </div>
                <p className="text-[10px] text-zinc-600 font-mono">
                  AI is generating tasks for &quot;{name}&quot;
                </p>
              </div>
            ) : (
              /* Form State */
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300">
                      <FolderPlus className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">New Project</h3>
                      <p className="text-[11px] text-zinc-500">AI will generate tasks to complete it</p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <form onSubmit={handleCreate} className="flex flex-col gap-5">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="project-name" className="text-xs font-semibold text-zinc-300">
                      Project Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="project-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Build E-commerce Website"
                      required
                      autoFocus
                      className="glass-input"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="project-desc" className="text-xs font-semibold text-zinc-300">
                      Description <span className="text-zinc-600">(optional)</span>
                    </label>
                    <textarea
                      id="project-desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief project scope, tech stack, goals..."
                      rows={3}
                      className="glass-input resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-1">
                    <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-zinc-400" />
                      Gemini AI will generate tasks
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!name.trim()}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white hover:bg-zinc-200 text-xs font-semibold text-black disabled:opacity-50 transition-all"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Create Project
                      </button>
                    </div>
                  </div>
                </form>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
