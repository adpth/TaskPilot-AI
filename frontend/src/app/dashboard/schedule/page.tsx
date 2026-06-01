"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "../../components/AuthProvider";
import LoadingOverlay from "../../components/LoadingOverlay";
import {
  Calendar,
  Clock,
  Lock,
  Unlock,
  RefreshCw,
  Play,
  AlertCircle,
  Download,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

interface ScheduleSlot {
  id: number;
  task_id?: number;
  title: string;
  start_time: string;
  end_time: string;
  is_locked: boolean;
  is_calendar_event: boolean;
}

export default function SchedulePage() {
  const { token, user } = useAuth();
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [showFeedModal, setShowFeedModal] = useState(false);
  const [feedToken, setFeedToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedManual, setCopiedManual] = useState(false);

  useEffect(() => {
    if (user?.email) {
      const generateFeedToken = async (email: string) => {
        try {
          const encoder = new TextEncoder();
          const data = encoder.encode(email.toLowerCase().trim());
          const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
          setFeedToken(hashHex.substring(0, 16));
        } catch (e) {
          console.error("Crypto error:", e);
        }
      };
      generateFeedToken(user.email);
    }
  }, [user]);

  const getSubscriptionUrl = (protocol: "webcal" | "http" = "webcal") => {
    let apiDomain = API_BASE.replace("http://", "").replace("https://", "");
    // Resolve macOS IPv6 loopback resolver bug by using 127.0.0.1 for local subscriptions
    if (apiDomain.startsWith("localhost")) {
      apiDomain = apiDomain.replace("localhost", "127.0.0.1");
    }
    
    const baseProto = API_BASE.startsWith("https") ? "https" : "http";
    const selectedProto = protocol === "webcal" ? (baseProto === "https" ? "webcals" : "webcal") : baseProto;
    
    return `${selectedProto}://${apiDomain}/users/${feedToken}/calendar.ics`;
  };

  useEffect(() => {
    fetchSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const headers = (): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  };

  const fetchSchedule = async () => {
    setInitialLoading(true);
    try {
      const res = await fetch(`${API_BASE}/schedule`, { headers: headers() });
      if (res.ok) setSchedule(await res.json());
    } catch {
      setError("Backend server seems offline.");
    } finally {
      setInitialLoading(false);
    }
  };

  const simulateLoading = async (messages: string[]) => {
    setLoading(true);
    for (const msg of messages) {
      setLoadingMessage(msg);
      await new Promise((r) => setTimeout(r, 800));
    }
  };

  const handleGenerateSchedule = async () => {
    await simulateLoading([
      "Retrieving calendar constraint slots...",
      "Running constraint satisfaction packing algorithm...",
      "Rendering daily timeline slots...",
    ]);
    try {
      const res = await fetch(`${API_BASE}/schedule/generate`, {
        method: "POST",
        headers: headers(),
      });
      if (res.ok) {
        const data = await res.json();
        setSchedule(data);
        setError(null);
      }
    } catch {
      const mockSlots: ScheduleSlot[] = [
        { id: 201, title: "Daily Standup Meeting", start_time: new Date(new Date().setHours(9, 0, 0)).toISOString(), end_time: new Date(new Date().setHours(9, 45, 0)).toISOString(), is_locked: true, is_calendar_event: true },
        { id: 202, title: "Complete TaskPilot AI Prototype: CORS integration", start_time: new Date(new Date().setHours(10, 0, 0)).toISOString(), end_time: new Date(new Date().setHours(11, 30, 0)).toISOString(), is_locked: false, is_calendar_event: false },
        { id: 203, title: "Database Migration & Schema Audit", start_time: new Date(new Date().setHours(13, 0, 0)).toISOString(), end_time: new Date(new Date().setHours(14, 0, 0)).toISOString(), is_locked: false, is_calendar_event: false },
        { id: 204, title: "Google Calendar API Integration Settings", start_time: new Date(new Date().setHours(15, 0, 0)).toISOString(), end_time: new Date(new Date().setHours(16, 30, 0)).toISOString(), is_locked: false, is_calendar_event: false },
      ];
      setSchedule(mockSlots);
    } finally {
      setLoading(false);
    }
  };

  const handleOverrun = async (slotId: number, minutes: number) => {
    await simulateLoading([
      "Detecting timeline delay...",
      "Recalculating subsequent tasks chronologically...",
      "Preserving locked slots & fixed sync buffers...",
    ]);
    try {
      const res = await fetch(`${API_BASE}/schedule/overrun`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ slot_id: slotId, overrun_minutes: minutes }),
      });
      if (res.ok) {
        await fetchSchedule();
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleToggleLock = async (slotId: number) => {
    try {
      const res = await fetch(`${API_BASE}/schedule/slot/${slotId}/toggle-lock`, {
        method: "POST",
        headers: headers(),
      });
      if (res.ok) fetchSchedule();
    } catch {
      setSchedule((prev) =>
        prev.map((s) => (s.id === slotId ? { ...s, is_locked: !s.is_locked } : s))
      );
    }
  };

  // Client-side iCalendar (.ics) export generator
  const handleDownloadICS = () => {
    if (schedule.length === 0) {
      setError("No scheduled tasks to export. Generate a schedule first!");
      return;
    }

    try {
      let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//TaskPilot AI//Schedule//EN\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\n";

      schedule.forEach((slot) => {
        const start = new Date(slot.start_time).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
        const end = new Date(slot.end_time).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
        const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

        icsContent += "BEGIN:VEVENT\n";
        icsContent += `UID:taskpilot-${slot.id}-${stamp}\n`;
        icsContent += `DTSTAMP:${stamp}\n`;
        icsContent += `DTSTART:${start}\n`;
        icsContent += `DTEND:${end}\n`;
        icsContent += `SUMMARY:${slot.title.replace(/[,;]/g, "\\$&")}\n`;
        icsContent += `DESCRIPTION:Estimated duration: ${Math.round(
          (new Date(slot.end_time).getTime() - new Date(slot.start_time).getTime()) / 60000
        )} minutes. Managed and scheduled dynamically by TaskPilot AI.\n`;
        icsContent += "END:VEVENT\n";
      });

      icsContent += "END:VCALENDAR";

      const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `taskpilot_schedule_${new Date().toISOString().split("T")[0]}.ics`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      const toast = document.createElement("div");
      toast.className = "fixed bottom-5 right-5 z-[100] px-4 py-3 bg-zinc-950 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2 shadow-2xl animate-bounce font-medium";
      toast.innerHTML = `<span class="h-2 w-2 rounded-full bg-emerald-400"></span> .ICS File Downloaded Successfully!`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    } catch (e: any) {
      setError(`Failed to export local calendar: ${e.message}`);
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-8">
      {/* Page Title + Actions */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Schedule <Sparkles className="h-5 w-5 text-zinc-400" />
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Optimal constraint-aware daily execution timeline
          </p>
        </div>

        {/* Action Controls Section */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Webcal Feed Subscription */}
          <button
            onClick={() => setShowFeedModal(true)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/80 text-xs font-semibold text-zinc-300 transition-all shadow-md"
          >
            <Sparkles className="h-3.5 w-3.5 text-zinc-400 animate-pulse" />
            Local Calendar Feed
          </button>

          {/* Export ICS */}
          <button
            onClick={handleDownloadICS}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/80 text-xs font-semibold text-zinc-300 transition-all"
          >
            <Download className="h-3.5 w-3.5 text-zinc-400" />
            Export .ICS
          </button>

          {/* Generate Schedule */}
          <button
            onClick={handleGenerateSchedule}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-xs font-bold text-black transition-all shadow-lg"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Generate Schedule
          </button>
        </div>
      </motion.div>

      {/* Error Boundary Notice */}
      {error && (
        <div className="flex items-center gap-2 p-3 px-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* COMPREHENSIVE SEQUENTIAL LIST VIEW & FOCUS TIMELINE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
        {/* Left Column: Sequential Slots list */}
        <div className="lg:col-span-7 flex flex-col gap-3.5">
          {initialLoading ? (
            <div className="flex flex-col gap-3 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="p-4 rounded-xl flex items-center justify-between gap-4 border border-zinc-800 bg-zinc-900/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-zinc-800/40 h-8.5 w-8.5" />
                    <div className="flex flex-col gap-2">
                      <div className="h-3.5 w-48 bg-zinc-800/60 rounded-md" />
                      <div className="h-2.5 w-24 bg-zinc-800/30 rounded-md" />
                    </div>
                  </div>
                  <div className="h-7 w-20 bg-zinc-800/40 rounded-lg ml-auto" />
                </div>
              ))}
            </div>
          ) : schedule.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center p-16 rounded-2xl glass-panel text-zinc-500 gap-3 border border-zinc-850"
            >
              <Calendar className="h-10 w-10 text-zinc-600 animate-pulse" />
              <p className="text-sm font-medium">Timeline empty. Generate a schedule to organize your daily flow!</p>
              <button
                onClick={handleGenerateSchedule}
                className="px-4 py-1.5 rounded-lg bg-white text-black font-bold text-xs hover:bg-zinc-200 transition-all shadow-md"
              >
                Generate Now
              </button>
            </motion.div>
          ) : (
            schedule.map((slot, idx) => (
              <motion.div
                key={slot.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.04 }}
                className={`p-4 rounded-xl flex items-center justify-between gap-4 border transition-all ${
                  slot.is_calendar_event
                    ? "bg-zinc-900/40 border-zinc-800 text-zinc-300"
                    : "bg-zinc-850/15 border-zinc-800/80 hover:border-zinc-700/80 text-zinc-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-lg ${
                      slot.is_calendar_event ? "bg-zinc-800 text-zinc-400" : "bg-zinc-800/50 text-zinc-300"
                    }`}
                  >
                    {slot.is_calendar_event ? (
                      <Clock className="h-4 w-4" />
                    ) : (
                      <Play className="h-3.5 w-3.5 text-white fill-current animate-pulse" />
                    )}
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-white leading-tight">{slot.title}</h5>
                    <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1 mt-0.5">
                      <Clock className="h-3 w-3" />
                      {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!slot.is_calendar_event && (
                    <div className="flex items-center gap-1.5 bg-zinc-950/80 border border-zinc-900 p-1 rounded-lg">
                      <span className="text-[9px] font-mono font-bold text-zinc-500 px-1">delay:</span>
                      <button
                        onClick={() => handleOverrun(slot.id, 15)}
                        className="px-1.5 py-0.5 rounded-md text-[10px] bg-zinc-900 text-zinc-400 hover:text-white transition-all font-mono border border-zinc-800"
                      >
                        +15m
                      </button>
                      <button
                        onClick={() => handleOverrun(slot.id, 30)}
                        className="px-1.5 py-0.5 rounded-md text-[10px] bg-zinc-900 text-zinc-400 hover:text-white transition-all font-mono border border-zinc-800"
                      >
                        +30m
                      </button>
                    </div>
                  )}
                  {!slot.is_calendar_event && slot.task_id && (
                    <Link
                      href={`/dashboard/focus/${slot.task_id}`}
                      className="p-1.5 rounded-md border border-zinc-800 text-zinc-400 hover:text-emerald-400 bg-zinc-950 flex items-center justify-center transition-all shadow-sm"
                      title="Start Focus Session"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </Link>
                  )}
                  <button
                    onClick={() => handleToggleLock(slot.id)}
                    className={`p-1.5 rounded-md border ${
                      slot.is_locked
                        ? "bg-zinc-200 border-zinc-300 text-black shadow-md"
                        : "border-zinc-800 text-zinc-500 hover:text-zinc-300 bg-zinc-900/60"
                    } transition-all`}
                  >
                    {slot.is_locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* Right Column: Focus Timeline (Sidebar) */}
        <div className="lg:col-span-5 lg:sticky lg:top-8">
          <div className="p-6 rounded-2xl glass-panel flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-850 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-zinc-400" />
                <h3 className="text-sm font-bold text-white">Focus Timeline</h3>
              </div>
              <span className="text-[10px] bg-zinc-900 text-zinc-400 border border-zinc-850 px-2 py-0.5 rounded-md font-mono font-semibold">
                Today
              </span>
            </div>

            <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-1">
              {initialLoading ? (
                <div className="flex flex-col gap-3.5 animate-pulse">
                  {Array.from({ length: 5 }).map((_, idx) => {
                    const hour = idx + 9;
                    const ampm = hour >= 12 ? "PM" : "AM";
                    const displayHour = hour > 12 ? hour - 12 : hour;
                    const timeLabel = `${displayHour}:00 ${ampm}`;
                    return (
                      <div key={idx} className="flex gap-4 relative">
                        <span className="text-[10px] text-zinc-500 font-mono w-14 shrink-0 text-right py-0.5">
                          {timeLabel}
                        </span>
                        <div className="flex flex-col items-center">
                          <div className="h-2 w-2 rounded-full border border-zinc-800 bg-zinc-950" />
                          <div className="w-[1px] h-full bg-zinc-850 flex-grow" />
                        </div>
                        <div className="flex-grow pb-4">
                          <div className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-900/20 flex flex-col gap-2">
                            <div className="h-3 w-32 bg-zinc-800/60 rounded-md" />
                            <div className="h-2 w-16 bg-zinc-850 rounded-md" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                Array.from({ length: 9 }).map((_, idx) => {
                  const hour = idx + 9;
                  const ampm = hour >= 12 ? "PM" : "AM";
                  const displayHour = hour > 12 ? hour - 12 : hour;
                  const timeLabel = `${displayHour}:00 ${ampm}`;

                  const matchedSlots = schedule.filter((s) => {
                    const sHour = new Date(s.start_time).getHours();
                    return sHour === hour;
                  });

                  return (
                    <div key={idx} className="flex gap-4 relative group">
                      <span className="text-[10px] text-zinc-500 font-mono w-14 shrink-0 text-right py-0.5">
                        {timeLabel}
                      </span>
                      <div className="flex flex-col items-center">
                        <div className="h-2 w-2 rounded-full border border-zinc-800 bg-zinc-950 group-hover:border-zinc-500 transition-colors" />
                        <div className="w-[1px] h-full bg-zinc-850 flex-grow" />
                      </div>
                      <div className="flex-grow flex flex-col gap-1.5 pb-4">
                        {matchedSlots.length === 0 ? (
                          <div className="text-[10px] text-zinc-650 font-mono italic py-0.5 select-none">
                            Free Slot
                          </div>
                        ) : (
                          matchedSlots.map((slot) => (
                            <div
                              key={slot.id}
                              className={`p-2.5 rounded-lg border text-xs flex flex-col gap-1.5 group/sidebar-card relative ${
                                slot.is_calendar_event
                                  ? "bg-zinc-900/60 border-zinc-800 text-zinc-400"
                                  : "bg-zinc-850/30 border-zinc-700/50 text-zinc-200 hover:border-zinc-650 transition-all duration-300"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <span className="font-bold text-white text-[11px] leading-tight truncate max-w-[160px] block" title={slot.title}>
                                    {slot.title}
                                  </span>
                                  <span className="text-[9px] text-zinc-500 font-mono flex items-center gap-1">
                                    <Clock className="h-2.5 w-2.5 shrink-0" />
                                    {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                                  </span>
                                </div>

                                {/* Interactive controls */}
                                {!slot.is_calendar_event && (
                                  <div className="flex items-center gap-1 opacity-0 group-hover/sidebar-card:opacity-100 transition-opacity duration-200 shrink-0">
                                    {slot.task_id && (
                                      <Link
                                        href={`/dashboard/focus/${slot.task_id}`}
                                        className="p-1 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:text-emerald-400 text-zinc-400 transition-all"
                                        title="Start Focus"
                                      >
                                        <Play className="h-2.5 w-2.5 fill-current" />
                                      </Link>
                                    )}
                                    <button
                                      onClick={() => handleToggleLock(slot.id)}
                                      className={`p-1 rounded border transition-all cursor-pointer ${
                                        slot.is_locked
                                          ? "bg-zinc-200 border-zinc-300 text-black shadow-md"
                                          : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-300"
                                      }`}
                                      title={slot.is_locked ? "Unlock Slot" : "Lock Slot"}
                                    >
                                      {slot.is_locked ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Delay action bar for tasks */}
                              {!slot.is_calendar_event && (
                                <div className="flex items-center gap-1 mt-0.5 pt-1.5 border-t border-zinc-850 opacity-0 group-hover/sidebar-card:opacity-100 transition-opacity duration-200">
                                  <span className="text-[8px] font-mono font-bold text-zinc-500 mr-1 uppercase">delay:</span>
                                  <button
                                    onClick={() => handleOverrun(slot.id, 15)}
                                    className="px-1.5 py-0.5 rounded text-[9px] bg-zinc-900 hover:bg-zinc-800 hover:text-white text-zinc-450 transition-all font-mono border border-zinc-800 cursor-pointer"
                                  >
                                    +15m
                                  </button>
                                  <button
                                    onClick={() => handleOverrun(slot.id, 30)}
                                    className="px-1.5 py-0.5 rounded text-[9px] bg-zinc-900 hover:bg-zinc-800 hover:text-white text-zinc-450 transition-all font-mono border border-zinc-800 cursor-pointer"
                                  >
                                    +30m
                                  </button>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Webcal Dynamic Feed Subscription Modal */}
      <AnimatePresence>
        {showFeedModal && feedToken && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4"
          >
            <div className="p-6 rounded-2xl glass-panel max-w-md w-full flex flex-col gap-4 shadow-2xl border border-zinc-800/80">
              <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4.5 w-4.5 text-zinc-400 animate-pulse" />
                  <h3 className="text-sm font-bold text-white">Local Calendar Subscription Feed</h3>
                </div>
                <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded font-mono font-semibold uppercase text-emerald-400">
                  Auto-Sync Active
                </span>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed font-medium">
                Subscribe to your dynamic TaskPilot AI schedule directly inside your native calendar (Apple Calendar, Microsoft Outlook, or Notion Calendar). 
                Any scheduling shifts or completed tasks will sync automatically in the background every 15 minutes.
              </p>

              <div className="flex flex-col gap-3 mt-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider font-mono">
                    1-Click Native Subscription (webcal)
                  </label>
                  <div className="flex items-center gap-2 bg-zinc-950/80 border border-zinc-900 p-2.5 rounded-xl">
                    <input
                      type="text"
                      value={getSubscriptionUrl("webcal")}
                      readOnly
                      className="flex-1 bg-transparent text-[10px] font-mono text-zinc-400 select-all border-none outline-none focus:ring-0"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(getSubscriptionUrl("webcal"));
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-[10px] text-zinc-300 hover:text-white transition-all shrink-0 font-semibold"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider font-mono">
                    Manual Subscription Link (http/https)
                  </label>
                  <div className="flex items-center gap-2 bg-zinc-950/80 border border-zinc-900 p-2.5 rounded-xl">
                    <input
                      type="text"
                      value={getSubscriptionUrl("http")}
                      readOnly
                      className="flex-1 bg-transparent text-[10px] font-mono text-zinc-400 select-all border-none outline-none focus:ring-0"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(getSubscriptionUrl("http"));
                        setCopiedManual(true);
                        setTimeout(() => setCopiedManual(false), 2000);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-[10px] text-zinc-300 hover:text-white transition-all shrink-0 font-semibold"
                    >
                      {copiedManual ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-zinc-800/60 pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setShowFeedModal(false)}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 border border-zinc-800 hover:border-zinc-700 transition-all"
                >
                  Close
                </button>
                <a
                  href={getSubscriptionUrl("webcal")}
                  onClick={() => setShowFeedModal(false)}
                  className="px-4 py-1.5 rounded-lg bg-white hover:bg-zinc-200 text-xs font-bold text-black transition-all shadow-md shrink-0 flex items-center justify-center font-semibold"
                >
                  Subscribe Natively
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <LoadingOverlay visible={loading} message={loadingMessage} />
    </div>
  );
}
