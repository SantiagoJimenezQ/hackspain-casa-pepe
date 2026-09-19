import { PlanRecord } from "@plans/types/plan.type"
import { TaskRecord } from "@tasks/types/task.type"
import { isPlanSettled } from "./plan-completion.helper"

function plan(decision = "recover-now", stepStatus = "completed"): PlanRecord {
	return {
		priorities: [{ decision }],
		runIdentifier: "run_review",
		status: "active",
		steps: [{ status: stepStatus }],
	} as unknown as PlanRecord
}

function task(
	status: TaskRecord["status"],
	runIdentifier = "run_review",
): TaskRecord {
	return { runIdentifier, status } as TaskRecord
}

describe("plan completion after investigation", () => {
	it.each(["postpone", "waiting-for-dependency"])(
		"keeps a plan active with %s priorities even after every tool finishes",
		(decision) => expect(isPlanSettled(plan(decision), [])).toBe(false),
	)
	it.each(["open", "in-progress"] as const)(
		"does not confuse task assignment with %s human work being done",
		(status) => expect(isPlanSettled(plan(), [task(status)])).toBe(false),
	)
	it.each([
		"failed",
		"rejected",
		"postponed",
		"running",
		"awaiting-approval",
	])("does not mark %s steps complete", (status) =>
		expect(isPlanSettled(plan("recover-now", status), [])).toBe(false),
	)
	it("allows settled work and ignores tasks belonging to other runs", () => {
		expect(
			isPlanSettled(plan(), [task("done"), task("open", "other")]),
		).toBe(true)
	})
	it("allows a healthy plan without actions but not an empty investigation", () => {
		expect(
			isPlanSettled({ ...plan("already-healthy"), steps: [] }, []),
		).toBe(true)
		expect(
			isPlanSettled({ ...plan(), priorities: [], steps: [] }, []),
		).toBe(false)
	})
})
