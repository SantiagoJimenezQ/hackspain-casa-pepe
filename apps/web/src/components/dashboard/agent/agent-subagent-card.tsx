"use client";

import { Bot, ChevronRight } from "lucide-react";
import { useState } from "react";
import { motion } from "motion/react";
import {
  Collapsible,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { AgentToolRow } from "@/components/dashboard/agent/agent-tool-row";
import { MotionCollapse } from "@/components/dashboard/agent/motion-collapse";
import { useMessage } from "@/components/dashboard/agent/use-message";
import { useI18n } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";
import type { AgentSubagent } from "@/lib/dashboard-types";

export function AgentSubagentCard({ subagent }: { subagent: AgentSubagent }) {
  const { t } = useI18n();
  const tKey = useMessage();
  const [open, setOpen] = useState(false);
  const headline = tKey(subagent.headlineKey);
  const reasoning = tKey(subagent.reasoningKey);
  const running = subagent.status === "running";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "rounded-lg border border-border/80 bg-background/70",
          running && "border-sky-400/20",
        )}
      >
        <CollapsibleTrigger className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Bot className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-medium text-foreground">
              {t("agent.subagent.label", { name: subagent.name })}
            </span>
          </span>
          <span
            className={cn(
              "max-w-[42%] truncate text-[11px] text-muted-foreground",
              running && "shimmer text-sky-600 dark:text-sky-400",
            )}
          >
            {headline}
          </span>
          <motion.span
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: 0.16 }}
            className="text-muted-foreground"
          >
            <ChevronRight className="size-3.5" />
          </motion.span>
        </CollapsibleTrigger>
        <MotionCollapse open={open}>
          <div className="border-t border-border/70 px-2.5 pt-2 pb-2.5">
            {reasoning ? (
              <p className="mb-2 px-1 text-[11.5px] leading-5 text-muted-foreground">
                {reasoning}
              </p>
            ) : null}
            <div className="space-y-0.5">
              {subagent.tools.map((tool) => (
                <AgentToolRow key={tool.id} tool={tool} />
              ))}
            </div>
          </div>
        </MotionCollapse>
      </div>
    </Collapsible>
  );
}
