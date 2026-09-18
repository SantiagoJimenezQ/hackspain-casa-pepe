"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { motion } from "motion/react";
import {
  Collapsible,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { MotionCollapse } from "@/components/dashboard/agent/motion-collapse";
import {
  AgentStatusIcon,
  statusLabelClass,
} from "@/components/dashboard/agent/agent-status-icon";
import { useMessage } from "@/components/dashboard/agent/use-message";
import { cn } from "@/lib/utils";
import type { AgentToolCall } from "@/lib/dashboard-types";

export function AgentToolRow({ tool }: { tool: AgentToolCall }) {
  const tKey = useMessage();
  const [open, setOpen] = useState(false);
  const summary = tKey(tool.summaryKey);
  const detail = tKey(tool.detailKey);
  const trailing =
    tool.status === "running"
      ? summary
      : tool.status === "pending"
        ? ""
        : summary;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[12px] transition-colors hover:bg-muted/70",
          !detail && "cursor-default",
        )}
        disabled={!detail}
      >
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.16 }}
          className={cn(
            "flex size-4 shrink-0 items-center justify-center text-muted-foreground",
            !detail && "opacity-0",
          )}
        >
          <ChevronRight className="size-3.5" />
        </motion.span>
        <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-foreground">
          {tool.name}
        </code>
        <AgentStatusIcon status={tool.status} />
        {trailing ? (
          <span
            className={cn(
              "max-w-[46%] truncate text-[11px]",
              tool.status === "running" && "shimmer",
              statusLabelClass(tool.status),
            )}
          >
            {trailing}
          </span>
        ) : null}
        {tool.time ? (
          <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
            {tool.time}
          </span>
        ) : null}
      </CollapsibleTrigger>
      <MotionCollapse open={open}>
        {detail ? (
          <p className="pr-2 pb-2 pl-7 text-[11.5px] leading-5 text-muted-foreground">
            {detail}
          </p>
        ) : null}
      </MotionCollapse>
    </Collapsible>
  );
}
