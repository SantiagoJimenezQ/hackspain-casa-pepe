import { repairLlmPlanDraft } from "@agent/llm/plan-repair"
import { PlanBuildInput } from "@agent/types/agent.type"
import { PlanRecord, PlanStep } from "@plans/types/plan.type"
import {
	createImpactedIncident,
	createLastDegradedIncident,
} from "@root/testing/incident.fixture"
import { METEORITE_SCENARIO } from "@scenarios/constants/meteorite-scenario.constant"

function input(overrides: Partial<PlanBuildInput> = {}): PlanBuildInput {
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
		...overrides,
	}
}

function prioritiesFor(
	built: PlanBuildInput,
	decisionFor: (identifier: string, index: number) => string,
) {
	return built.incident.services.map((service, index) => ({
		blockedBy: service.dependencies,
		businessImpact: service.businessImpact,
		capacityUnits: service.recoveryCapacityUnits,
		decision: decisionFor(service.identifier, index),
		rank: index + 1,
		reason: "fixture",
		score: 100 - index,
		serviceIdentifier: service.identifier,
		serviceName: service.name,
	}))
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
		const priorities = prioritiesFor(built, (identifier) =>
			identifier === "orders-database"
				? "recover-now"
				: identifier === "events-stream"
					? "postpone"
					: "waiting-for-dependency",
		)
		const draft = {
			capacity: {
				assumedCapacity: 7,
				plannedUnits: 4,
				postponedUnits: 999,
				remainingUnits: 3,
			},
			priorities,
			steps: [
				{
					identifier: "stp_contact-engineer",
					invocation: {
						input: {
							engineerName: built.engineer.name,
							engineerPhone: built.engineer.phone,
							engineerRole: built.engineer.role,
							purpose: "Confirm facts",
							questions: [
								{
									key: "traffic-failover-authorized",
									question: "Authorize failover?",
								},
							],
						},
						name: "call_engineer",
					},
				},
				{
					identifier: "stp_orders-database_execute",
					invocation: {
						input: {
							serviceIdentifier: "orders-database",
						},
						name: "execute_recovery",
					},
					serviceIdentifier: "orders-database",
				},
			],
		}
		const result = repairLlmPlanDraft(draft, built) as {
			capacity: Record<string, unknown>
			priorities: Array<Record<string, unknown>>
		}
		const resource = built.incident.resources[0]
		const events = built.incident.services.find(
			(service) => service.identifier === "events-stream",
		)
		expect(result.capacity).toMatchObject({
			assumedCapacity: 7,
			confirmed: resource.confirmed,
			plannedUnits: 4,
			postponedUnits: events?.recoveryCapacityUnits,
			remainingUnits: 3,
			totalCapacity: resource.totalCapacity,
		})
		expect(result.priorities.map((priority) => priority.decision)).toEqual(
			priorities.map((priority) => priority.decision),
		)
		expect(result.priorities[0].serviceName).toBe(
			built.incident.services[0].name,
		)
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
	it("restores the configured role of a task recipient the model renamed", () => {
		const repaired = repairLlmPlanDraft(
			{
				priorities: [],
				steps: [
					{
						dependsOn: [],
						identifier: "stp_orders-database_task",
						invocation: {
							input: {
								assigneeName: "marta ruiz",
								assigneeRole: "Ingeniera de guardia",
								description: "Prepare the failover",
								priority: "critical",
								serviceIdentifier: "orders-database",
								title: "Prepare the failover",
							},
							name: "assign_task",
						},
						owner: { kind: "agent", name: "Casa Pepe agent" },
					},
				],
			},
			input(),
		)

		expect(repaired).toMatchObject({
			steps: [
				{
					invocation: {
						input: {
							assigneeName: "Marta Ruiz",
							assigneeRole: "Platform on-call engineer",
						},
					},
					owner: { kind: "engineer", name: "Marta Ruiz" },
				},
			],
		})
	})

	it("leaves an invented task recipient for the validator to reject", () => {
		const repaired = repairLlmPlanDraft(
			{
				priorities: [],
				steps: [
					{
						dependsOn: [],
						identifier: "stp_orders-database_task",
						invocation: {
							input: {
								assigneeName: "Platform team",
								assigneeRole: "Whoever answers",
								description: "Prepare the failover",
								priority: "critical",
								serviceIdentifier: "orders-database",
								title: "Prepare the failover",
							},
							name: "assign_task",
						},
						owner: { kind: "agent", name: "Casa Pepe agent" },
					},
				],
			},
			input(),
		)

		expect(repaired).toMatchObject({
			steps: [
				{
					invocation: {
						input: {
							assigneeName: "Platform team",
							assigneeRole: "Whoever answers",
						},
					},
				},
			],
		})
	})
	it("zeroes the cost of a service that is already healthy again", () => {
		const built = input()
		const recovered = {
			...built,
			incident: {
				...built.incident,
				services: built.incident.services.map((service) =>
					service.identifier === "orders-database"
						? { ...service, status: "healthy" as const }
						: service,
				),
			},
		}

		const repaired = repairLlmPlanDraft(
			{
				priorities: [
					{
						capacityUnits: 4,
						decision: "already-healthy",
						serviceIdentifier: "orders-database",
					},
					{
						capacityUnits: 999,
						decision: "postpone",
						serviceIdentifier: "events-stream",
					},
				],
				steps: [],
			},
			recovered,
		)

		const events = recovered.incident.services.find(
			(service) => service.identifier === "events-stream",
		)
		expect(repaired).toMatchObject({
			priorities: [
				{ capacityUnits: 0, serviceIdentifier: "orders-database" },
				{
					capacityUnits: events?.recoveryCapacityUnits,
					serviceIdentifier: "events-stream",
				},
			],
		})
	})
})

