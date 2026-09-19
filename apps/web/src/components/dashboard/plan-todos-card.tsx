"use client";

import { CheckCircleIcon, ChevronDownIcon, CircleIcon, Loader2, XCircleIcon } from "lucide-react";
import { useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useI18n } from "@/components/i18n/locale-provider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Plan } from "@/lib/casa-pepe-types";
import {
  planTodos,
  planTodosDefaultOpen,
  type PlanTodoVisualKind,
} from "@/lib/plan-todos";
import { cn } from "@/lib/utils";

function TodoIcon({ kind }: { kind: PlanTodoVisualKind }) {
  if (kind === "completed") {
    return <CheckCircleIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />;
  }
  if (kind === "running") {
    return <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground" />;
  }
  if (kind === "failed") {
    return <XCircleIcon className="mt-0.5 size-3.5 shrink-0 text-status-down" />;
  }
  return (
    <CircleIcon
      className={cn(
        "mt-0.5 size-3.5 shrink-0",
        kind === "awaiting" ? "text-muted-foreground" : "text-muted-foreground/70",
      )}
    />
  );
}

function todoTextClass(kind: PlanTodoVisualKind) {
  if (kind === "running") return "text-foreground";
  if (kind === "awaiting") return "text-foreground/80";
  if (kind === "failed") return "text-status-down";
  return "text-muted-foreground";
}

export function PlanTodosCard({
  plan,
  streaming = false,
  settled = false,
}: {
  plan: Plan;
  streaming?: boolean;
  /** The incident is closed, so nothing in the list is still in flight. */
  settled?: boolean;
}) {
  const { t } = useI18n();
  // Controlled on purpose: the computed default changes as the plan advances, and an
  // uncontrolled collapsible would ignore it after the first render.
  const shouldOpen = settled ? false : planTodosDefaultOpen(plan, streaming);
  const [open, setOpen] = useState(shouldOpen);
  const [lastShouldOpen, setLastShouldOpen] = useState(shouldOpen);
  if (lastShouldOpen !== shouldOpen) {
    setLastShouldOpen(shouldOpen);
    setOpen(shouldOpen);
  }
  const todos = planTodos(plan, settled);
  if (todos.total === 0) return null;

  const label = t(todos.allComplete ? "plan.todos.completed" : "plan.todos.progress", {
    completed: todos.completed,
    total: todos.total,
  });

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group not-prose w-full rounded-xl bg-background/70 ring-1 ring-foreground/10"
    >
      <CollapsibleTrigger
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        title={t("plan.todos.toggle")}
      >
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground/80 transition-transform -rotate-90 group-data-open:rotate-0" />
        {streaming ? (
          <Shimmer className="min-w-0 truncate text-[13px]">{label}</Shimmer>
        ) : (
          <span className="min-w-0 truncate">{label}</span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden outline-none transition-[height] duration-200 ease-out data-[starting-style]:h-0 data-[ending-style]:h-0">
        <ul className="flex flex-col gap-1 px-3 pb-2.5">
          {todos.items.map((item) => (
            <li
              key={item.identifier}
              aria-current={item.kind === "running" ? "step" : undefined}
              className={cn("flex items-start gap-2 py-0.5 text-[13px] leading-5", todoTextClass(item.kind))}
            >
              <TodoIcon kind={item.kind} />
              <span className="min-w-0">{item.title}</span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
