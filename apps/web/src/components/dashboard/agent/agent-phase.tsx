"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  Collapsible,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { AgentStatusIcon, statusLabelClass } from "@/components/dashboard/agent/agent-status-icon";
import { AgentSubagentCard } from "@/components/dashboard/agent/agent-subagent-card";
import { AgentToolRow } from "@/components/dashboard/agent/agent-tool-row";
import { MotionCollapse } from "@/components/dashboard/agent/motion-collapse";
import { useI18n } from "@/components/i18n/locale-provider";
import { agentPhaseKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { AgentPhase } from "@/lib/dashboard-types";

export function AgentPhaseRow({ phase }: { phase: AgentPhase }) {
  const { t } = useI18n();
  const hasBody = Boolean(phase.tools?.length || phase.subagents?.length);
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? (hasBody && phase.status !== "pending");

  const trailing =
    phase.status === "running"
      ? t("agent.step.running")
      : phase.status === "pending"
        ? t("agent.step.pending")
        : phase.time;

  return (
    <Collapsible open={open} onOpenChange={setUserOpen} disabled={!hasBody}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md py-1.5 text-left",
          hasBody && "hover:bg-muted/40",
        )}
      >
        <AgentStatusIcon status={phase.status} />
        <span
          className={cn(
            "min-w-0 flex-1 text-[13px]",
            phase.status === "pending" ? "text-muted-foreground" : "text-foreground",
            phase.status === "running" && "shimmer",
          )}
        >
          {t(agentPhaseKey(phase.id))}
        </span>
        <span className={cn("text-[11px] tabular-nums", statusLabelClass(phase.status))}>
          {trailing}
        </span>
      </CollapsibleTrigger>
      <MotionCollapse open={open}>
        <div className="mt-1 mb-2 ml-[7px] border-l border-border/80 pl-4">
          {phase.tools?.length ? (
            <div className="space-y-0.5">
              {phase.tools.map((tool) => (
                <AgentToolRow key={tool.id} tool={tool} />
              ))}
            </div>
          ) : null}
          {phase.subagents?.length ? (
            <motion.div layout className="space-y-2 py-1">
              {phase.subagents.map((subagent) => (
                <AgentSubagentCard key={subagent.id} subagent={subagent} />
              ))}
            </motion.div>
          ) : null}
        </div>
      </MotionCollapse>
    </Collapsible>
  );
}
