import { AGENT_ACTOR_NAME } from "@agent/constants/agent.constant"
import { PlanBuildInput, PlanDraft } from "@agent/types/agent.type"
import { Actor, ActorKind } from "@common/types/identity.type"
import {
	IncidentSnapshot,
	ResourceState,
	ServiceState,
} from "@incidents/types/incident.type"
import {
	PLAN_STEP_STATUSES,
	SERVICE_DECISIONS,
} from "@plans/constants/plan.constant"
import {
	CapacityAllocationPlan,
	PlanStep,
	PlanStepStatus,
	ServicePriority,
} from "@plans/types/plan.type"
import { RECOVERY_ACTION_KINDS } from "@scenarios/constants/scenario.constant"
import { RecoveryActionKind } from "@scenarios/types/scenario.type"
import { ToolInvocation } from "@tools/types/tool.type"

/**
 * A deliberately broad schema for provider-side structured output.
 *
 * The JSON schema makes the expected outer shape visible to an LLM provider,
 * but it is not the security boundary. `validateLlmPlan` performs the
 * scenario-aware checks that JSON Schema cannot express.
 */
export const llmPlanSchema = {
	additionalProperties: false,
	definitions: {
		actor: {
			additionalProperties: false,
			properties: {
				kind: {
					enum: ["agent", "operator", "engineer"],
					type: "string",
				},
				name: { minLength: 1, type: "string" },
			},
			required: ["kind", "name"],
			type: "object",
		},
		capacity: {
			additionalProperties: false,
			properties: {
				assumedCapacity: { minimum: 0, type: "number" },
				confirmed: { type: "boolean" },
				plannedUnits: { minimum: 0, type: "number" },
				postponedUnits: { minimum: 0, type: "number" },
				remainingUnits: {
					description:
						"Effective capacity minus planned units; it may be negative when committed work exceeds a newly confirmed capacity.",
					type: "number",
				},
				resourceIdentifier: { minLength: 1, type: "string" },
				totalCapacity: { minimum: 0, type: "number" },
			},
			required: [
				"resourceIdentifier",
				"totalCapacity",
				"assumedCapacity",
				"plannedUnits",
				"remainingUnits",
				"confirmed",
				"postponedUnits",
			],
			type: "object",
		},
		invocation: {
			additionalProperties: false,
			oneOf: [
				{
					properties: {
						input: {
							additionalProperties: false,
							properties: {
								engineerName: { minLength: 1, type: "string" },
								engineerPhone: { minLength: 1, type: "string" },
								engineerRole: { minLength: 1, type: "string" },
								purpose: { minLength: 1, type: "string" },
								questions: {
									items: {
										additionalProperties: false,
										properties: {
											key: {
												minLength: 1,
												type: "string",
											},
											question: {
												minLength: 1,
												type: "string",
											},
										},
										required: ["key", "question"],
										type: "object",
									},
									type: "array",
								},
							},
							required: [
								"engineerName",
								"engineerPhone",
								"engineerRole",
								"purpose",
								"questions",
							],
							type: "object",
						},
						name: { const: "call_engineer" },
					},
				},
				{
					properties: {
						input: {
							additionalProperties: false,
							properties: {
								assigneeName: { minLength: 1, type: "string" },
								assigneeRole: { minLength: 1, type: "string" },
								description: { minLength: 1, type: "string" },
								priority: {
									enum: ["critical", "high", "medium", "low"],
									type: "string",
								},
								serviceIdentifier: { type: "string" },
								title: { minLength: 1, type: "string" },
							},
							required: [
								"title",
								"description",
								"assigneeName",
								"assigneeRole",
								"priority",
								"serviceIdentifier",
							],
							type: "object",
						},
						name: { const: "assign_task" },
					},
				},
				{
					properties: {
						input: {
							additionalProperties: false,
							properties: {
								actionDescription: {
									minLength: 1,
									type: "string",
								},
								actionKind: {
									enum: [
										"failover-database",
										"redeploy-service",
										"restart-stream",
										"scale-service",
									],
									type: "string",
								},
								approvalIdentifier: { const: "" },
								capacityUnits: { minimum: 0, type: "number" },
								resourceIdentifier: {
									minLength: 1,
									type: "string",
								},
								serviceIdentifier: {
									minLength: 1,
									type: "string",
								},
							},
							required: [
								"serviceIdentifier",
								"actionKind",
								"actionDescription",
								"capacityUnits",
								"resourceIdentifier",
								"approvalIdentifier",
							],
							type: "object",
						},
						name: { const: "execute_recovery" },
					},
				},
				{
					properties: {
						input: {
							additionalProperties: false,
							properties: {
								recoveryActionIdentifier: { const: "" },
								serviceIdentifier: {
									minLength: 1,
									type: "string",
								},
							},
							required: [
								"serviceIdentifier",
								"recoveryActionIdentifier",
							],
							type: "object",
						},
						name: { const: "verify_recovery" },
					},
				},
				{
					properties: {
						input: {
							additionalProperties: false,
							properties: { planIdentifier: { const: "" } },
							required: ["planIdentifier"],
							type: "object",
						},
						name: {
							enum: [
								"send_incident_email",
								"publish_status_update",
							],
						},
					},
				},
				{
					properties: {
						input: {
							additionalProperties: false,
							maxProperties: 0,
							type: "object",
						},
						name: {
							enum: [
								"get_incident_context",
								"get_incident_state",
								"get_service_health",
								"get_recovery_capacity",
							],
						},
					},
				},
			],
			properties: {
				input: { type: "object" },
				name: { type: "string" },
			},
			required: ["name", "input"],
			type: "object",
		},
		priority: {
			additionalProperties: false,
			properties: {
				blockedBy: { items: { type: "string" }, type: "array" },
				businessImpact: {
					enum: ["critical", "high", "medium", "low"],
					type: "string",
				},
				capacityUnits: { minimum: 0, type: "number" },
				decision: {
					enum: [
						"recover-now",
						"postpone",
						"already-healthy",
						"waiting-for-dependency",
					],
					type: "string",
				},
				rank: { minimum: 1, type: "integer" },
				reason: { minLength: 1, type: "string" },
				score: { type: "number" },
				serviceIdentifier: { minLength: 1, type: "string" },
				serviceName: { minLength: 1, type: "string" },
			},
			required: [
				"serviceIdentifier",
				"serviceName",
				"rank",
				"score",
				"businessImpact",
				"capacityUnits",
				"decision",
				"reason",
				"blockedBy",
			],
			type: "object",
		},
		step: {
			additionalProperties: false,
			properties: {
				approvalIdentifier: { type: "string" },
				attempts: { minimum: 0, type: "integer" },
				capacityUnits: { minimum: 0, type: "number" },
				dependsOn: { items: { type: "string" }, type: "array" },
				identifier: { minLength: 1, type: "string" },
				invocation: { $ref: "#/definitions/invocation" },
				order: { minimum: 1, type: "integer" },
				owner: { $ref: "#/definitions/actor" },
				reason: { minLength: 1, type: "string" },
				requiresApproval: { type: "boolean" },
				resultSummary: { type: "string" },
				serviceIdentifier: { type: "string" },
				status: {
					description:
						"Use proposed or postponed for new work. Running and completed values are accepted only when copied from trusted previous state.",
					enum: [
						"proposed",
						"awaiting-approval",
						"approved",
						"rejected",
						"running",
						"completed",
						"failed",
						"cancelled",
						"postponed",
					],
					type: "string",
				},
				statusReason: { type: "string" },
				title: { minLength: 1, type: "string" },
				toolCallIdentifier: { type: "string" },
				updatedAt: { minLength: 1, type: "string" },
			},
			required: [
				"identifier",
				"order",
				"title",
				"reason",
				"invocation",
				"owner",
				"serviceIdentifier",
				"capacityUnits",
				"requiresApproval",
				"dependsOn",
				"status",
				"statusReason",
				"toolCallIdentifier",
				"approvalIdentifier",
				"attempts",
				"resultSummary",
				"updatedAt",
			],
			type: "object",
		},
	},
	properties: {
		assumptions: { items: { type: "string" }, type: "array" },
		capacity: { $ref: "#/definitions/capacity" },
		priorities: {
			items: { $ref: "#/definitions/priority" },
			type: "array",
		},
		reason: { minLength: 1, type: "string" },
		steps: {
			items: { $ref: "#/definitions/step" },
			type: "array",
		},
		summary: { minLength: 1, type: "string" },
	},
	required: [
		"priorities",
		"capacity",
		"steps",
		"reason",
		"summary",
		"assumptions",
	],
	type: "object",
} as const

