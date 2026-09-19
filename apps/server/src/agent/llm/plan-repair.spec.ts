import { repairLlmPlanDraft } from "@agent/llm/plan-repair"
import { PlanBuildInput } from "@agent/types/agent.type"
import { createImpactedIncident } from "@root/testing/incident.fixture"

function input(): PlanBuildInput {
	const incident = createImpactedIncident(7)
	return {
		briefing: { purpose: "", questions: [], simulatedSummary: "" },
		capacityAssumption: null,
		engineer: {
			name: "Marta Ruiz",
			phone: "+34600000000",
			role: "Platform on-call engineer",
		},
		failedServices: [],
		incident,
		language: "en",
		maximumStepAttempts: 2,
		previousPlan: null,
		rejectedServices: [],
		supportContact: { name: "Carlos Vega", role: "Customer support lead" },
		triggeredBy: "test",
	}
}

describe("repairLlmPlanDraft", () => {
	it("fixes owners, scope, capacity and approval flags from trusted state", () => {
		const built = input()
		const database = built.incident.services.find(
			(service) => service.identifier === "orders-database",
		)
		if (!database) throw new Error("fixture lacks orders-database")
		const repaired = repairLlmPlanDraft(
			{
				priorities: [
					{
						decision: "recover-now",
						serviceIdentifier: "orders-database",
					},
					{
						decision: "postpone",
						serviceIdentifier: "events-stream",
					},
				],
				steps: [
					{
						capacityUnits: 3,
						dependsOn: [],
						identifier: "stp_contact-engineer",
						invocation: { input: {}, name: "call_engineer" },
						owner: "agent",
						requiresApproval: true,
						serviceIdentifier: "orders-database",
					},
					{
						capacityUnits: 1,
						dependsOn: [
							"stp_contact-engineer",
							"stp_events-stream_execute",
							"missing",
						],
						identifier: "stp_orders-database_execute",
						invocation: {
							input: {
								actionKind: "wrong",
								capacityUnits: 1,
								serviceIdentifier: "orders-database",
							},
							name: "execute_recovery",
						},
						owner: { kind: "agent", name: "Casa Pepe agent" },
						requiresApproval: false,
						serviceIdentifier: "",
					},
					{
						capacityUnits: 2,
						dependsOn: ["stp_orders-database_execute"],
						identifier: "stp_orders-database_verify",
						invocation: {
							input: {
								recoveryActionIdentifier: "rec_x",
								serviceIdentifier: "orders-database",
							},
							name: "verify_recovery",
						},
						owner: { kind: "operator", name: "Operator" },
						requiresApproval: true,
						serviceIdentifier: "",
					},
					{
						dependsOn: [],
						identifier: "stp_events-stream_execute",
						invocation: {
							input: { serviceIdentifier: "events-stream" },
							name: "execute_recovery",
						},
						owner: {},
						serviceIdentifier: "events-stream",
					},
				],
			},
			built,
		) as { steps: Array<Record<string, unknown>> }

		const [call, execute, verify] = repaired.steps
		expect(call).toMatchObject({
			attempts: 0,
			capacityUnits: 0,
			owner: { kind: "engineer", name: "Marta Ruiz" },
			requiresApproval: false,
			serviceIdentifier: "",
			status: "proposed",
		})
		expect(execute).toMatchObject({
			capacityUnits: database.recoveryCapacityUnits,
			dependsOn: ["stp_contact-engineer"],
			invocation: {
				input: {
					actionKind: database.recoveryActionKind,
					approvalIdentifier: "",
					capacityUnits: database.recoveryCapacityUnits,
				},
			},
			owner: database.recoveryRequiresApproval
				? { kind: "operator", name: "Operator" }
				: { kind: "agent", name: "Casa Pepe agent" },
			requiresApproval: database.recoveryRequiresApproval,
			serviceIdentifier: "orders-database",
		})
		expect(verify).toMatchObject({
			capacityUnits: 0,
			invocation: { input: { recoveryActionIdentifier: "" } },
			owner: { kind: "agent", name: "Casa Pepe agent" },
			requiresApproval: false,
			serviceIdentifier: "orders-database",
		})
	})

	it("leaves non-plan values untouched", () => {
		expect(repairLlmPlanDraft("nope", input())).toBe("nope")
		expect(repairLlmPlanDraft({ steps: "x" }, input())).toEqual({
			steps: "x",
		})
	})
})

describe("postponed capacity bookkeeping", () => {
	it("derives the postponed total from trusted costs without changing model decisions", () => {
		const built = input()
		const priorities = built.incident.services.map((service, index) => ({
			capacityUnits: 999,
			decision: index === 0 ? "postpone" : "waiting-for-dependency",
			serviceIdentifier: service.identifier,
		}))
		const draft = {
			capacity: {
				assumedCapacity: 7,
				plannedUnits: 4,
				postponedUnits: 999,
				remainingUnits: 3,
			},
			priorities,
			steps: [],
		}
		const result = repairLlmPlanDraft(draft, built) as typeof draft
		expect(result.capacity).toEqual({
			...draft.capacity,
			postponedUnits: built.incident.services[0].recoveryCapacityUnits,
		})
		expect(result.priorities).toEqual(priorities)
		expect(draft.capacity.postponedUnits).toBe(999)
	})
	it("sets zero when no services are explicitly postponed", () => {
		const built = input()
		const result = repairLlmPlanDraft(
			{
				capacity: { postponedUnits: 999 },
				priorities: built.incident.services.map((service) => ({
					decision: "waiting-for-dependency",
					serviceIdentifier: service.identifier,
				})),
				steps: [],
			},
			built,
		)
		expect(result).toMatchObject({ capacity: { postponedUnits: 0 } })
	})
	it("does not guess totals for missing, duplicate or unknown services", () => {
		const built = input()
		const priorities = built.incident.services.map((service) => ({
			decision: "postpone",
			serviceIdentifier: service.identifier,
		}))
		for (const invalid of [
			priorities.slice(1),
			[...priorities, priorities[0]],
			[
				...priorities.slice(1),
				{ decision: "postpone", serviceIdentifier: "unknown" },
			],
		]) {
			expect(
				repairLlmPlanDraft(
					{
						capacity: { postponedUnits: 999 },
						priorities: invalid,
						steps: [],
					},
					built,
				),
			).toMatchObject({ capacity: { postponedUnits: 999 } })
		}
	})
})
