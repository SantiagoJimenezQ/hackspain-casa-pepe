"use client";

import { AudioLines } from "lucide-react";
import { motion } from "motion/react";
import { useMessage } from "@/components/dashboard/agent/use-message";
import { cn } from "@/lib/utils";

export function AgentReasoning({
  textKey,
  running,
}: {
  textKey: string;
  running: boolean;
}) {
  const tKey = useMessage();

  return (
    <motion.div
      layout
      className="flex gap-2.5 rounded-xl bg-muted/70 px-3 py-2.5"
    >
      <AudioLines className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p
        className={cn(
          "text-[12.5px] leading-5 text-muted-foreground",
          running && "shimmer",
        )}
      >
        {tKey(textKey)}
      </p>
    </motion.div>
  );
}