export class LlmPlanValidationError extends Error {
	readonly path: string

	constructor(path: string, message: string) {
		super(`Invalid LLM plan${path ? ` at ${path}` : ""}: ${message}`)
		this.name = "LlmPlanValidationError"
		this.path = path
	}
}

const CARRIED_STATUSES: ReadonlySet<PlanStepStatus> = new Set([
	"running",
	"completed",
])

const MODEL_STEP_STATUSES: ReadonlySet<PlanStepStatus> = new Set([
	"proposed",
	"postponed",
])

const ACTOR_KINDS: ReadonlySet<ActorKind> = new Set([
	"agent",
	"operator",
	"engineer",
	"harness",
	"integration",
	"system",
])

const ALLOWED_READ_TOOLS = new Set([
	"get_incident_context",
	"get_incident_state",
	"get_service_health",
	"get_recovery_capacity",
])

const ALLOWED_MODEL_TOOLS = new Set([
	"call_engineer",
	"assign_task",
	"execute_recovery",
	"verify_recovery",
	"send_incident_email",
	"publish_status_update",
	...ALLOWED_READ_TOOLS,
])

const MAX_STRING_LENGTH = 4096
const MAX_ARRAY_LENGTH = 512
const MAX_QUESTIONS = 32
const MAX_ASSUMPTIONS = 128

type UnknownRecord = Record<string, unknown>

interface ValidationContext {
	readonly incident: IncidentSnapshot
	readonly services: ReadonlyMap<string, ServiceState>
	readonly resource: ResourceState
	readonly rejectedOrFailed: ReadonlySet<string>
	readonly previousPlan: PlanBuildInput["previousPlan"]
}

interface ParsedStep {
	readonly step: PlanStep
	readonly modelProvided: boolean
}

export function validateLlmPlan(
	value: unknown,
	input: PlanBuildInput,
): PlanDraft {
	const context = createValidationContext(input)
	const rawPlan = record(value, "plan")
	exactKeys(
		rawPlan,
		["priorities", "capacity", "steps", "reason", "summary", "assumptions"],
		"plan",
	)

	const priorities = validatePriorities(rawPlan.priorities, context)
	const assumptions = stringArray(
		rawPlan.assumptions,
		"plan.assumptions",
		MAX_ASSUMPTIONS,
	)
	const capacity = validateCapacity(rawPlan.capacity, context)
	if (
		capacity.assumedCapacity < context.resource.totalCapacity &&
		assumptions.length === 0
	) {
		fail(
			"plan.assumptions",
			"must explain a conservative assumed capacity below the reported total",
		)
	}
	const rawSteps = array(rawPlan.steps, "plan.steps")
	const previousSteps = validatePreviousSteps(input.previousPlan)
	const previousByIdentifier = new Map(
		previousSteps.map((step) => [step.identifier, step]),
	)
	const seenStepIdentifiers = new Set<string>()
	const steps: ParsedStep[] = []

	for (const [index, candidate] of rawSteps.entries()) {
		const path = `plan.steps[${index}]`
		const candidateRecord = record(candidate, path)
		assertStepKeys(candidateRecord, path)
		const candidateIdentifier = nonEmptyString(
			candidateRecord.identifier,
			`${path}.identifier`,
		)
		if (seenStepIdentifiers.has(candidateIdentifier)) {
			fail(path, `duplicate step identifier ${candidateIdentifier}`)
		}
		seenStepIdentifiers.add(candidateIdentifier)

		const previous = previousByIdentifier.get(candidateIdentifier)
		if (previous && CARRIED_STATUSES.has(previous.status)) {
			if (!structurallyEqual(candidateRecord, previous)) {
				fail(
					path,
					"a running or completed step must be copied byte-for-byte from the trusted previous plan",
				)
			}
			steps.push({ modelProvided: true, step: previous })
			continue
		}

		const parsed = parseStep(candidateRecord, path, input)
		validateModelStep(parsed.step, path, context, priorities, input)
		steps.push(parsed)
	}

	// A model is allowed to omit in-flight work from its proposal. The server
	// carries it forward from trusted state instead of trusting model metadata.
	for (const previous of previousSteps) {
		if (
			CARRIED_STATUSES.has(previous.status) &&
			!seenStepIdentifiers.has(previous.identifier)
		) {
			seenStepIdentifiers.add(previous.identifier)
			steps.push({ modelProvided: false, step: previous })
		}
	}

	validateStepOrders(steps.map(({ step }) => step))
	validateDependencyGraph(steps.map(({ step }) => step))
	validateRecoverySteps(steps, priorities, capacity, context, input)

	const reason = nonEmptyString(rawPlan.reason, "plan.reason")
	const summary = nonEmptyString(rawPlan.summary, "plan.summary")
	return {
		assumptions,
		capacity,
		priorities,
		reason,
		steps: steps.map(({ step }) => step),
		summary,
	}
}

