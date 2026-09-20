import { AGENT_ACTOR_NAME } from "@agent/constants/agent.constant"
import { repairLlmPlanDraft } from "@agent/llm/plan-repair"
import { validateLlmPlan } from "@agent/llm/plan-validation"
import { PlanBuildInput, PlanDraft } from "@agent/types/agent.type"
import { PlanRecord, PlanStep } from "@plans/types/plan.type"
import {
	createImpactedIncident,
	createLastDegradedIncident,
} from "@root/testing/incident.fixture"
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
	it("rejects assumedCapacity 0 while reported remaining units exist", () => {
		const { input, draft } = fixture()
		expect(() =>
			validateLlmPlan(
				{
					...draft,
					assumptions: [
						"Capacity is unconfirmed so nothing is usable",
					],
					capacity: {
						...draft.capacity,
						assumedCapacity: 0,
						plannedUnits: 0,
						postponedUnits: 4,
						remainingUnits: 0,
					},
					priorities: draft.priorities.map((priority) => ({
						...priority,
						decision: "postpone",
					})),
					steps: [],
				},
				input,
			),
		).toThrow(/assumedCapacity cannot be 0/)
	})
	it("rejects a first plan that leaves pending facts without an engineer call", () => {
		const { input, draft } = fixture()
		const pending = {
			...input,
			incident: {
				...input.incident,
				facts: [
					{
						identifier: "fact_pending",
						recordedAt: input.incident.updatedAt,
						source: "Runbook",
						statement: "The snapshot is recent enough",
						status: "pending" as const,
					},
				],
			},
		}
		expect(() => validateLlmPlan(draft, pending)).toThrow(/call_engineer/)
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

		const withoutQuestions = {
			...call,
			invocation: {
				input: { ...call.invocation.input, questions: [] },
				name: "call_engineer",
			},
		}
		expect(() =>
			validateLlmPlan(
				{ ...draft, steps: [...draft.steps, withoutQuestions] },
				input,
			),
		).toThrow(/at least one question/)
	})
})

