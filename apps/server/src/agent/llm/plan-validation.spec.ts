import { AGENT_ACTOR_NAME } from "@agent/constants/agent.constant"
import { repairLlmPlanDraft } from "@agent/llm/plan-repair"
import { validateLlmPlan } from "@agent/llm/plan-validation"
import { PlanBuildInput, PlanDraft } from "@agent/types/agent.type"
import { PlanRecord, PlanStep } from "@plans/types/plan.type"
import { createImpactedIncident } from "@root/testing/incident.fixture"
import { METEORITE_SCENARIO } from "@scenarios/constants/meteorite-scenario.constant"

function fixture(): { input: PlanBuildInput; draft: PlanDraft } {
	const incident = createImpactedIncident(12)
	const service = incident.services[0]
	const input: PlanBuildInput = {
		briefing: METEORITE_SCENARIO.engineerBriefing,
		capacityAssumption: null,
		engineer: { name: "Marta", phone: "+34600000000", role: "on-call" },
		failedServices: [],
		incident: { ...incident, facts: [], services: [service] },
		language: "en",
		maximumStepAttempts: 2,
		previousPlan: null,
		rejectedServices: [],
		supportContact: METEORITE_SCENARIO.supportContact,
		triggeredBy: "test",
	}
	const base: PlanStep = {
		approvalIdentifier: "",
		attempts: 0,
		capacityUnits: 4,
		dependsOn: [],
		identifier: "stp_orders-database_execute",
		invocation: {
			input: {
				actionDescription: service.recoveryActionDescription,
				actionKind: service.recoveryActionKind,
				approvalIdentifier: "",
				capacityUnits: 4,
				resourceIdentifier: incident.resources[0].identifier,
				serviceIdentifier: service.identifier,
			},
			name: "execute_recovery",
		},
		order: 1,
		owner: { kind: "operator", name: "Operator" },
		reason: "Restore orders",
		requiresApproval: true,
		resultSummary: "",
		serviceIdentifier: service.identifier,
		status: "proposed",
		statusReason: "",
		title: "Recover database",
		toolCallIdentifier: "",
		updatedAt: incident.updatedAt,
	}
	const draft: PlanDraft = {
		assumptions: [],
		capacity: {
			assumedCapacity: 12,
			confirmed: false,
			plannedUnits: 4,
			postponedUnits: 0,
			remainingUnits: 8,
			resourceIdentifier: incident.resources[0].identifier,
			totalCapacity: 12,
		},
		priorities: [
			{
				blockedBy: [],
				businessImpact: service.businessImpact,
				capacityUnits: 4,
				decision: "recover-now",
				rank: 1,
				reason: "Orders first",
				score: 100,
				serviceIdentifier: service.identifier,
				serviceName: service.name,
			},
		],
		reason: "Orders affect deliveries",
		steps: [
			base,
			{
				...base,
				capacityUnits: 0,
				dependsOn: [base.identifier],
				identifier: "stp_orders-database_verify",
				invocation: {
					input: {
						recoveryActionIdentifier: "",
						serviceIdentifier: service.identifier,
					},
					name: "verify_recovery",
				},
				order: 2,
				owner: { kind: "agent", name: AGENT_ACTOR_NAME },
				requiresApproval: false,
				title: "Verify database",
			},
		],
		summary: "Recover orders",
	}
	return { draft, input }
}

function prior(draft: PlanDraft): PlanRecord {
	return {
		...draft,
		changesFromPrevious: [],
		createdAt: "2026-09-18T10:05:00.000Z",
		decisionIdentifier: "dec_previous",
		identifier: "plan_previous",
		incidentIdentifier: "inc_fixture",
		previousPlanIdentifier: "",
		runIdentifier: "run_fixture",
		status: "active",
		triggeredBy: "impact",
		updatedAt: "2026-09-18T10:05:00.000Z",
		version: 1,
	}
}

