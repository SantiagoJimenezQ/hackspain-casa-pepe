"use client";

import { motion } from "motion/react";
import { useMessage } from "@/components/dashboard/agent/use-message";
import { cn } from "@/lib/utils";
import type { AgentActivity } from "@/lib/dashboard-types";

export function AgentMessageBubble({
  item,
}: {
  item: Extract<AgentActivity, { type: "message" }>;
}) {
  const tKey = useMessage();
  const text = item.text ?? tKey(item.textKey);
  const operator = item.role === "operator";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn("flex", operator ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[90%] rounded-xl px-3 py-2 text-[12.5px] leading-5",
          operator
            ? "bg-primary text-primary-foreground"
            : "bg-muted/70 text-muted-foreground",
        )}
      >
        {text}
      </div>
    </motion.div>
  );
}
