import type { Plan, PlanStepStatus } from "@/lib/casa-pepe-types";

export type PlanTodoVisualKind =
  | "completed"
  | "running"
  | "failed"
  | "awaiting"
  | "pending";

export type PlanTodoItem = {
  identifier: string;
  title: string;
  kind: PlanTodoVisualKind;
};

export type PlanTodosView = {
  items: PlanTodoItem[];
  completed: number;
  total: number;
  allComplete: boolean;
};

export function planTodoKind(status: PlanStepStatus): PlanTodoVisualKind {
  if (status === "completed") return "completed";
  if (status === "running") return "running";
  if (status === "failed" || status === "rejected") return "failed";
  if (status === "awaiting-approval") return "awaiting";
  return "pending";
}

export function planTodos(plan: Pick<Plan, "steps">): PlanTodosView {
  const items = [...plan.steps]
    .sort((left, right) => left.order - right.order)
    .map((step) => ({
      identifier: step.identifier,
      title: step.title,
      kind: planTodoKind(step.status),
    }));
  const completed = items.filter((item) => item.kind === "completed").length;
  const total = items.length;
  return {
    items,
    completed,
    total,
    allComplete: total > 0 && completed === total,
  };
}

export function planTodosDefaultOpen(
  plan: Pick<Plan, "steps" | "version">,
  streaming: boolean,
): boolean {
  if (streaming) return true;
  if (plan.version <= 1) return true;
  return plan.steps.some(
    (step) => step.status === "running" || step.status === "awaiting-approval",
  );
}