describe("LLM plan boundary", () => {
	it("accepts model decisions without recomputing rank or score", () => {
		const { input, draft } = fixture()
		expect(validateLlmPlan(draft, input)).toEqual(draft)
	})
	it("uses dependency order rather than array order", () => {
		const { input, draft } = fixture()
		expect(
			validateLlmPlan(
				{ ...draft, steps: [...draft.steps].reverse() },
				input,
			).steps,
		).toHaveLength(2)
	})
	it("permits a conservative model assumption with evidence", () => {
		const { input, draft } = fixture()
		const conservative = {
			...draft,
			assumptions: ["Engineer reports only seven usable units"],
			capacity: {
				...draft.capacity,
				assumedCapacity: 7,
				remainingUnits: 3,
			},
		}
		expect(
			validateLlmPlan(conservative, input).capacity.assumedCapacity,
		).toBe(7)
		expect(() =>
			validateLlmPlan({ ...conservative, assumptions: [] }, input),
		).toThrow(/explain/)
	})
	it.each([
		[
			"approval bypass",
			(raw: PlanDraft) => ({
				...raw,
				steps: raw.steps.map((step) => ({
					...step,
					requiresApproval: false,
				})),
			}),
		],
		[
			"fabricated completion",
			(raw: PlanDraft) => ({
				...raw,
				steps: raw.steps.map((step) => ({
					...step,
					status: "completed",
				})),
			}),
		],
		[
			"fabricated authorization",
			(raw: PlanDraft) => ({
				...raw,
				steps: raw.steps.map((step) => ({
					...step,
					approvalIdentifier: "invented",
				})),
			}),
		],
		[
			"unknown service",
			(raw: PlanDraft) => ({
				...raw,
				priorities: raw.priorities.map((priority) => ({
					...priority,
					serviceIdentifier: "invented",
				})),
			}),
		],
		[
			"excess capacity",
			(raw: PlanDraft) => ({
				...raw,
				capacity: {
					...raw.capacity,
					assumedCapacity: 100,
					remainingUnits: 96,
				},
			}),
		],
		[
			"missing dependency",
			(raw: PlanDraft) => ({
				...raw,
				steps: raw.steps.map((step) => ({
					...step,
					dependsOn: ["unknown-step"],
				})),
			}),
		],
		[
			"cycle",
			(raw: PlanDraft) => ({
				...raw,
				steps: raw.steps.map((step, index) => ({
					...step,
					dependsOn: [raw.steps[1 - index].identifier],
				})),
			}),
		],
		[
			"unknown tool",
			(raw: PlanDraft) => ({
				...raw,
				steps: raw.steps.map((step) => ({
					...step,
					invocation: {
						input: { command: "anything" },
						name: "shell",
					},
				})),
			}),
		],
	] as const)("rejects %s", (_name, mutate) => {
		const { input, draft } = fixture()
		expect(() => validateLlmPlan(mutate(draft), input)).toThrow()
	})
	it("respects operator rejection", () => {
		const { input, draft } = fixture()
		expect(() =>
			validateLlmPlan(draft, {
				...input,
				rejectedServices: [
					{
						reason: "Do not fail over",
						serviceIdentifier: "orders-database",
					},
				],
			}),
		).toThrow(/rejected/)
	})
	it("preserves committed work when actual capacity falls below allocations", () => {
		const { input, draft } = fixture()
		const running: PlanStep = {
			...draft.steps[0],
			approvalIdentifier: "approval_real",
			attempts: 1,
			status: "running",
			statusReason: "Running",
			toolCallIdentifier: "tool_real",
		}
		const previous = prior({ ...draft, steps: [running, draft.steps[1]] })
		const changed: PlanBuildInput = {
			...input,
			incident: {
				...input.incident,
				resources: input.incident.resources.map((resource) => ({
					...resource,
					allocatedCapacity: 4,
					totalCapacity: 2,
				})),
				services: input.incident.services.map((service) => ({
					...service,
					status: "recovering",
				})),
			},
			previousPlan: previous,
		}
		const revised = {
			...draft,
			assumptions: [
				"Already committed work exceeds remaining capacity; no new allocations",
			],
			capacity: {
				...draft.capacity,
				assumedCapacity: 2,
				remainingUnits: -2,
				totalCapacity: 2,
			},
			steps: [running, draft.steps[1]],
		}
		expect(validateLlmPlan(revised, changed).steps[0]).toEqual(running)
		const rewritten = {
			...revised,
			steps: [
				{
					...running,
					approvalIdentifier: "",
					attempts: 0,
					reason: "Model rewrote history",
				},
				draft.steps[1],
			],
		}
		expect(
			validateLlmPlan(repairLlmPlanDraft(rewritten, changed), changed)
				.steps[0],
		).toEqual(running)

		expect(() =>
			validateLlmPlan(
				{
					...revised,
					steps: [{ ...running, attempts: 0 }, draft.steps[1]],
				},
				changed,
			),
		).toThrow(/trusted previous/)
	})
	it("restores a completed call that the model rewrites before validating a recovery plan", () => {
		const { input, draft } = fixture()
		const call: PlanStep = {
			...draft.steps[0],
			attempts: 1,
			capacityUnits: 0,
			identifier: "stp_call_engineer",
			invocation: {
				input: {
					engineerName: input.engineer.name,
					engineerPhone: input.engineer.phone,
					engineerRole: input.engineer.role,
					purpose: "Investigate readiness",
					questions: [],
				},
				name: "call_engineer",
			},
			order: 3,
			owner: { kind: "engineer", name: input.engineer.name },
			requiresApproval: false,
			resultSummary: "No answers",
			serviceIdentifier: "",
			status: "completed",
			statusReason: "No facts confirmed",
			toolCallIdentifier: "tool_completed_call",
		}
		const changed = {
			...input,
			previousPlan: prior({ ...draft, steps: [...draft.steps, call] }),
		}
		const proposal = {
			...draft,
			steps: [
				...draft.steps,
				{
					attempts: 0,
					identifier: call.identifier,
					reason: "Already done, preserve it",
					status: "proposed",
					updatedAt: "invalid model timestamp",
				},
			],
		}
		const repaired = repairLlmPlanDraft(proposal, changed)
		const result = validateLlmPlan(repaired, changed)
		expect(
			result.steps.find((step) => step.identifier === call.identifier),
		).toEqual(call)
		expect(
			result.steps.filter(
				(step) => step.invocation.name === "call_engineer",
			),
		).toHaveLength(1)
		expect(
			result.steps.find(
				(step) => step.invocation.name === "execute_recovery",
			)?.status,
		).toBe("proposed")
		expect(proposal.steps[2].attempts).toBe(0)
	})
	it("normalizes new-step timestamps without changing recovery decisions", () => {
		const { input, draft } = fixture()
		const outdated = {
			...draft,
			steps: draft.steps.map((step) => ({
				...step,
				updatedAt: "2026-01-01T00:00:00.000Z",
			})),
		}
		expect(() => validateLlmPlan(outdated, input)).toThrow(
			"current incident timestamp",
		)
		const result = validateLlmPlan(
			repairLlmPlanDraft(outdated, input),
			input,
		)
		expect(
			result.steps.every(
				(step) => step.updatedAt === input.incident.updatedAt,
			),
		).toBe(true)
		expect(result.priorities).toEqual(draft.priorities)
	})
	it("supports healthy services after completed verification", () => {
		const { input, draft } = fixture()
		const completed = draft.steps.map(
			(step): PlanStep => ({
				...step,
				attempts: 1,
				status: "completed",
				statusReason: "Verified",
				toolCallIdentifier: `tool_${step.order}`,
			}),
		)
		const changed: PlanBuildInput = {
			...input,
			incident: {
				...input.incident,
				resources: input.incident.resources.map((resource) => ({
					...resource,
					allocatedCapacity: 4,
				})),
				services: input.incident.services.map((service) => ({
					...service,
					status: "healthy",
				})),
			},
			previousPlan: prior({ ...draft, steps: completed }),
		}
		const healthy = {
			...draft,
			priorities: draft.priorities.map((priority) => ({
				...priority,
				capacityUnits: 0,
				decision: "already-healthy",
			})),
			steps: completed,
		}
		expect(
			validateLlmPlan(healthy, changed).priorities[0].capacityUnits,
		).toBe(0)
	})
	it("permits early truthful status publication", () => {
		const { input, draft } = fixture()
		const status: PlanStep = {
			...draft.steps[1],
			dependsOn: [],
			identifier: "stp_status",
			invocation: {
				input: { planIdentifier: "" },
				name: "publish_status_update",
			},
			order: 3,
			serviceIdentifier: "",
			title: "Report outage",
		}
		expect(
			validateLlmPlan(
				{ ...draft, steps: [...draft.steps, status] },
				input,
			).steps,
		).toHaveLength(3)
	})
	it("allows model-authored engineer questions but keeps the configured recipient", () => {
		const { input, draft } = fixture()
		const call: PlanStep = {
			...draft.steps[1],
			dependsOn: [],
			identifier: "stp_investigate",
			invocation: {
				input: {
					engineerName: input.engineer.name,
					engineerPhone: input.engineer.phone,
					engineerRole: input.engineer.role,
					purpose: "Investigate capacity",
					questions: [
						{
							key: "new_question",
							question:
								"Which workloads occupy the missing units?",
						},
					],
				},
				name: "call_engineer",
			},
			order: 3,
			owner: { kind: "engineer", name: input.engineer.name },
			serviceIdentifier: "",
		}
		expect(
			validateLlmPlan({ ...draft, steps: [...draft.steps, call] }, input)
				.steps,
		).toHaveLength(3)
		const changed = {
			...call,
			invocation: {
				input: {
					...call.invocation.input,
					engineerPhone: "+34999999999",
				},
				name: "call_engineer",
			},
		}
		expect(() =>
			validateLlmPlan(
				{ ...draft, steps: [...draft.steps, changed] },
				input,
			),
		).toThrow(/recipient/)
	})
})