function createValidationContext(input: PlanBuildInput): ValidationContext {
	const incident = input.incident
	if (!Array.isArray(incident.services) || incident.services.length === 0) {
		fail("input.incident.services", "at least one service is required")
	}

	const services = new Map<string, ServiceState>()
	for (const [index, service] of incident.services.entries()) {
		if (!service || typeof service.identifier !== "string") {
			fail(`input.incident.services[${index}]`, "invalid service")
		}
		if (!service.identifier.trim() || services.has(service.identifier)) {
			fail(
				`input.incident.services[${index}].identifier`,
				"service identifiers must be non-empty and unique",
			)
		}
		if (
			!Number.isFinite(service.recoveryCapacityUnits) ||
			service.recoveryCapacityUnits < 0
		) {
			fail(
				`input.incident.services[${index}].recoveryCapacityUnits`,
				"must be a finite non-negative number",
			)
		}
		services.set(service.identifier, service)
	}

	for (const [index, service] of incident.services.entries()) {
		for (const dependency of service.dependencies) {
			if (!services.has(dependency)) {
				fail(
					`input.incident.services[${index}].dependencies`,
					`unknown dependency ${dependency}`,
				)
			}
		}
	}

	if (!Array.isArray(incident.resources) || incident.resources.length === 0) {
		fail("input.incident.resources", "at least one resource is required")
	}
	const resourceIdentifiers = new Set<string>()
	for (const [index, resource] of incident.resources.entries()) {
		if (!resource || typeof resource.identifier !== "string") {
			fail(`input.incident.resources[${index}]`, "invalid resource")
		}
		if (
			!resource.identifier.trim() ||
			resourceIdentifiers.has(resource.identifier)
		) {
			fail(
				`input.incident.resources[${index}].identifier`,
				"resource identifiers must be non-empty and unique",
			)
		}
		resourceIdentifiers.add(resource.identifier)
		finiteNonNegative(
			resource.totalCapacity,
			`input.incident.resources[${index}].totalCapacity`,
		)
		finiteNonNegative(
			resource.allocatedCapacity,
			`input.incident.resources[${index}].allocatedCapacity`,
		)
	}

	const resource = incident.resources[0]
	if (input.capacityAssumption) {
		finiteNonNegative(
			input.capacityAssumption.assumedCapacity,
			"input.capacityAssumption.assumedCapacity",
		)
		finiteNonNegative(
			input.capacityAssumption.observations,
			"input.capacityAssumption.observations",
		)
		finiteNonNegative(
			input.capacityAssumption.reportedCapacity,
			"input.capacityAssumption.reportedCapacity",
		)
	}

	const rejectedOrFailed = new Set<string>()
	for (const [kind, constraints] of [
		["rejected", input.rejectedServices],
		["failed", input.failedServices],
	] as const) {
		for (const [index, constraint] of constraints.entries()) {
			if (!services.has(constraint.serviceIdentifier)) {
				fail(
					`input.${kind}Services[${index}].serviceIdentifier`,
					`unknown service ${constraint.serviceIdentifier}`,
				)
			}
			if (!nonEmptyStringOrUndefined(constraint.reason)) {
				fail(
					`input.${kind}Services[${index}].reason`,
					"must be a non-empty string",
				)
			}
			rejectedOrFailed.add(constraint.serviceIdentifier)
		}
	}

	return {
		incident,
		previousPlan: input.previousPlan,
		rejectedOrFailed,
		resource,
		services,
	}
}

function validatePreviousSteps(
	previousPlan: PlanBuildInput["previousPlan"],
): ReadonlyArray<PlanStep> {
	if (!previousPlan) return []
	if (!Array.isArray(previousPlan.steps)) {
		fail("input.previousPlan.steps", "must be an array")
	}
	const identifiers = new Set<string>()
	return previousPlan.steps.map((step, index) => {
		if (!step || typeof step.identifier !== "string") {
			fail(`input.previousPlan.steps[${index}]`, "invalid step")
		}
		if (identifiers.has(step.identifier)) {
			fail(
				`input.previousPlan.steps[${index}].identifier`,
				"must be unique",
			)
		}
		identifiers.add(step.identifier)
		if (CARRIED_STATUSES.has(step.status) && step.updatedAt.length === 0) {
			fail(
				`input.previousPlan.steps[${index}].updatedAt`,
				"must be present on carried steps",
			)
		}
		return step
	})
}

function assertStepKeys(candidate: UnknownRecord, path: string): void {
	exactKeys(
		candidate,
		[
			"identifier",
			"order",
			"title",
			"reason",
			"invocation",
			"owner",
			"serviceIdentifier",
			"capacityUnits",
			"requiresApproval",
			"dependsOn",
			"status",
			"statusReason",
			"toolCallIdentifier",
			"approvalIdentifier",
			"attempts",
			"resultSummary",
			"updatedAt",
		],
		path,
	)
}

