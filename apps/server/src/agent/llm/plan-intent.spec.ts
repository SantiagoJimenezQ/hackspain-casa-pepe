import { speedFixture } from "@root/testing/speed.fixture"
import { materializePlanIntent, PlanIntent } from "./plan-intent"

function fixture() {
	const { input, draft, plan } = speedFixture()
	const intent: PlanIntent = {
		assumedCapacity: draft.capacity.assumedCapacity,
		assumptions: [...draft.assumptions],
		priorities: draft.priorities.map(
			({
				serviceIdentifier,
				rank,
				score,
				decision,
				reason,
				blockedBy,
			}) => ({
				blockedBy: [...blockedBy],
				decision,
				rank,
				reason,
				score,
				serviceIdentifier,
			}),
		),
		reason: draft.reason,
		resourceIdentifier: draft.capacity.resourceIdentifier,
		steps: draft.steps.map((s) => ({
			dependsOn: [...s.dependsOn],
			input:
				s.invocation.name === "call_engineer"
					? {
							purpose: s.invocation.input.purpose,
							questions: s.invocation.input.questions,
						}
					: s.invocation.name === "assign_task"
						? {
								assignee:
									s.invocation.input.assigneeName ===
									input.engineer.name
										? "engineer"
										: "support",
								description: s.invocation.input.description,
								priority: s.invocation.input.priority,
								title: s.invocation.input.title,
							}
						: {},
			key: s.identifier,
			reason: s.reason,
			serviceIdentifier: s.serviceIdentifier,
			title: s.title,
			tool: s.invocation.name,
		})),
		summary: draft.summary,
	}
	return { draft, input, intent, plan }
}
describe("compact intent", () => {
	it("P01/P08 materializes equivalent validated priorities and allocations", () => {
		const { input, draft, intent } = fixture()
		const result = materializePlanIntent(intent, input)
		expect(result.draft.priorities).toEqual(draft.priorities)
		expect(result.draft.capacity).toEqual(draft.capacity)
		expect(result.draft.steps.map((s) => s.invocation)).toEqual(
			draft.steps.map((s) => s.invocation),
		)
		expect(
			result.draft.steps.every(
				(s) => s.attempts === 0 && s.approvalIdentifier === "",
			),
		).toBe(true)
		expect(JSON.stringify(intent).length).toBeLessThan(
			JSON.stringify(draft).length,
		)
	})
	it.each([
		"unknown-service",
		"duplicate",
		"cycle",
		"authority",
		"over-capacity",
	])("P03/P05 rejects %s", (kind) => {
		const { input, intent } = fixture()
		if (kind === "unknown-service")
			intent.priorities[0] = {
				...intent.priorities[0],
				serviceIdentifier: "unknown",
			}
		if (kind === "duplicate") intent.steps.push(intent.steps[0])
		if (kind === "cycle") intent.steps[0].dependsOn = [intent.steps[0].key]
		if (kind === "authority")
			intent.steps[0].input = { engineerPhone: "untrusted" }
		if (kind === "over-capacity") intent.assumedCapacity = 0
		expect(() => materializePlanIntent(intent, input)).toThrow()
	})
	it("P02 preserves dispatched work exactly when omitted", () => {
		const { input, intent, plan } = fixture()
		const first = {
			...plan.steps[0],
			attempts: 1,
			resultSummary: "Done",
			status: "completed" as const,
		}
		const previous = {
			...plan,
			steps: plan.steps.map((s, i) => (i === 0 ? first : s)),
		}
		intent.steps = intent.steps.slice(1)
		expect(
			materializePlanIntent(intent, {
				...input,
				previousPlan: previous,
			}).draft.steps.find((s) => s.identifier === first.identifier),
		).toEqual(first)
	})
	it("P05 preserves Spanish copy and uses configured engineer", () => {
		const { input, intent } = fixture()
		intent.summary = "Recuperar los pedidos"
		const result = materializePlanIntent(intent, {
			...input,
			language: "es",
		})
		expect(result.draft.summary).toBe(intent.summary)
		const call = result.draft.steps.find(
			(s) => s.invocation.name === "call_engineer",
		)
		expect(call?.owner.name).toBe(input.engineer.name)
	})
})
