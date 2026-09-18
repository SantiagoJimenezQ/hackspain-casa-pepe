"use client";

import { Check, Circle } from "lucide-react";
import { Panel } from "@/components/dashboard/panel";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { AgentStep } from "@/lib/dashboard-types";

export function AgentCard() {
  const { snapshot } = useDashboard();
  const { agent } = snapshot;
  const percent = Math.round((agent.completed / agent.total) * 100);

  return (
    <Panel className="min-h-0 flex-1 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="text-[13px] font-medium text-white">Agente IA</h2>
        <span className="text-[11px] text-emerald-300">
          Ejecutando {agent.completed}/{agent.total}
        </span>
      </div>
      <div className="mb-4 flex items-center gap-3">
        <span className="relative flex size-8 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-violet-500/20" />
          <span className="size-3 rounded-full bg-violet-400 shadow-[0_0_12px_#a78bfa]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-muted-foreground">{agent.progressLabel}</p>
          <Progress value={percent} className="mt-1 gap-0">
            <span className="sr-only">
              Progreso del agente {percent}%
            </span>
          </Progress>
        </div>
      </div>
      <blockquote className="rounded-lg bg-white/3 px-3 py-2 text-[12px] leading-5 text-muted-foreground italic">
        “{agent.quote}”
      </blockquote>
      <ol className="mt-4 space-y-2.5">
        {agent.steps.map((step) => (
          <AgentStepRow key={step.id} step={step} />
        ))}
      </ol>
    </Panel>
  );
}

function AgentStepRow({ step }: { step: AgentStep }) {
  return (
    <li className="flex items-center gap-2.5 text-[12px]">
      <StepIcon status={step.status} />
      <span
        className={cn(
          "flex-1",
          step.status === "pending" ? "text-muted-foreground" : "text-white",
        )}
      >
        {step.label}
      </span>
      <span
        className={cn(
          "text-[11px]",
          step.status === "running"
            ? "text-sky-400"
            : step.status === "pending"
              ? "text-muted-foreground"
              : "text-muted-foreground",
        )}
      >
        {step.status === "running"
          ? "En curso"
          : step.status === "pending"
            ? "Pendiente"
            : step.time}
      </span>
    </li>
  );
}

function StepIcon({ status }: { status: AgentStep["status"] }) {
  if (status === "done") {
    return (
      <span className="flex size-4 items-center justify-center rounded-full bg-emerald-400/15 text-status-up">
        <Check className="size-3" />
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="flex size-4 items-center justify-center rounded-full border border-sky-400/70">
        <span className="size-1.5 rounded-full bg-sky-400" />
      </span>
    );
  }
  return <Circle className="size-4 text-white/20" />;
}