describe("repair followed by validation", () => {
	it("accepts a consistent postpone decision after fixing only its derived total", () => {
		const { input, draft } = fixture()
		const proposed = {
			...draft,
			capacity: {
				...draft.capacity,
				plannedUnits: 0,
				postponedUnits: 999,
				remainingUnits: 12,
			},
			priorities: draft.priorities.map((priority) => ({
				...priority,
				decision: "postpone",
			})),
			steps: [],
		}
		expect(() => validateLlmPlan(proposed, input)).toThrow(
			"plan.capacity.postponedUnits",
		)
		const result = validateLlmPlan(
			repairLlmPlanDraft(proposed, input),
			input,
		)
		expect(result.capacity.postponedUnits).toBe(4)
		expect(result.priorities[0].decision).toBe("postpone")
	})
	it("still rejects invalid priority costs and over-capacity recovery plans", () => {
		const { input, draft } = fixture()
		const invalidCost = {
			...draft,
			priorities: draft.priorities.map((priority) => ({
				...priority,
				capacityUnits: 999,
			})),
		}
		expect(() =>
			validateLlmPlan(repairLlmPlanDraft(invalidCost, input), input),
		).toThrow("must match the incident service recovery cost")
		const unsafe = {
			...draft,
			capacity: {
				...draft.capacity,
				assumedCapacity: 2,
				remainingUnits: -2,
			},
		}
		expect(() =>
			validateLlmPlan(repairLlmPlanDraft(unsafe, input), input),
		).toThrow()
	})
})