describe("first-cycle stall repair", () => {
	it("injects call_engineer with a permission question when the model only assigned a support task", () => {
		const built = input()
		const result = repairLlmPlanDraft(
			{
				capacity: {
					assumedCapacity: 0,
					plannedUnits: 0,
					postponedUnits: 6,
					remainingUnits: 0,
					resourceIdentifier: built.incident.resources[0].identifier,
					totalCapacity: 7,
				},
				priorities: prioritiesFor(built, (identifier, _index) => {
					const service = built.incident.services.find(
						(item) => item.identifier === identifier,
					)
					if (
						identifier === "orders-database" ||
						!service?.dependencies.length
					) {
						return "postpone"
					}
					return "waiting-for-dependency"
				}),
				steps: [
					{
						identifier: "stp_investigate_task",
						invocation: {
							input: {
								assigneeName: "Carlos Vega",
								assigneeRole: "Customer support lead",
								description: "Confirm snapshot",
								priority: "critical",
								serviceIdentifier: "orders-database",
								title: "Confirm Muscat",
							},
							name: "assign_task",
						},
					},
				],
			},
			built,
		) as {
			capacity: Record<string, unknown>
			priorities: Array<Record<string, unknown>>
			steps: Array<{
				identifier: string
				invocation: { name: string; input: Record<string, unknown> }
			}>
		}
		expect(result.steps.map((step) => step.invocation.name)).toEqual([
			"call_engineer",
			"assign_task",
			"execute_recovery",
			"verify_recovery",
		])
		expect(result.steps[0].invocation.input.questions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "traffic-failover-authorized" }),
			]),
		)
		expect(
			result.priorities.find(
				(priority) => priority.serviceIdentifier === "orders-database",
			)?.decision,
		).toBe("recover-now")
		expect(result.capacity.assumedCapacity).toBe(7)
		expect(result.capacity.plannedUnits).toBe(4)
	})

	it("uses scenario briefing questions when they exist", () => {
		const built = input({ briefing: METEORITE_SCENARIO.engineerBriefing })
		const result = repairLlmPlanDraft(
			{
				priorities: prioritiesFor(built, () => "postpone"),
				steps: [],
			},
			built,
		) as {
			steps: Array<{
				invocation: {
					name: string
					input: { questions: Array<{ key: string }> }
				}
			}>
		}
		const call = result.steps.find(
			(step) => step.invocation.name === "call_engineer",
		)
		expect(
			call?.invocation.input.questions.map((question) => question.key),
		).toEqual([
			"database-snapshot",
			"route-assignment-readiness",
			"backup-capacity",
		])
	})
})

