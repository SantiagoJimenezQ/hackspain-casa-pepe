import { PlanRecord } from "@plans/types/plan.type"
import { TaskRecord } from "@tasks/types/task.type"

/** Dispatching a task or finishing an investigation does not resolve its blockers. */
export function isPlanSettled(
	plan: PlanRecord,
	tasks: ReadonlyArray<TaskRecord>,
): boolean {
	return (
		plan.status === "active" &&
		plan.priorities.length > 0 &&
		plan.priorities.every(
			(priority) =>
				priority.decision === "already-healthy" ||
				priority.decision === "recover-now",
		) &&
		plan.steps.every((step) => step.status === "completed") &&
		!tasks.some(
			(task) =>
				task.runIdentifier === plan.runIdentifier &&
				(task.status === "open" || task.status === "in-progress"),
		)
	)
}