function validatePriorities(
	value: unknown,
	context: ValidationContext,
): ReadonlyArray<ServicePriority> {
	const candidates = array(value, "plan.priorities")
	if (candidates.length !== context.services.size) {
		fail(
			"plan.priorities",
			`must contain exactly one entry for each of the ${context.services.size} known services`,
		)
	}

	const identifiers = new Set<string>()
	const ranks = new Set<number>()
	const priorities: ServicePriority[] = []
	for (const [index, candidate] of candidates.entries()) {
		const path = `plan.priorities[${index}]`
		const priority = record(candidate, path)
		exactKeys(
			priority,
			[
				"serviceIdentifier",
				"serviceName",
				"rank",
				"score",
				"businessImpact",
				"capacityUnits",
				"decision",
				"reason",
				"blockedBy",
			],
			path,
		)

		const serviceIdentifier = nonEmptyString(
			priority.serviceIdentifier,
			`${path}.serviceIdentifier`,
		)
		const service = context.services.get(serviceIdentifier)
		if (!service) fail(`${path}.serviceIdentifier`, "unknown service")
		if (identifiers.has(serviceIdentifier)) {
			fail(`${path}.serviceIdentifier`, "must be unique")
		}
		identifiers.add(serviceIdentifier)

		const serviceName = nonEmptyString(
			priority.serviceName,
			`${path}.serviceName`,
		)
		if (serviceName !== service.name) {
			fail(`${path}.serviceName`, "must match the incident service")
		}
		const rank = integer(priority.rank, `${path}.rank`, 1)
		if (ranks.has(rank)) fail(`${path}.rank`, "must be unique")
		ranks.add(rank)
		const score = finiteNonNegativeNumber(priority.score, `${path}.score`)
		const businessImpact = nonEmptyString(
			priority.businessImpact,
			`${path}.businessImpact`,
		)
		if (businessImpact !== service.businessImpact) {
			fail(`${path}.businessImpact`, "must match the incident service")
		}
		const capacityUnits = finiteNonNegativeNumber(
			priority.capacityUnits,
			`${path}.capacityUnits`,
		)
		if (
			capacityUnits !==
			(service.status === "healthy" ? 0 : service.recoveryCapacityUnits)
		) {
			fail(
				`${path}.capacityUnits`,
				"must match the incident service recovery cost",
			)
		}

		const decision = enumValue(
			priority.decision,
			SERVICE_DECISIONS,
			`${path}.decision`,
		)
		const reason = nonEmptyString(priority.reason, `${path}.reason`)
		const blockedBy = stringArray(priority.blockedBy, `${path}.blockedBy`)
		const blockedIdentifiers = new Set<string>()
		for (const blocked of blockedBy) {
			if (!context.services.has(blocked)) {
				fail(`${path}.blockedBy`, `unknown service ${blocked}`)
			}
			if (blocked === serviceIdentifier) {
				fail(
					`${path}.blockedBy`,
					"cannot contain the prioritized service",
				)
			}
			if (blockedIdentifiers.has(blocked)) {
				fail(`${path}.blockedBy`, "must not contain duplicates")
			}
			if (!service.dependencies.includes(blocked)) {
				fail(
					`${path}.blockedBy`,
					`service ${blocked} is not a direct dependency`,
				)
			}
			blockedIdentifiers.add(blocked)
		}

		if (service.status === "healthy") {
			if (decision !== "already-healthy" || blockedBy.length > 0) {
				fail(
					path,
					"healthy services must be marked already-healthy without blockers",
				)
			}
			if (capacityUnits !== 0) {
				fail(
					`${path}.capacityUnits`,
					"healthy services have no recovery cost",
				)
			}
		} else {
			if (decision === "already-healthy") {
				fail(
					path,
					"unhealthy services cannot be marked already-healthy",
				)
			}
			if (context.rejectedOrFailed.has(serviceIdentifier)) {
				const hasTrustedRecovery = hasTrustedExecute(
					context.previousPlan,
					serviceIdentifier,
				)
				if (decision !== "postpone" && !hasTrustedRecovery) {
					fail(
						`${path}.decision`,
						"operator-rejected or terminally failed services cannot be recovered",
					)
				}
			}
			if (decision === "recover-now" && blockedBy.length > 0) {
				fail(`${path}.blockedBy`, "recover-now cannot have blockers")
			}
			if (decision === "waiting-for-dependency") {
				const unhealthyDependencies = service.dependencies.filter(
					(dependency) =>
						context.services.get(dependency)?.status !== "healthy",
				)
				if (
					blockedBy.length === 0 ||
					!sameMembers(blockedBy, unhealthyDependencies)
				) {
					fail(
						`${path}.blockedBy`,
						"waiting-for-dependency must name every unhealthy direct dependency",
					)
				}
			}
		}

		priorities.push({
			blockedBy,
			businessImpact: service.businessImpact,
			capacityUnits,
			decision,
			rank,
			reason,
			score,
			serviceIdentifier,
			serviceName,
		})
	}

	for (let rank = 1; rank <= context.services.size; rank += 1) {
		if (!ranks.has(rank)) {
			fail("plan.priorities", "ranks must be the complete 1..N set")
		}
	}
	return priorities
}

function validateCapacity(
	value: unknown,
	context: ValidationContext,
): CapacityAllocationPlan {
	const capacity = record(value, "plan.capacity")
	exactKeys(
		capacity,
		[
			"resourceIdentifier",
			"totalCapacity",
			"assumedCapacity",
			"plannedUnits",
			"remainingUnits",
			"confirmed",
			"postponedUnits",
		],
		"plan.capacity",
	)
	const resourceIdentifier = nonEmptyString(
		capacity.resourceIdentifier,
		"plan.capacity.resourceIdentifier",
	)
	if (resourceIdentifier !== context.resource.identifier) {
		fail(
			"plan.capacity.resourceIdentifier",
			"must identify the incident's selected backup resource",
		)
	}
	const totalCapacity = finiteNonNegativeNumber(
		capacity.totalCapacity,
		"plan.capacity.totalCapacity",
	)
	if (totalCapacity !== context.resource.totalCapacity) {
		fail("plan.capacity.totalCapacity", "must match the incident resource")
	}
	const assumedCapacity = finiteNonNegativeNumber(
		capacity.assumedCapacity,
		"plan.capacity.assumedCapacity",
	)
	if (assumedCapacity > totalCapacity) {
		fail("plan.capacity.assumedCapacity", "cannot exceed total capacity")
	}
	const plannedUnits = finiteNonNegativeNumber(
		capacity.plannedUnits,
		"plan.capacity.plannedUnits",
	)
	const remainingUnits = finiteNumber(
		capacity.remainingUnits,
		"plan.capacity.remainingUnits",
	)
	const postponedUnits = finiteNonNegativeNumber(
		capacity.postponedUnits,
		"plan.capacity.postponedUnits",
	)
	if (capacity.confirmed !== context.resource.confirmed) {
		fail(
			"plan.capacity.confirmed",
			"must match the incident resource confirmation state",
		)
	}
	if (plannedUnits + remainingUnits !== assumedCapacity) {
		fail(
			"plan.capacity",
			"plannedUnits plus remainingUnits must equal assumedCapacity",
		)
	}
	if (plannedUnits < context.resource.allocatedCapacity) {
		fail(
			"plan.capacity.plannedUnits",
			"cannot be below already allocated capacity",
		)
	}
	return {
		assumedCapacity,
		confirmed: context.resource.confirmed,
		plannedUnits,
		postponedUnits,
		remainingUnits,
		resourceIdentifier,
		totalCapacity,
	}
}

function parseStep(
	value: unknown,
	path: string,
	input: PlanBuildInput,
): ParsedStep {
	const candidate = record(value, path)
	assertStepKeys(candidate, path)

	const step: PlanStep = {
		approvalIdentifier: string(
			candidate.approvalIdentifier,
			`${path}.approvalIdentifier`,
		),
		attempts: integer(candidate.attempts, `${path}.attempts`, 0),
		capacityUnits: finiteNonNegativeNumber(
			candidate.capacityUnits,
			`${path}.capacityUnits`,
		),
		dependsOn: stringArray(candidate.dependsOn, `${path}.dependsOn`),
		identifier: nonEmptyString(candidate.identifier, `${path}.identifier`),
		invocation: parseInvocation(
			candidate.invocation,
			`${path}.invocation`,
			input,
		),
		order: integer(candidate.order, `${path}.order`, 1),
		owner: parseActor(candidate.owner, `${path}.owner`),
		reason: nonEmptyString(candidate.reason, `${path}.reason`),
		requiresApproval: boolean(
			candidate.requiresApproval,
			`${path}.requiresApproval`,
		),
		resultSummary: string(candidate.resultSummary, `${path}.resultSummary`),
		serviceIdentifier: string(
			candidate.serviceIdentifier,
			`${path}.serviceIdentifier`,
		),
		status: enumValue(
			candidate.status,
			PLAN_STEP_STATUSES,
			`${path}.status`,
		),
		statusReason: string(candidate.statusReason, `${path}.statusReason`),
		title: nonEmptyString(candidate.title, `${path}.title`),
		toolCallIdentifier: string(
			candidate.toolCallIdentifier,
			`${path}.toolCallIdentifier`,
		),
		updatedAt: nonEmptyString(candidate.updatedAt, `${path}.updatedAt`),
	}
	return { modelProvided: true, step }
}

