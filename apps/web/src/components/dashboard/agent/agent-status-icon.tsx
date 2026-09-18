"use client";

import { Check, Circle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { AgentStepStatus, ToolCallStatus } from "@/lib/dashboard-types";

export function AgentStatusIcon({
  status,
}: {
  status: AgentStepStatus | ToolCallStatus;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={status}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ duration: 0.16 }}
        className="flex size-4 items-center justify-center"
      >
        {status === "done" ? (
          <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500/15 text-status-up">
            <Check className="size-2.5" strokeWidth={2.6} />
          </span>
        ) : status === "running" ? (
          <span className="flex size-4 items-center justify-center rounded-full border border-sky-400/80">
            <span className="size-1.5 rounded-full bg-sky-400" />
          </span>
        ) : status === "failed" ? (
          <span className="size-4 rounded-full border border-status-down/70" />
        ) : (
          <Circle className="size-4 text-foreground/20" />
        )}
      </motion.span>
    </AnimatePresence>
  );
}

export function statusLabelClass(status: AgentStepStatus | ToolCallStatus) {
  return cn(
    status === "running" && "text-sky-600 dark:text-sky-400",
    status === "pending" && "text-muted-foreground",
    status === "done" && "text-muted-foreground",
    status === "failed" && "text-status-down",
  );
}