describe("post-recovery stall repair", () => {
	function recoveredBuild(previous: PlanRecord): PlanBuildInput {
		const incident = createImpactedIncident(4)
		return input({
			incident: {
				...incident,
				resources: incident.resources.map((resource, index) =>
					index === 0
						? { ...resource, allocatedCapacity: 4 }
						: resource,
				),
				services: incident.services.map((service) =>
					service.identifier === "orders-database"
						? { ...service, status: "healthy" as const }
						: service,
				),
				status: "partially-recovered",
			},
			previousPlan: previous,
		})
	}

	function completedStep(
		step: Pick<
			PlanStep,
			| "identifier"
			| "invocation"
			| "order"
			| "owner"
			| "serviceIdentifier"
		> &
			Partial<PlanStep>,
	): PlanStep {
		return {
			approvalIdentifier: step.approvalIdentifier ?? "",
			attempts: 1,
			capacityUnits: step.capacityUnits ?? 0,
			dependsOn: step.dependsOn ?? [],
			identifier: step.identifier,
			invocation: step.invocation,
			order: step.order,
			owner: step.owner,
			reason: step.reason ?? "Completed in the previous plan",
			requiresApproval: step.requiresApproval ?? false,
			resultSummary: step.resultSummary ?? "Done",
			serviceIdentifier: step.serviceIdentifier,
			status: "completed",
			statusReason: step.statusReason ?? "Completed",
			title: step.title ?? step.identifier,
			toolCallIdentifier: step.toolCallIdentifier ?? "tool_completed",
			updatedAt: step.updatedAt ?? "2026-09-18T10:06:00.000Z",
		}
	}

	function previousRecovery(built: PlanBuildInput): PlanRecord {
		const database = built.incident.services.find(
			(service) => service.identifier === "orders-database",
		)
		if (!database) throw new Error("fixture lacks orders-database")
		const steps: PlanStep[] = [
			completedStep({
				identifier: "stp_engineer_call",
				invocation: {
					input: {
						engineerName: built.engineer.name,
						engineerPhone: built.engineer.phone,
						engineerRole: built.engineer.role,
						purpose: "Request permission to fail over",
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
				owner: { kind: "engineer", name: built.engineer.name },
				serviceIdentifier: "",
			}),
			completedStep({
				capacityUnits: database.recoveryCapacityUnits,
				identifier: "stp_orders-database_execute",
				invocation: {
					input: {
						actionDescription: database.recoveryActionDescription,
						actionKind: database.recoveryActionKind,
						approvalIdentifier: "",
						capacityUnits: database.recoveryCapacityUnits,
						resourceIdentifier:
							built.incident.resources[0].identifier,
						serviceIdentifier: "orders-database",
					},
					name: "execute_recovery",
				},
				order: 2,
				owner: { kind: "operator", name: "Operator" },
				requiresApproval: true,
				serviceIdentifier: "orders-database",
			}),
			completedStep({
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
				owner: { kind: "agent", name: "Casa Pepe agent" },
				serviceIdentifier: "orders-database",
			}),
		]
		return {
			assumptions: [],
			capacity: {
				assumedCapacity: 4,
				confirmed: false,
				plannedUnits: 4,
				postponedUnits: 10,
				remainingUnits: 0,
				resourceIdentifier: built.incident.resources[0].identifier,
				totalCapacity: 4,
			},
			changesFromPrevious: [],
			createdAt: built.incident.updatedAt,
			decisionIdentifier: "dec_previous",
			identifier: "plan_previous",
			incidentIdentifier: built.incident.identifier,
			previousPlanIdentifier: "",
			priorities: [],
			reason: "Failover the database",
			runIdentifier: built.incident.runIdentifier,
			status: "active",
			steps,
			summary: "Database recovered",
			triggeredBy: "test",
			updatedAt: built.incident.updatedAt,
			version: 1,
		}
	}

	it("coerces already-healthy cost to 0 and fails over to Bahrain for the next recovery", () => {
		const base = input({ incident: createImpactedIncident(4) })
		const built = recoveredBuild(previousRecovery(base))
		const dump = {
			assumptions: ["orders-database is healthy; Oman remaining is 0"],
			capacity: {
				assumedCapacity: 4,
				confirmed: false,
				plannedUnits: 4,
				postponedUnits: 10,
				remainingUnits: 0,
				resourceIdentifier: "backup-oman",
				totalCapacity: 4,
			},
			priorities: built.incident.services.map((service, index) => ({
				blockedBy: [],
				businessImpact: service.businessImpact,
				capacityUnits: service.recoveryCapacityUnits,
				decision:
					service.identifier === "orders-database"
						? "already-healthy"
						: "postpone",
				rank: index + 1,
				reason: "Dump revision after database recovery",
				score: 100 - index,
				serviceIdentifier: service.identifier,
				serviceName: service.name,
			})),
			reason: "Preserve completed recovery and wait",
			steps: [
				{
					approvalIdentifier: "",
					attempts: 0,
					capacityUnits: 0,
					dependsOn: [],
					identifier: "stp_engineer_call_2",
					invocation: {
						input: {
							engineerName: built.engineer.name,
							engineerPhone: built.engineer.phone,
							engineerRole: built.engineer.role,
							purpose: "Chase remaining technical facts",
							questions: [
								{
									key: "backup-capacity-available",
									question:
										"Authorize counting on remaining backup capacity?",
								},
							],
						},
						name: "call_engineer",
					},
					order: 1,
					owner: { kind: "engineer", name: built.engineer.name },
					reason: "Follow-up call",
					requiresApproval: false,
					resultSummary: "",
					serviceIdentifier: "",
					status: "proposed",
					statusReason: "",
					title: "Call engineer again",
					toolCallIdentifier: "",
					updatedAt: built.incident.updatedAt,
				},
			],
			summary: "Wait for another engineer call",
		}
		const result = repairLlmPlanDraft(dump, built) as {
			capacity: Record<string, unknown>
			priorities: Array<Record<string, unknown>>
			steps: Array<{
				dependsOn: string[]
				identifier: string
				invocation: { name: string; input: Record<string, unknown> }
				status: string
			}>
		}
		expect(
			result.priorities.find(
				(priority) => priority.serviceIdentifier === "orders-database",
			),
		).toMatchObject({
			capacityUnits: 0,
			decision: "already-healthy",
		})
		expect(
			result.priorities.find(
				(priority) => priority.serviceIdentifier === "route-assignment",
			)?.decision,
		).toBe("recover-now")
		expect(result.capacity).toMatchObject({
			assumedCapacity: 12,
			plannedUnits: 3,
			resourceIdentifier: "backup-bahrain",
			totalCapacity: 12,
		})
		expect(result.steps.map((step) => step.invocation.name)).toEqual([
			"execute_recovery",
			"verify_recovery",
			"call_engineer",
		])
		expect(result.steps[0]).toMatchObject({
			dependsOn: [],
			identifier: "stp_route-assignment_execute",
			invocation: {
				input: { resourceIdentifier: "backup-bahrain" },
				name: "execute_recovery",
			},
			status: "proposed",
		})
	})

	it("repairs a postponed leftover onto Bahrain recover-now", () => {
		const leftover = createLastDegradedIncident()
		const built = input({
			incident: leftover,
			previousPlan: previousRecovery(input({ incident: leftover })),
		})
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
				reason: "Dump revision after five recoveries",
				score: 100 - index,
				serviceIdentifier: service.identifier,
				serviceName: service.name,
			})),
			reason: "No remaining Oman capacity",
			steps: [],
			summary: "Wait because Oman is full",
		}
		const result = repairLlmPlanDraft(dump, built) as {
			capacity: Record<string, unknown>
			priorities: Array<Record<string, unknown>>
			steps: Array<{
				identifier: string
				invocation: { name: string; input: Record<string, unknown> }
			}>
		}
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
			resourceIdentifier: "backup-bahrain",
			totalCapacity: 12,
		})
		expect(result.steps.map((step) => step.identifier)).toEqual([
			"stp_customer-notifications_execute",
			"stp_customer-notifications_verify",
		])
		expect(result.steps[0]).toMatchObject({
			invocation: {
				input: { resourceIdentifier: "backup-bahrain" },
				name: "execute_recovery",
			},
		})
	})
})