function validateModelStep(
	step: PlanStep,
	path: string,
	context: ValidationContext,
	priorities: ReadonlyArray<ServicePriority>,
	input: PlanBuildInput,
): void {
	if (!MODEL_STEP_STATUSES.has(step.status)) {
		fail(
			`${path}.status`,
			"new steps may only be proposed or postponed; execution state is server-owned",
		)
	}
	if (step.attempts !== 0) {
		fail(`${path}.attempts`, "new steps must start with zero attempts")
	}
	if (step.toolCallIdentifier !== "" || step.approvalIdentifier !== "") {
		fail(path, "new steps cannot contain tool-call or approval identifiers")
	}
	if (step.resultSummary !== "") {
		fail(
			`${path}.resultSummary`,
			"new steps cannot claim an execution result",
		)
	}
	if (step.updatedAt !== input.incident.updatedAt) {
		fail(
			`${path}.updatedAt`,
			"new steps must use the current incident timestamp",
		)
	}
	if (!ALLOWED_MODEL_TOOLS.has(step.invocation.name)) {
		fail(`${path}.invocation.name`, "tool is not allowed in a model plan")
	}

	const service = step.serviceIdentifier
	const priority = priorities.find(
		(candidate) => candidate.serviceIdentifier === service,
	)
	const invocationName = step.invocation.name
	const agent = { kind: "agent", name: AGENT_ACTOR_NAME } satisfies Actor

	if (ALLOWED_READ_TOOLS.has(invocationName)) {
		if (service !== "")
			fail(
				`${path}.serviceIdentifier`,
				"read steps are not service-scoped",
			)
		if (step.capacityUnits !== 0 || step.requiresApproval) {
			fail(
				path,
				"read steps cannot allocate capacity or require approval",
			)
		}
		assertActor(step.owner, agent, `${path}.owner`)
		return
	}

	switch (invocationName) {
		case "call_engineer":
			if (service !== "")
				fail(
					`${path}.serviceIdentifier`,
					"engineer calls are not service-scoped",
				)
			assertActor(
				step.owner,
				{ kind: "engineer", name: input.engineer.name },
				`${path}.owner`,
			)
			if (step.capacityUnits !== 0 || step.requiresApproval) {
				fail(
					path,
					"engineer calls cannot allocate capacity or require approval",
				)
			}
			return
		case "assign_task": {
			const assignment = step.invocation.input
			const assignee = knownAssignee(
				assignment.assigneeName,
				assignment.assigneeRole,
				input,
				`${path}.invocation.input`,
			)
			assertActor(
				step.owner,
				{ kind: "engineer", name: assignee.name },
				`${path}.owner`,
			)
			if (assignment.serviceIdentifier !== service) {
				fail(
					`${path}.serviceIdentifier`,
					"must match the assigned task service",
				)
			}
			if (service !== "" && !context.services.has(service)) {
				fail(`${path}.serviceIdentifier`, "unknown service")
			}
			if (step.capacityUnits !== 0 || step.requiresApproval) {
				fail(
					path,
					"tasks cannot allocate recovery capacity or require approval",
				)
			}
			return
		}
		case "execute_recovery": {
			if (!priority || priority.decision !== "recover-now") {
				if (
					step.status !== "postponed" ||
					!priority ||
					priority.decision !== "postpone"
				) {
					fail(
						path,
						"a recovery step must target a recover-now service or be postponed with that decision",
					)
				}
			}
			const recoveryService = knownService(
				context,
				service,
				`${path}.serviceIdentifier`,
			)
			if (recoveryService.status === "healthy") {
				fail(
					`${path}.serviceIdentifier`,
					"healthy services cannot be recovered",
				)
			}
			if (context.rejectedOrFailed.has(service)) {
				fail(
					`${path}.serviceIdentifier`,
					"operator-rejected or terminally failed services cannot be recovered",
				)
			}
			if (
				step.serviceIdentifier !==
				step.invocation.input.serviceIdentifier
			) {
				fail(
					`${path}.serviceIdentifier`,
					"must match the recovery input",
				)
			}
			if (step.capacityUnits !== recoveryService.recoveryCapacityUnits) {
				fail(
					`${path}.capacityUnits`,
					"must match the service recovery cost",
				)
			}
			if (
				recoveryService.recoveryRequiresApproval &&
				!step.requiresApproval
			) {
				fail(
					`${path}.requiresApproval`,
					"a service-mandated approval cannot be disabled",
				)
			}
			assertActor(
				step.owner,
				step.requiresApproval
					? { kind: "operator", name: "Operator" }
					: agent,
				`${path}.owner`,
			)
			return
		}
		case "verify_recovery": {
			if (!priority || priority.decision !== "recover-now") {
				fail(
					`${path}.serviceIdentifier`,
					"verification must target a recover-now service",
				)
			}
			const recoveryService = knownService(
				context,
				service,
				`${path}.serviceIdentifier`,
			)
			if (
				step.serviceIdentifier !==
				step.invocation.input.serviceIdentifier
			) {
				fail(
					`${path}.serviceIdentifier`,
					"must match the verification input",
				)
			}
			if (step.capacityUnits !== 0 || step.requiresApproval) {
				fail(
					path,
					"verification cannot allocate capacity or require approval",
				)
			}
			if (recoveryService.status === "healthy") {
				fail(
					`${path}.serviceIdentifier`,
					"healthy services do not need recovery verification",
				)
			}
			assertActor(step.owner, agent, `${path}.owner`)
			return
		}
		case "send_incident_email":
		case "publish_status_update":
			if (service !== "")
				fail(
					`${path}.serviceIdentifier`,
					"communications are not service-scoped",
				)
			assertActor(step.owner, agent, `${path}.owner`)
			if (step.capacityUnits !== 0 || step.requiresApproval) {
				fail(
					path,
					"communications cannot allocate capacity or require approval",
				)
			}
			return
		default:
			fail(
				`${path}.invocation.name`,
				"tool is not allowed in a model plan",
			)
	}
}

function validateStepOrders(steps: ReadonlyArray<PlanStep>): void {
	const orders = new Set<number>()
	for (const step of steps) {
		if (orders.has(step.order)) {
			fail(`plan.steps.${step.identifier}.order`, "must be unique")
		}
		orders.add(step.order)
	}
}

