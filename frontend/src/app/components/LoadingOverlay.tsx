"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
}

export default function LoadingOverlay({ visible, message }: LoadingOverlayProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4"
        >
          <div className="p-8 rounded-2xl glass-panel max-w-sm w-full flex flex-col items-center text-center gap-5">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-white/10 glow-ambient" />
              <div className="h-14 w-14 rounded-full border-2 border-white border-t-transparent animate-spin flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-white animate-pulse" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <h4 className="text-sm font-bold text-white">Orchestrating Scheduler</h4>
              <p className="text-xs text-zinc-400 font-mono h-8">{message}</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