describe("recover-now without matching steps", () => {
	it("demotes an extra recover-now that has no steps and does not fit remaining capacity", () => {
		const built = input({ incident: createImpactedIncident(4) })
		const dump = {
			assumptions: ["Oman remaining is committed to the database"],
			capacity: {
				assumedCapacity: 4,
				confirmed: false,
				plannedUnits: 4,
				postponedUnits: 10,
				remainingUnits: 0,
				resourceIdentifier: "muscat-lz",
				totalCapacity: 4,
			},
			priorities: built.incident.services.map((service, index) => ({
				blockedBy: service.dependencies,
				businessImpact: service.businessImpact,
				capacityUnits: service.recoveryCapacityUnits,
				decision:
					service.identifier === "orders-database" ||
					service.identifier === "events-stream"
						? "recover-now"
						: "waiting-for-dependency",
				rank: index + 1,
				reason: "Dump first proposal",
				score: 100 - index,
				serviceIdentifier: service.identifier,
				serviceName: service.name,
			})),
			reason: "Recover the database and also mark events-stream recover-now",
			steps: [
				{
					identifier: "stp_call_engineer",
					invocation: {
						input: {
							engineerName: built.engineer.name,
							engineerPhone: built.engineer.phone,
							engineerRole: built.engineer.role,
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
					owner: { kind: "engineer", name: built.engineer.name },
					serviceIdentifier: "",
					status: "proposed",
				},
				{
					capacityUnits: 4,
					identifier: "stp_orders-database_execute",
					invocation: {
						input: {
							actionKind: "failover-database",
							capacityUnits: 4,
							resourceIdentifier: "backup-oman",
							serviceIdentifier: "orders-database",
						},
						name: "execute_recovery",
					},
					order: 2,
					serviceIdentifier: "orders-database",
					status: "proposed",
				},
				{
					dependsOn: ["stp_orders-database_execute"],
					identifier: "stp_orders-database_verify",
					invocation: {
						input: { serviceIdentifier: "orders-database" },
						name: "verify_recovery",
					},
					order: 3,
					serviceIdentifier: "orders-database",
					status: "proposed",
				},
			],
			summary: "First plan with an extra recover-now",
		}
		const result = repairLlmPlanDraft(dump, built) as {
			priorities: Array<Record<string, unknown>>
			steps: Array<{ identifier: string }>
		}
		expect(
			result.priorities.find(
				(priority) => priority.serviceIdentifier === "orders-database",
			)?.decision,
		).toBe("recover-now")
		expect(
			result.priorities.find(
				(priority) => priority.serviceIdentifier === "events-stream",
			)?.decision,
		).toBe("postpone")
		expect(
			result.steps.some(
				(step) => step.identifier === "stp_events-stream_execute",
			),
		).toBe(false)
	})

	it("injects execute and verify when the leftover recover-now fits the next region", () => {
		const leftover = createLastDegradedIncident()
		const afterRoutes = {
			...leftover,
			resources: leftover.resources.map((resource) =>
				resource.identifier === "backup-bahrain"
					? { ...resource, allocatedCapacity: 3 }
					: resource,
			),
			services: leftover.services.map((service) => {
				if (service.identifier === "events-stream") {
					return { ...service, status: "down" as const }
				}
				if (service.identifier === "customer-notifications") {
					return service
				}
				return { ...service, status: "healthy" as const }
			}),
		}
		const previousCall: PlanStep = {
			approvalIdentifier: "",
			attempts: 1,
			capacityUnits: 0,
			dependsOn: [],
			identifier: "stp_call_engineer",
			invocation: {
				input: {
					engineerName: "Marta Ruiz",
					engineerPhone: "+34600000000",
					engineerRole: "Platform on-call engineer",
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
			owner: { kind: "engineer", name: "Marta Ruiz" },
			reason: "Call done",
			requiresApproval: false,
			resultSummary: "Authorized",
			serviceIdentifier: "",
			status: "completed",
			statusReason: "Completed",
			title: "Call engineer",
			toolCallIdentifier: "tool_call",
			updatedAt: afterRoutes.updatedAt,
		}
		const built = input({
			incident: afterRoutes,
			previousPlan: {
				assumptions: [],
				capacity: {
					assumedCapacity: 12,
					confirmed: false,
					plannedUnits: 3,
					postponedUnits: 2,
					remainingUnits: 9,
					resourceIdentifier: "backup-bahrain",
					totalCapacity: 12,
				},
				changesFromPrevious: [],
				createdAt: afterRoutes.updatedAt,
				decisionIdentifier: "dec_previous",
				identifier: "plan_previous",
				incidentIdentifier: afterRoutes.identifier,
				previousPlanIdentifier: "",
				priorities: [],
				reason: "Routes recovered",
				runIdentifier: afterRoutes.runIdentifier,
				status: "active",
				steps: [previousCall],
				summary: "Previous",
				triggeredBy: "test",
				updatedAt: afterRoutes.updatedAt,
				version: 3,
			},
		})
		const dump = {
			assumptions: ["Bahrain remaining can cover events-stream"],
			capacity: {
				assumedCapacity: 12,
				confirmed: false,
				plannedUnits: 3,
				postponedUnits: 1,
				remainingUnits: 9,
				resourceIdentifier: "backup-bahrain",
				totalCapacity: 12,
			},
			priorities: afterRoutes.services.map((service, index) => ({
				blockedBy: [],
				businessImpact: service.businessImpact,
				capacityUnits: service.recoveryCapacityUnits,
				decision:
					service.identifier === "events-stream"
						? "recover-now"
						: service.status === "healthy"
							? "already-healthy"
							: "waiting-for-dependency",
				rank: index + 1,
				reason: "Dump cycle 3 proposal",
				score: 100 - index,
				serviceIdentifier: service.identifier,
				serviceName: service.name,
			})),
			reason: "Recover events-stream next",
			steps: [],
			summary: "Next recovery without steps",
		}
		const result = repairLlmPlanDraft(dump, built) as {
			priorities: Array<Record<string, unknown>>
			steps: Array<{ identifier: string }>
		}
		expect(
			result.priorities.find(
				(priority) => priority.serviceIdentifier === "events-stream",
			)?.decision,
		).toBe("recover-now")
		expect(result.steps.map((step) => step.identifier)).toEqual([
			"stp_events-stream_execute",
			"stp_events-stream_verify",
		])
	})
})