function validateDependencyGraph(steps: ReadonlyArray<PlanStep>): void {
	const byIdentifier = new Map(steps.map((step) => [step.identifier, step]))
	for (const step of steps) {
		const dependencies = new Set<string>()
		for (const dependency of step.dependsOn) {
			if (dependency === step.identifier) {
				fail(
					`plan.steps.${step.identifier}.dependsOn`,
					"cannot depend on itself",
				)
			}
			if (!byIdentifier.has(dependency)) {
				fail(
					`plan.steps.${step.identifier}.dependsOn`,
					`missing step ${dependency}`,
				)
			}
			if (dependencies.has(dependency)) {
				fail(
					`plan.steps.${step.identifier}.dependsOn`,
					"must not contain duplicates",
				)
			}
			dependencies.add(dependency)
		}
	}

	const visiting = new Set<string>()
	const visited = new Set<string>()
	const visit = (identifier: string): void => {
		if (visiting.has(identifier)) {
			fail("plan.steps", "dependencies must form an acyclic graph")
		}
		if (visited.has(identifier)) return
		visiting.add(identifier)
		for (const dependency of byIdentifier.get(identifier)?.dependsOn ??
			[]) {
			visit(dependency)
		}
		visiting.delete(identifier)
		visited.add(identifier)
	}
	for (const step of steps) visit(step.identifier)

	for (const step of steps) {
		for (const dependency of step.dependsOn) {
			const dependencyStep = byIdentifier.get(dependency)
			if (dependencyStep?.status === "postponed") {
				fail(
					`plan.steps.${step.identifier}.dependsOn`,
					"cannot depend on a postponed step",
				)
			}
			if (dependencyStep && dependencyStep.order >= step.order) {
				fail(
					`plan.steps.${step.identifier}.dependsOn`,
					"dependencies must have an earlier order",
				)
			}
		}
	}
}

function validateRecoverySteps(
	parsedSteps: ReadonlyArray<ParsedStep>,
	priorities: ReadonlyArray<ServicePriority>,
	capacity: CapacityAllocationPlan,
	context: ValidationContext,
	input: PlanBuildInput,
): void {
	const steps = parsedSteps.map(({ step }) => step)
	const byIdentifier = new Map(steps.map((step) => [step.identifier, step]))
	const priorityByService = new Map(
		priorities.map((priority) => [priority.serviceIdentifier, priority]),
	)
	const executeByService = new Map<string, PlanStep>()
	const verifyByService = new Map<string, PlanStep>()
	let newRecoveryUnits = 0

	for (const parsed of parsedSteps) {
		const step = parsed.step
		if (step.invocation.name === "execute_recovery") {
			const serviceIdentifier = step.serviceIdentifier
			if (executeByService.has(serviceIdentifier)) {
				fail(
					`plan.steps.${step.identifier}`,
					"a service may have at most one recovery execution step",
				)
			}
			executeByService.set(serviceIdentifier, step)
			if (
				parsed.modelProvided &&
				step.status === "proposed" &&
				!hasTrustedExecute(input.previousPlan, serviceIdentifier)
			) {
				newRecoveryUnits += step.capacityUnits
			}
		}
	}

	// Build the complete execution index before validating verification steps;
	// the array order is presentation only and is not the dependency order.
	for (const parsed of parsedSteps) {
		const step = parsed.step
		if (step.invocation.name === "verify_recovery") {
			const serviceIdentifier = step.serviceIdentifier
			if (verifyByService.has(serviceIdentifier)) {
				fail(
					`plan.steps.${step.identifier}`,
					"a service may have at most one recovery verification step",
				)
			}
			verifyByService.set(serviceIdentifier, step)
			const execute = executeByService.get(serviceIdentifier)
			if (!execute) {
				fail(
					`plan.steps.${step.identifier}.dependsOn`,
					"verification must have a recovery execution step",
				)
			}
			if (!step.dependsOn.includes(execute.identifier)) {
				fail(
					`plan.steps.${step.identifier}.dependsOn`,
					"verification must depend on its recovery execution",
				)
			}
		}
	}

	for (const priority of priorities) {
		const execute = executeByService.get(priority.serviceIdentifier)
		const verify = verifyByService.get(priority.serviceIdentifier)
		if (priority.decision === "recover-now") {
			if (!execute || !verify) {
				fail(
					`plan.priorities.${priority.serviceIdentifier}`,
					"recover-now services require both execution and verification steps",
				)
			}
			if (
				context.services.get(priority.serviceIdentifier)?.status ===
				"recovering"
			) {
				if (
					!hasTrustedExecute(
						input.previousPlan,
						priority.serviceIdentifier,
					)
				) {
					fail(
						`plan.priorities.${priority.serviceIdentifier}`,
						"a recovering service must have trusted prior execution",
					)
				}
			}
		}
		if (
			priority.decision !== "recover-now" &&
			execute &&
			!isTrustedStep(execute, input.previousPlan)
		) {
			fail(
				`plan.steps.${execute.identifier}`,
				"non-recoverable services cannot have a new recovery execution",
			)
		}
		if (
			priority.decision !== "recover-now" &&
			verify &&
			!isTrustedStep(verify, input.previousPlan)
		) {
			fail(
				`plan.steps.${verify.identifier}`,
				"non-recoverable services cannot have a new recovery verification",
			)
		}
	}

	for (const [serviceIdentifier, execute] of executeByService) {
		const service = knownService(
			context,
			serviceIdentifier,
			`plan.steps.${execute.identifier}`,
		)
		const priority = priorityByService.get(serviceIdentifier)
		if (!priority)
			fail(`plan.steps.${execute.identifier}`, "missing service priority")
		const trustedExecution = isTrustedStep(execute, input.previousPlan)
		// A plan revision cannot undo a dispatch that is already running or
		// completed. Do not re-apply current dependency/approval constraints to
		// that trusted execution; only new dispatches need those checks.
		if (trustedExecution) continue
		if (context.rejectedOrFailed.has(serviceIdentifier)) {
			fail(
				`plan.steps.${execute.identifier}`,
				"operator-rejected or terminally failed services cannot be recovered",
			)
		}
		for (const dependencyIdentifier of service.dependencies) {
			const dependency = context.services.get(dependencyIdentifier)
			if (!dependency || dependency.status === "healthy") continue
			const dependencyPriority =
				priorityByService.get(dependencyIdentifier)
			if (
				!dependencyPriority ||
				dependencyPriority.decision !== "recover-now"
			) {
				fail(
					`plan.steps.${execute.identifier}`,
					`unhealthy dependency ${dependencyIdentifier} must also be recovered first`,
				)
			}
			const dependencyVerify = verifyByService.get(dependencyIdentifier)
			if (!dependencyVerify) {
				fail(
					`plan.steps.${execute.identifier}`,
					`missing verification step for dependency ${dependencyIdentifier}`,
				)
			}
			if (!execute.dependsOn.includes(dependencyVerify.identifier)) {
				fail(
					`plan.steps.${execute.identifier}.dependsOn`,
					`must depend on verification of ${dependencyIdentifier}`,
				)
			}
		}
	}

	for (const [serviceIdentifier, verify] of verifyByService) {
		const execute = executeByService.get(serviceIdentifier)
		if (!execute || !verify.dependsOn.includes(execute.identifier)) {
			fail(
				`plan.steps.${verify.identifier}.dependsOn`,
				"verification must depend on execution",
			)
		}
	}

	const expectedPlannedUnits =
		context.resource.allocatedCapacity + newRecoveryUnits
	if (capacity.plannedUnits !== expectedPlannedUnits) {
		fail(
			"plan.capacity.plannedUnits",
			"must equal allocated capacity plus new recovery allocations",
		)
	}
	const availableForNewWork = Math.max(
		0,
		capacity.assumedCapacity - context.resource.allocatedCapacity,
	)
	if (newRecoveryUnits > availableForNewWork) {
		fail(
			"plan.capacity.plannedUnits",
			"new recovery allocations cannot exceed capacity remaining after committed work",
		)
	}
	const expectedPostponedUnits = priorities
		.filter((priority) => priority.decision === "postpone")
		.reduce((total, priority) => total + priority.capacityUnits, 0)
	if (capacity.postponedUnits !== expectedPostponedUnits) {
		fail(
			"plan.capacity.postponedUnits",
			"must equal the capacity of explicitly postponed services",
		)
	}

	for (const step of steps) {
		if (
			step.invocation.name === "execute_recovery" &&
			step.status === "proposed" &&
			hasTrustedExecute(input.previousPlan, step.serviceIdentifier)
		) {
			fail(
				`plan.steps.${step.identifier}`,
				"cannot reexecute a service with trusted prior execution",
			)
		}
	}

	void byIdentifier
}

