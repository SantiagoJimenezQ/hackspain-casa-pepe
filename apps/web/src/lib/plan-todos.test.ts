import { describe, expect, it } from "vitest";
import type { Plan, PlanStepStatus } from "@/lib/casa-pepe-types";
import { planTodoKind, planTodos, planTodosDefaultOpen } from "@/lib/plan-todos";

function step(
  identifier: string,
  order: number,
  status: PlanStepStatus,
  title = identifier,
): Plan["steps"][number] {
  return {
    identifier,
    order,
    title,
    reason: "",
    owner: { kind: "agent", name: "Casa Pepe agent" },
    serviceIdentifier: "events-stream",
    capacityUnits: 1,
    requiresApproval: false,
    status,
    statusReason: "",
    resultSummary: "",
    attempts: 0,
    updatedAt: "2026-09-19T10:00:00.000Z",
  };
}

describe("plan todos", () => {
  it("maps step statuses onto visual kinds", () => {
    expect(planTodoKind("completed")).toBe("completed");
    expect(planTodoKind("running")).toBe("running");
    expect(planTodoKind("failed")).toBe("failed");
    expect(planTodoKind("rejected")).toBe("failed");
    expect(planTodoKind("awaiting-approval")).toBe("awaiting");
    expect(planTodoKind("proposed")).toBe("pending");
    expect(planTodoKind("approved")).toBe("pending");
    expect(planTodoKind("cancelled")).toBe("pending");
    expect(planTodoKind("postponed")).toBe("pending");
  });

  it("orders steps and counts only completed ones as done", () => {
    const view = planTodos({
      steps: [
        step("later", 3, "proposed", "Verify"),
        step("done", 1, "completed", "Prepare"),
        step("now", 2, "running", "Recover"),
        step("parked", 4, "postponed", "Postpone"),
      ],
    });

    expect(view.items.map((item) => item.title)).toEqual([
      "Prepare",
      "Recover",
      "Verify",
      "Postpone",
    ]);
    expect(view.items.map((item) => item.kind)).toEqual([
      "completed",
      "running",
      "pending",
      "pending",
    ]);
    expect(view.completed).toBe(1);
    expect(view.total).toBe(4);
    expect(view.allComplete).toBe(false);
  });

  it("treats a fully finished list as complete", () => {
    const view = planTodos({
      steps: [step("a", 1, "completed"), step("b", 2, "completed")],
    });
    expect(view.completed).toBe(2);
    expect(view.total).toBe(2);
    expect(view.allComplete).toBe(true);
  });

  it("opens by default while streaming, on v1, or while a step is live", () => {
    const v2Idle = { version: 2, steps: [step("a", 1, "completed"), step("b", 2, "proposed")] };
    expect(planTodosDefaultOpen(v2Idle, true)).toBe(true);
    expect(planTodosDefaultOpen({ version: 1, steps: v2Idle.steps }, false)).toBe(true);
    expect(planTodosDefaultOpen({ version: 2, steps: [step("a", 1, "running")] }, false)).toBe(true);
    expect(
      planTodosDefaultOpen({ version: 2, steps: [step("a", 1, "awaiting-approval")] }, false),
    ).toBe(true);
    expect(planTodosDefaultOpen(v2Idle, false)).toBe(false);
  });
});