describe("repair followed by validation", () => {
	it("promotes a fitting postponed service instead of leaving the first plan idle", () => {
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
		expect(result.capacity.postponedUnits).toBe(0)
		expect(result.priorities[0].decision).toBe("recover-now")
		expect(result.steps.map((step) => step.invocation.name)).toEqual([
			"execute_recovery",
			"verify_recovery",
		])
	})
	it("repairs a misquoted priority cost and still rejects over-capacity recovery plans", () => {
		const { input, draft } = fixture()
		const service = input.incident.services[0]
		const invalidCost = {
			...draft,
			priorities: draft.priorities.map((priority) => ({
				...priority,
				capacityUnits: 999,
			})),
		}
		// The cost is trusted state, so the repair restores it instead of sinking the plan.
		expect(
			validateLlmPlan(repairLlmPlanDraft(invalidCost, input), input)
				.priorities[0].capacityUnits,
		).toBe(service.recoveryCapacityUnits)
		// A plan built by hand still has to carry the right number.
		expect(() => validateLlmPlan(invalidCost, input)).toThrow(
			"must match the incident service recovery cost",
		)
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
	it("sequences carried work the model omitted instead of rejecting a reused order", () => {
		const { input, draft } = fixture()
		const completed = draft.steps.map(
			(step): PlanStep => ({
				...step,
				attempts: 1,
				status: "completed",
				statusReason: "Done",
				toolCallIdentifier: `tool_${step.order}`,
			}),
		)
		const carried: PlanBuildInput = {
			...input,
			previousPlan: prior({ ...draft, steps: completed }),
		}
		// The model omits the completed work, as the contract asks, and numbers its own step
		// from one: the carried steps already hold that number.
		const status: PlanStep = {
			...draft.steps[1],
			dependsOn: [],
			identifier: "stp_status",
			invocation: {
				input: { planIdentifier: "" },
				name: "publish_status_update",
			},
			order: 1,
			serviceIdentifier: "",
			status: "proposed",
			statusReason: "",
			title: "Report outage",
		}

		const result = validateLlmPlan(
			repairLlmPlanDraft({ ...draft, steps: [status] }, carried),
			carried,
		)

		expect(result.steps.map((step) => step.order)).toEqual([1, 2, 3])
		expect(new Set(result.steps.map((step) => step.order)).size).toBe(3)
		expect(
			result.steps.filter((step) => step.status === "completed").length,
		).toBe(completed.length)
	})
	it("repairs a postpone-all zero-capacity stall into a callable recover-now plan", () => {
		const incident = createImpactedIncident(4)
		const resource = incident.resources[0]
		const stallInput: PlanBuildInput = {
			briefing: METEORITE_SCENARIO.engineerBriefing,
			capacityAssumption: null,
			engineer: { name: "Marta", phone: "+34600000000", role: "on-call" },
			failedServices: [],
			incident,
			language: "en",
			maximumStepAttempts: 2,
			previousPlan: null,
			rejectedServices: [],
			supportContact: METEORITE_SCENARIO.supportContact,
			triggeredBy: "test",
		}
		const proposed = {
			assumptions: ["Capacity is unconfirmed"],
			capacity: {
				assumedCapacity: 0,
				confirmed: false,
				plannedUnits: 0,
				postponedUnits: 6,
				remainingUnits: 0,
				resourceIdentifier: resource.identifier,
				totalCapacity: 4,
			},
			priorities: incident.services.map((service, index) => ({
				blockedBy: service.dependencies,
				businessImpact: service.businessImpact,
				capacityUnits: service.recoveryCapacityUnits,
				decision:
					service.identifier === "orders-database" ||
					service.dependencies.length === 0
						? "postpone"
						: "waiting-for-dependency",
				rank: index + 1,
				reason: "Waiting for confirmation",
				score: 100 - index,
				serviceIdentifier: service.identifier,
				serviceName: service.name,
			})),
			reason: "Investigate before recovering",
			steps: [
				{
					approvalIdentifier: "",
					attempts: 0,
					capacityUnits: 0,
					dependsOn: [],
					identifier: "stp_investigate_task",
					invocation: {
						input: {
							assigneeName:
								METEORITE_SCENARIO.supportContact.name,
							assigneeRole:
								METEORITE_SCENARIO.supportContact.role,
							description: "Confirm snapshot",
							priority: "critical",
							serviceIdentifier: "orders-database",
							title: "Confirm Muscat",
						},
						name: "assign_task",
					},
					order: 1,
					owner: {
						kind: "engineer",
						name: METEORITE_SCENARIO.supportContact.name,
					},
					reason: "Need independent confirmation",
					requiresApproval: false,
					resultSummary: "",
					serviceIdentifier: "orders-database",
					status: "proposed",
					statusReason: "",
					title: "Coordinate platform confirmations",
					toolCallIdentifier: "",
					updatedAt: incident.updatedAt,
				},
			],
			summary: "Wait for confirmation",
		}
		const result = validateLlmPlan(
			repairLlmPlanDraft(proposed, stallInput),
			stallInput,
		)
		expect(result.steps.map((step) => step.invocation.name)).toEqual([
			"call_engineer",
			"assign_task",
			"execute_recovery",
			"verify_recovery",
		])
		expect(
			result.priorities.find(
				(priority) => priority.serviceIdentifier === "orders-database",
			)?.decision,
		).toBe("recover-now")
		expect(result.capacity).toMatchObject({
			assumedCapacity: 4,
			plannedUnits: 4,
			remainingUnits: 0,
		})
	})
	it("accepts a first plan that marked events-stream recover-now without steps", () => {
		const incident = createImpactedIncident(4)
		const database = incident.services.find(
			(service) => service.identifier === "orders-database",
		)
		if (!database) throw new Error("fixture lacks orders-database")
		const engineer = {
			name: "Marta Ruiz",
			phone: "+34600000000",
			role: "Platform on-call engineer",
		}
		const changed: PlanBuildInput = {
			briefing: METEORITE_SCENARIO.engineerBriefing,
			capacityAssumption: null,
			engineer,
			failedServices: [],
			incident,
			language: "en",
			maximumStepAttempts: 2,
			previousPlan: null,
			rejectedServices: [],
			supportContact: METEORITE_SCENARIO.supportContact,
			triggeredBy: "test",
		}
		const dump = {
			assumptions: ["Oman remaining is committed to the database"],
			capacity: {
				assumedCapacity: 4,
				confirmed: false,
				plannedUnits: 4,
				postponedUnits: 10,
				remainingUnits: 0,
				resourceIdentifier: "backup-oman",
				totalCapacity: 4,
			},
			priorities: incident.services.map((service, index) => ({
				blockedBy: service.dependencies,
				businessImpact: service.businessImpact,
				capacityUnits: service.recoveryCapacityUnits,
				decision:
					service.identifier === "orders-database" ||
					service.identifier === "events-stream"
						? "recover-now"
						: service.dependencies.length
							? "waiting-for-dependency"
							: "postpone",
				rank: index + 1,
				reason: "Dump first proposal",
				score: 100 - index,
				serviceIdentifier: service.identifier,
				serviceName: service.name,
			})),
			reason: "Recover database and events",
			steps: [
				{
					approvalIdentifier: "",
					attempts: 0,
					capacityUnits: 0,
					dependsOn: [],
					identifier: "stp_call_engineer",
					invocation: {
						input: {
							engineerName: engineer.name,
							engineerPhone: engineer.phone,
							engineerRole: engineer.role,
							purpose: "Authorize failover",
							questions: [
								{
									key: "traffic-failover-authorized",
									question: "Authorize failover?",
								},
							],
						},
						name: "call_engineer",
					},
					order: 1,
					owner: { kind: "engineer", name: engineer.name },
					reason: "Call the engineer",
					requiresApproval: false,
					resultSummary: "",
					serviceIdentifier: "",
					status: "proposed",
					statusReason: "",
					title: "Call engineer",
					toolCallIdentifier: "",
					updatedAt: incident.updatedAt,
				},
				{
					approvalIdentifier: "",
					attempts: 0,
					capacityUnits: database.recoveryCapacityUnits,
					dependsOn: [],
					identifier: "stp_orders-database_execute",
					invocation: {
						input: {
							actionDescription:
								database.recoveryActionDescription,
							actionKind: database.recoveryActionKind,
							approvalIdentifier: "",
							capacityUnits: database.recoveryCapacityUnits,
							resourceIdentifier: "backup-oman",
							serviceIdentifier: "orders-database",
						},
						name: "execute_recovery",
					},
					order: 2,
					owner: { kind: "operator", name: "Operator" },
					reason: "Failover the database",
					requiresApproval: true,
					resultSummary: "",
					serviceIdentifier: "orders-database",
					status: "proposed",
					statusReason: "",
					title: "Recover database",
					toolCallIdentifier: "",
					updatedAt: incident.updatedAt,
				},
				{
					approvalIdentifier: "",
					attempts: 0,
					capacityUnits: 0,
					dependsOn: ["stp_orders-database_execute"],
					identifier: "stp_orders-database_verify",
					invocation: {
						input: {
							recoveryActionIdentifier: "",
							serviceIdentifier: "orders-database",
						},
						name: "verify_recovery",
					},
					order: 3,
					owner: { kind: "agent", name: AGENT_ACTOR_NAME },
					reason: "Verify the failover",
					requiresApproval: false,
					resultSummary: "",
					serviceIdentifier: "orders-database",
					status: "proposed",
					statusReason: "",
					title: "Verify database",
					toolCallIdentifier: "",
					updatedAt: incident.updatedAt,
				},
			],
			summary: "First plan with an extra recover-now",
		}
		expect(() => validateLlmPlan(dump, changed)).toThrow(
			/recover-now services require both execution and verification steps/,
		)
		const result = validateLlmPlan(
			repairLlmPlanDraft(dump, changed),
			changed,
		)
		expect(
			result.priorities.find(
				(priority) => priority.serviceIdentifier === "events-stream",
			)?.decision,
		).toBe("postpone")
		expect(
			result.priorities.find(
				(priority) => priority.serviceIdentifier === "orders-database",
			)?.decision,
		).toBe("recover-now")
	})
	it("repairs the post-recovery already-healthy dump into a Bahrain recover-now plan", () => {
		const engineer = {
			name: "Marta Ruiz",
			phone: "+34600000000",
			role: "Platform on-call engineer",
		}
		const incident = createImpactedIncident(4)
		const recovered = {
			...incident,
			resources: incident.resources.map((resource, index) =>
				index === 0 ? { ...resource, allocatedCapacity: 4 } : resource,
			),
			services: incident.services.map((service) =>
				service.identifier === "orders-database"
					? { ...service, status: "healthy" as const }
					: service,
			),
		}
		const database = recovered.services.find(
			(service) => service.identifier === "orders-database",
		)
		if (!database) throw new Error("fixture lacks orders-database")
		const completed: PlanStep[] = [
			{
				approvalIdentifier: "",
				attempts: 1,
				capacityUnits: 0,
				dependsOn: [],
				identifier: "stp_engineer_call",
				invocation: {
					input: {
						engineerName: engineer.name,
						engineerPhone: engineer.phone,
						engineerRole: engineer.role,
						purpose: "Request permission",
						questions: [
							{
								key: "traffic-failover-authorized",
								question: "Authorize failover?",
							},
						],
					},
					name: "call_engineer",
				},
				order: 1,
				owner: { kind: "engineer", name: engineer.name },
				reason: "Call the engineer",
				requiresApproval: false,
				resultSummary: "Authorized",
				serviceIdentifier: "",
				status: "completed",
				statusReason: "Completed",
				title: "Call engineer",
				toolCallIdentifier: "tool_call",
				updatedAt: recovered.updatedAt,
			},
			{
				approvalIdentifier: "apr_db",
				attempts: 1,
				capacityUnits: database.recoveryCapacityUnits,
				dependsOn: [],
				identifier: "stp_orders-database_execute",
				invocation: {
					input: {
						actionDescription: database.recoveryActionDescription,
						actionKind: database.recoveryActionKind,
						approvalIdentifier: "",
						capacityUnits: database.recoveryCapacityUnits,
						resourceIdentifier: "backup-oman",
						serviceIdentifier: "orders-database",
					},
					name: "execute_recovery",
				},
				order: 2,
				owner: { kind: "operator", name: "Operator" },
				reason: "Failover the database",
				requiresApproval: true,
				resultSummary: "Replica promoted",
				serviceIdentifier: "orders-database",
				status: "completed",
				statusReason: "Completed",
				title: "Recover database",
				toolCallIdentifier: "tool_execute",
				updatedAt: recovered.updatedAt,
			},
			{
				approvalIdentifier: "",
				attempts: 1,
				capacityUnits: 0,
				dependsOn: ["stp_orders-database_execute"],
				identifier: "stp_orders-database_verify",
				invocation: {
					input: {
						recoveryActionIdentifier: "",
						serviceIdentifier: "orders-database",
					},
					name: "verify_recovery",
				},
				order: 3,
				owner: { kind: "agent", name: AGENT_ACTOR_NAME },
				reason: "Verify the failover",
				requiresApproval: false,
				resultSummary: "Healthy",
				serviceIdentifier: "orders-database",
				status: "completed",
				statusReason: "Completed",
				title: "Verify database",
				toolCallIdentifier: "tool_verify",
				updatedAt: recovered.updatedAt,
			},
		]
		const changed: PlanBuildInput = {
			briefing: METEORITE_SCENARIO.engineerBriefing,
			capacityAssumption: null,
			engineer,
			failedServices: [],
			incident: recovered,
			language: "en",
			maximumStepAttempts: 2,
			previousPlan: prior({
				assumptions: [],
				capacity: {
					assumedCapacity: 4,
					confirmed: false,
					plannedUnits: 4,
					postponedUnits: 10,
					remainingUnits: 0,
					resourceIdentifier: "backup-oman",
					totalCapacity: 4,
				},
				priorities: recovered.services.map((service, index) => ({
					blockedBy: [],
					businessImpact: service.businessImpact,
					capacityUnits: service.recoveryCapacityUnits,
					decision: "postpone",
					rank: index + 1,
					reason: "Previous plan",
					score: 100 - index,
					serviceIdentifier: service.identifier,
					serviceName: service.name,
				})),
				reason: "Previous recovery",
				steps: completed,
				summary: "Database recovered",
			}),
			rejectedServices: [],
			supportContact: METEORITE_SCENARIO.supportContact,
			triggeredBy: "test",
		}
		const dump = {
			assumptions: ["Oman is full after the database failover"],
			capacity: {
				assumedCapacity: 4,
				confirmed: false,
				plannedUnits: 4,
				postponedUnits: 10,
				remainingUnits: 0,
				resourceIdentifier: "backup-oman",
				totalCapacity: 4,
			},
			priorities: recovered.services.map((service, index) => ({
				blockedBy: [],
				businessImpact: service.businessImpact,
				capacityUnits: service.recoveryCapacityUnits,
				decision:
					service.identifier === "orders-database"
						? "already-healthy"
						: "postpone",
				rank: index + 1,
				reason: "Dump revision",
				score: 100 - index,
				serviceIdentifier: service.identifier,
				serviceName: service.name,
			})),
			reason: "Preserve the recovered database",
			steps: [
				{
					approvalIdentifier: "",
					attempts: 0,
					capacityUnits: 0,
					dependsOn: [],
					identifier: "stp_engineer_call_2",
					invocation: {
						input: {
							engineerName: engineer.name,
							engineerPhone: engineer.phone,
							engineerRole: engineer.role,
							purpose: "Chase remaining facts",
							questions: [
								{
									key: "backup-capacity-available",
									question: "Authorize remaining capacity?",
								},
							],
						},
						name: "call_engineer",
					},
					order: 1,
					owner: { kind: "engineer", name: engineer.name },
					reason: "Follow-up call",
					requiresApproval: false,
					resultSummary: "",
					serviceIdentifier: "",
					status: "proposed",
					statusReason: "",
					title: "Call engineer again",
					toolCallIdentifier: "",
					updatedAt: recovered.updatedAt,
				},
			],
			summary: "Wait for another call",
		}
		const result = validateLlmPlan(
			repairLlmPlanDraft(dump, changed),
			changed,
		)
		expect(
			result.priorities.find(
				(priority) => priority.serviceIdentifier === "orders-database",
			),
		).toMatchObject({ capacityUnits: 0, decision: "already-healthy" })
		expect(
			result.priorities.find(
				(priority) => priority.serviceIdentifier === "route-assignment",
			)?.decision,
		).toBe("recover-now")
		expect(result.capacity.resourceIdentifier).toBe("backup-frankfurt")
		const execute = result.steps.find(
			(step) => step.identifier === "stp_route-assignment_execute",
		)
		expect(execute?.status).toBe("proposed")
		expect(execute?.order).toBeLessThan(
			result.steps.find(
				(step) => step.identifier === "stp_engineer_call_2",
			)?.order ?? Number.POSITIVE_INFINITY,
		)
	})

	it("validates a repaired leftover notifications recover-now on Bahrain", () => {
		const engineer = {
			name: "Marta Ruiz",
			phone: "+34600000000",
			role: "Platform on-call engineer",
		}
		const leftover = createLastDegradedIncident()
		const database = leftover.services.find(
			(service) => service.identifier === "orders-database",
		)
		if (!database) throw new Error("fixture lacks orders-database")
		const completed: PlanStep[] = [
			{
				approvalIdentifier: "",
				attempts: 1,
				capacityUnits: 0,
				dependsOn: [],
				identifier: "stp_engineer_call",
				invocation: {
					input: {
						engineerName: engineer.name,
						engineerPhone: engineer.phone,
						engineerRole: engineer.role,
						purpose: "Request permission",
						questions: [
							{
								key: "traffic-failover-authorized",
								question: "Authorize failover?",
							},
						],
					},
					name: "call_engineer",
				},
				order: 1,
				owner: { kind: "engineer", name: engineer.name },
				reason: "Call the engineer",
				requiresApproval: false,
				resultSummary: "Authorized",
				serviceIdentifier: "",
				status: "completed",
				statusReason: "Completed",
				title: "Call engineer",
				toolCallIdentifier: "tool_call",
				updatedAt: leftover.updatedAt,
			},
			{
				approvalIdentifier: "apr_db",
				attempts: 1,
				capacityUnits: database.recoveryCapacityUnits,
				dependsOn: [],
				identifier: "stp_orders-database_execute",
				invocation: {
					input: {
						actionDescription: database.recoveryActionDescription,
						actionKind: database.recoveryActionKind,
						approvalIdentifier: "",
						capacityUnits: database.recoveryCapacityUnits,
						resourceIdentifier: "backup-oman",
						serviceIdentifier: "orders-database",
					},
					name: "execute_recovery",
				},
				order: 2,
				owner: { kind: "operator", name: "Operator" },
				reason: "Failover the database",
				requiresApproval: true,
				resultSummary: "Replica promoted",
				serviceIdentifier: "orders-database",
				status: "completed",
				statusReason: "Completed",
				title: "Recover database",
				toolCallIdentifier: "tool_execute",
				updatedAt: leftover.updatedAt,
			},
			{
				approvalIdentifier: "",
				attempts: 1,
				capacityUnits: 0,
				dependsOn: ["stp_orders-database_execute"],
				identifier: "stp_orders-database_verify",
				invocation: {
					input: {
						recoveryActionIdentifier: "",
						serviceIdentifier: "orders-database",
					},
					name: "verify_recovery",
				},
				order: 3,
				owner: { kind: "agent", name: AGENT_ACTOR_NAME },
				reason: "Verify the failover",
				requiresApproval: false,
				resultSummary: "Healthy",
				serviceIdentifier: "orders-database",
				status: "completed",
				statusReason: "Completed",
				title: "Verify database",
				toolCallIdentifier: "tool_verify",
				updatedAt: leftover.updatedAt,
			},
		]
		const changed: PlanBuildInput = {
			briefing: METEORITE_SCENARIO.engineerBriefing,
			capacityAssumption: null,
			engineer,
			failedServices: [],
			incident: leftover,
			language: "en",
			maximumStepAttempts: 2,
			previousPlan: prior({
				assumptions: [],
				capacity: {
					assumedCapacity: 4,
					confirmed: false,
					plannedUnits: 4,
					postponedUnits: 1,
					remainingUnits: 0,
					resourceIdentifier: "backup-oman",
					totalCapacity: 4,
				},
				priorities: leftover.services.map((service, index) => ({
					blockedBy: [],
					businessImpact: service.businessImpact,
					capacityUnits: service.recoveryCapacityUnits,
					decision: "postpone",
					rank: index + 1,
					reason: "Previous plan",
					score: 100 - index,
					serviceIdentifier: service.identifier,
					serviceName: service.name,
				})),
				reason: "Previous recovery",
				steps: completed,
				summary: "Five services recovered",
			}),
			rejectedServices: [],
			supportContact: METEORITE_SCENARIO.supportContact,
			triggeredBy: "test",
		}
		const dump = {
			assumptions: ["Oman is full and only notifications remain"],
			capacity: {
				assumedCapacity: 4,
				confirmed: false,
				plannedUnits: 4,
				postponedUnits: 1,
				remainingUnits: 0,
				resourceIdentifier: "backup-oman",
				totalCapacity: 4,
			},
			priorities: leftover.services.map((service, index) => ({
				blockedBy: [],
				businessImpact: service.businessImpact,
				capacityUnits: service.recoveryCapacityUnits,
				decision:
					service.identifier === "customer-notifications"
						? "postpone"
						: "already-healthy",
				rank: index + 1,
				reason: "Dump revision",
				score: 100 - index,
				serviceIdentifier: service.identifier,
				serviceName: service.name,
			})),
			reason: "No remaining Oman capacity",
			steps: [],
			summary: "Wait because Oman is full",
		}
		const result = validateLlmPlan(
			repairLlmPlanDraft(dump, changed),
			changed,
		)
		expect(
			result.priorities.find(
				(priority) =>
					priority.serviceIdentifier === "customer-notifications",
			)?.decision,
		).toBe("recover-now")
		expect(result.capacity).toMatchObject({
			assumedCapacity: 12,
			plannedUnits: 9,
			remainingUnits: 3,
			resourceIdentifier: "backup-frankfurt",
		})
		expect(
			result.steps.some(
				(step) =>
					step.identifier === "stp_customer-notifications_execute",
			),
		).toBe(true)
		expect(
			result.steps.some(
				(step) =>
					step.identifier === "stp_customer-notifications_verify",
			),
		).toBe(true)
	})
})