function parseInvocation(
	value: unknown,
	path: string,
	input: PlanBuildInput,
): ToolInvocation {
	const invocation = record(value, path)
	exactKeys(invocation, ["name", "input"], path)
	const name = nonEmptyString(invocation.name, `${path}.name`)
	if (!ALLOWED_MODEL_TOOLS.has(name)) {
		fail(`${path}.name`, "tool is not allowed in an LLM plan")
	}
	const toolInput = record(invocation.input, `${path}.input`)

	if (ALLOWED_READ_TOOLS.has(name)) {
		exactKeys(toolInput, [], `${path}.input`)
		return { input: {}, name } as ToolInvocation
	}

	switch (name) {
		case "call_engineer": {
			exactKeys(
				toolInput,
				[
					"engineerName",
					"engineerPhone",
					"engineerRole",
					"purpose",
					"questions",
				],
				`${path}.input`,
			)
			const engineerName = nonEmptyString(
				toolInput.engineerName,
				`${path}.input.engineerName`,
			)
			const engineerPhone = nonEmptyString(
				toolInput.engineerPhone,
				`${path}.input.engineerPhone`,
			)
			const engineerRole = nonEmptyString(
				toolInput.engineerRole,
				`${path}.input.engineerRole`,
			)
			const purpose = nonEmptyString(
				toolInput.purpose,
				`${path}.input.purpose`,
			)
			const questions = parseQuestions(
				toolInput.questions,
				`${path}.input.questions`,
			)
			if (
				engineerName !== input.engineer.name ||
				engineerPhone !== input.engineer.phone ||
				engineerRole !== input.engineer.role
			) {
				fail(
					`${path}.input`,
					"engineer recipient must match the trusted on-call contact",
				)
			}
			return {
				input: {
					engineerName,
					engineerPhone,
					engineerRole,
					purpose,
					questions,
				},
				name,
			} as ToolInvocation
		}
		case "assign_task": {
			exactKeys(
				toolInput,
				[
					"title",
					"description",
					"assigneeName",
					"assigneeRole",
					"priority",
					"serviceIdentifier",
				],
				`${path}.input`,
			)
			const title = nonEmptyString(toolInput.title, `${path}.input.title`)
			const description = nonEmptyString(
				toolInput.description,
				`${path}.input.description`,
			)
			const assigneeName = nonEmptyString(
				toolInput.assigneeName,
				`${path}.input.assigneeName`,
			)
			const assigneeRole = nonEmptyString(
				toolInput.assigneeRole,
				`${path}.input.assigneeRole`,
			)
			const priority = enumValue(
				toolInput.priority,
				["critical", "high", "medium", "low"] as const,
				`${path}.input.priority`,
			)
			const serviceIdentifier = string(
				toolInput.serviceIdentifier,
				`${path}.input.serviceIdentifier`,
			)
			knownAssignee(assigneeName, assigneeRole, input, `${path}.input`)
			return {
				input: {
					assigneeName,
					assigneeRole,
					description,
					priority,
					serviceIdentifier,
					title,
				},
				name,
			} as ToolInvocation
		}
		case "execute_recovery": {
			exactKeys(
				toolInput,
				[
					"serviceIdentifier",
					"actionKind",
					"actionDescription",
					"capacityUnits",
					"resourceIdentifier",
					"approvalIdentifier",
				],
				`${path}.input`,
			)
			const serviceIdentifier = nonEmptyString(
				toolInput.serviceIdentifier,
				`${path}.input.serviceIdentifier`,
			)
			const actionKind = enumValue(
				toolInput.actionKind,
				RECOVERY_ACTION_KINDS,
				`${path}.input.actionKind`,
			)
			const actionDescription = nonEmptyString(
				toolInput.actionDescription,
				`${path}.input.actionDescription`,
			)
			const capacityUnits = finiteNonNegativeNumber(
				toolInput.capacityUnits,
				`${path}.input.capacityUnits`,
			)
			const resourceIdentifier = nonEmptyString(
				toolInput.resourceIdentifier,
				`${path}.input.resourceIdentifier`,
			)
			const approvalIdentifier = string(
				toolInput.approvalIdentifier,
				`${path}.input.approvalIdentifier`,
			)
			if (approvalIdentifier !== "") {
				fail(
					`${path}.input.approvalIdentifier`,
					"approval identifiers are server-owned",
				)
			}
			return {
				input: {
					actionDescription,
					actionKind: actionKind as RecoveryActionKind,
					approvalIdentifier,
					capacityUnits,
					resourceIdentifier,
					serviceIdentifier,
				},
				name,
			} as ToolInvocation
		}
		case "verify_recovery": {
			exactKeys(
				toolInput,
				["serviceIdentifier", "recoveryActionIdentifier"],
				`${path}.input`,
			)
			const serviceIdentifier = nonEmptyString(
				toolInput.serviceIdentifier,
				`${path}.input.serviceIdentifier`,
			)
			const recoveryActionIdentifier = string(
				toolInput.recoveryActionIdentifier,
				`${path}.input.recoveryActionIdentifier`,
			)
			if (recoveryActionIdentifier !== "") {
				fail(
					`${path}.input.recoveryActionIdentifier`,
					"recovery action identifiers are server-owned",
				)
			}
			return {
				input: { recoveryActionIdentifier, serviceIdentifier },
				name,
			} as ToolInvocation
		}
		case "send_incident_email":
		case "publish_status_update":
			exactKeys(toolInput, ["planIdentifier"], `${path}.input`)
			if (
				string(
					toolInput.planIdentifier,
					`${path}.input.planIdentifier`,
				) !== ""
			) {
				fail(
					`${path}.input.planIdentifier`,
					"plan identifiers are server-owned",
				)
			}
			return { input: { planIdentifier: "" }, name } as ToolInvocation
		default:
			fail(`${path}.name`, "tool is not allowed in an LLM plan")
	}
}

function parseQuestions(
	value: unknown,
	path: string,
): ReadonlyArray<{ readonly key: string; readonly question: string }> {
	return array(value, path, MAX_QUESTIONS).map((candidate, index) => {
		const question = record(candidate, `${path}[${index}]`)
		exactKeys(question, ["key", "question"], `${path}[${index}]`)
		return {
			key: nonEmptyString(question.key, `${path}[${index}].key`),
			question: nonEmptyString(
				question.question,
				`${path}[${index}].question`,
			),
		}
	})
}

function knownAssignee(
	name: string,
	role: string,
	input: PlanBuildInput,
	path: string,
): { readonly name: string; readonly role: string } {
	const known = [input.engineer, input.supportContact]
	const assignee = known.find(
		(candidate) => candidate.name === name && candidate.role === role,
	)
	if (!assignee)
		fail(
			path,
			"task recipient must be the trusted engineer or support contact",
		)
	return assignee
}

function knownService(
	context: ValidationContext,
	identifier: string,
	path: string,
): ServiceState {
	const service = context.services.get(identifier)
	if (!service) fail(path, `unknown service ${identifier}`)
	return service
}

function hasTrustedExecute(
	previousPlan: PlanBuildInput["previousPlan"],
	serviceIdentifier: string,
): boolean {
	return Boolean(
		previousPlan?.steps.some(
			(step) =>
				step.serviceIdentifier === serviceIdentifier &&
				step.invocation.name === "execute_recovery" &&
				CARRIED_STATUSES.has(step.status),
		),
	)
}

function isTrustedStep(
	step: PlanStep,
	previousPlan: PlanBuildInput["previousPlan"],
): boolean {
	return Boolean(
		previousPlan?.steps.some(
			(candidate) =>
				candidate.identifier === step.identifier &&
				CARRIED_STATUSES.has(candidate.status) &&
				structurallyEqual(candidate, step),
		),
	)
}

function parseActor(value: unknown, path: string): Actor {
	const actor = record(value, path)
	exactKeys(actor, ["kind", "name"], path)
	const kind = enumValue(
		actor.kind,
		Array.from(ACTOR_KINDS) as [ActorKind, ...ActorKind[]],
		`${path}.kind`,
	)
	return { kind, name: nonEmptyString(actor.name, `${path}.name`) }
}

function assertActor(actual: Actor, expected: Actor, path: string): void {
	if (actual.kind !== expected.kind || actual.name !== expected.name) {
		fail(path, `must be ${expected.kind}:${expected.name}`)
	}
}

function record(value: unknown, path: string): UnknownRecord {
	if (!isPlainRecord(value)) fail(path, "must be a plain object")
	return value
}

function array(
	value: unknown,
	path: string,
	maximum = MAX_ARRAY_LENGTH,
): ReadonlyArray<unknown> {
	if (!Array.isArray(value)) fail(path, "must be an array")
	if (value.length > maximum) {
		fail(path, `must contain at most ${maximum} items`)
	}
	return value
}

function exactKeys(
	value: UnknownRecord,
	expected: ReadonlyArray<string>,
	path: string,
): void {
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	if (
		actual.length !== wanted.length ||
		actual.some((key, index) => key !== wanted[index])
	) {
		fail(path, `must contain exactly these fields: ${wanted.join(", ")}`)
	}
}

function string(value: unknown, path: string): string {
	if (typeof value !== "string") fail(path, "must be a string")
	if (value.length > MAX_STRING_LENGTH) {
		fail(path, `must contain at most ${MAX_STRING_LENGTH} characters`)
	}
	return value
}

function nonEmptyString(value: unknown, path: string): string {
	const result = string(value, path)
	if (!result.trim()) fail(path, "must not be empty")
	return result
}

function nonEmptyStringOrUndefined(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined
}

function stringArray(
	value: unknown,
	path: string,
	maximum = MAX_ARRAY_LENGTH,
): ReadonlyArray<string> {
	return array(value, path, maximum).map((candidate, index) =>
		string(candidate, `${path}[${index}]`),
	)
}

function boolean(value: unknown, path: string): boolean {
	if (typeof value !== "boolean") fail(path, "must be a boolean")
	return value
}

function finiteNumber(value: unknown, path: string): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		fail(path, "must be a finite number")
	}
	return value
}

function finiteNonNegative(value: unknown, path: string): number {
	const result = finiteNumber(value, path)
	if (result < 0) fail(path, "must be non-negative")
	return result
}

function finiteNonNegativeNumber(value: unknown, path: string): number {
	return finiteNonNegative(value, path)
}

function integer(value: unknown, path: string, minimum: number): number {
	if (
		typeof value !== "number" ||
		!Number.isInteger(value) ||
		value < minimum
	) {
		fail(path, `must be an integer greater than or equal to ${minimum}`)
	}
	return value
}

function enumValue<const Values extends ReadonlyArray<string>>(
	value: unknown,
	values: Values,
	path: string,
): Values[number] {
	if (typeof value !== "string" || !values.includes(value)) {
		fail(path, `must be one of: ${values.join(", ")}`)
	}
	return value as Values[number]
}

function isPlainRecord(value: unknown): value is UnknownRecord {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return false
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

function sameMembers(
	left: ReadonlyArray<string>,
	right: ReadonlyArray<string>,
): boolean {
	return (
		left.length === right.length &&
		left.every((value) => right.includes(value))
	)
}

function structurallyEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true
	if (Array.isArray(left) || Array.isArray(right)) {
		if (
			!Array.isArray(left) ||
			!Array.isArray(right) ||
			left.length !== right.length
		)
			return false
		return left.every((value, index) =>
			structurallyEqual(value, right[index]),
		)
	}
	if (isPlainRecord(left) || isPlainRecord(right)) {
		if (!isPlainRecord(left) || !isPlainRecord(right)) return false
		const leftKeys = Object.keys(left).sort()
		const rightKeys = Object.keys(right).sort()
		return (
			leftKeys.length === rightKeys.length &&
			leftKeys.every(
				(key, index) =>
					key === rightKeys[index] &&
					structurallyEqual(left[key], right[key]),
			)
		)
	}
	return false
}

function fail(path: string, message: string): never {
	throw new LlmPlanValidationError(path, message)
}
