import {
	AGENT_ACTOR_NAME,
	CONTACT_ENGINEER_STEP_IDENTIFIER,
} from "@agent/constants/agent.constant"
import {
	effectiveCapacity,
	stepIdentifierFor,
} from "@agent/helpers/plan-builder.helper"
import { PlanBuildInput } from "@agent/types/agent.type"
import { Actor } from "@common/types/identity.type"
import { selectBackupResource } from "@incidents/helpers/incident-state.helper"
import { BUSINESS_IMPACT_WEIGHTS } from "@scenarios/constants/scenario.constant"

type UnknownRecord = Record<string, unknown>

const READ_STEP_NAMES: ReadonlySet<string> = new Set([
	"get_incident_context",
	"get_incident_state",
	"get_service_health",
	"get_recovery_capacity",
	"check_services_status",
	"prioritize_customers",
])

const COMMUNICATION_STEP_NAMES: ReadonlySet<string> = new Set([
	"send_incident_email",
	"publish_status_update",
])

const AGENT_ACTOR: Actor = { kind: "agent", name: AGENT_ACTOR_NAME }

const OPERATOR_ACTOR: Actor = { kind: "operator", name: "Operator" }

const PERMISSION_QUESTIONS: ReadonlyArray<{
	readonly key: string
	readonly question: string
}> = [
	{
		key: "traffic-failover-authorized",
		question:
			"Do you authorize diverting production traffic to the backup region?",
	},
	{
		key: "notify-all-clients",
		question: "Do you authorize notifying all affected clients?",
	},
]

const CALL_STEP_NAMES: ReadonlySet<string> = new Set([
	"call_engineer",
	"contact_engineer",
])

/** Steps the server owns once dispatched; a revision must carry them unchanged. */
const CARRIED_STATUSES: ReadonlySet<string> = new Set(["running", "completed"])

const PLAN_KEYS: ReadonlyArray<string> = [
	"priorities",
	"capacity",
	"steps",
	"reason",
	"summary",
	"assumptions",
]

const STEP_KEYS: ReadonlyArray<string> = [
	"approvalIdentifier",
	"attempts",
	"capacityUnits",
	"dependsOn",
	"identifier",
	"invocation",
	"order",
	"owner",
	"reason",
	"requiresApproval",
	"resultSummary",
	"serviceIdentifier",
	"status",
	"statusReason",
	"title",
	"toolCallIdentifier",
	"updatedAt",
]

function isRecord(value: unknown): value is UnknownRecord {
	return (
		value !== null &&
		value !== undefined &&
		Object.getPrototypeOf(value) === Object.prototype
	)
}

function isText(value: unknown): value is string {
	return Object.prototype.toString.call(value) === "[object String]"
}

function textOf(record: UnknownRecord, key: string): string {
	const value = record[key]
	return isText(value) ? value : ""
}

/**
 * Repairs the mechanical fields of a model-proposed plan before validation so
 * the model does not spend turns on formatting mistakes: actors, service scope,
 * capacity, approval flags and dependencies on postponed steps are derived from
 * trusted state. A first-cycle stall that skips the engineer call or treats
 * unconfirmed reported capacity as zero is also corrected so recovery can start.
 * After a region fills, the next backup with remaining capacity is selected so
 * recovery continues instead of postponing every remaining service.
 */
export function repairLlmPlanDraft(
	value: unknown,
	input: PlanBuildInput,
): unknown {
	if (!isRecord(value) || !Array.isArray(value.steps)) {
		return value
	}
	// Executed history belongs to the runtime, not the model. Restore matching
	// IDs before either repair pass so cosmetic rewrites cannot block replanning
	// or reset attempts, approvals, results and asynchronous dependencies.
	const carried = new Map(
		(input.previousPlan?.steps ?? [])
			.filter(
				(step) =>
					step.status === "running" || step.status === "completed",
			)
			.map((step) => [step.identifier, step]),
	)
	const servicesByIdentifier = new Map(
		input.incident.services.map((service) => [service.identifier, service]),
	)
	const trustedByIdentifier = new Map(
		(input.previousPlan ? input.previousPlan.steps : [])
			.filter((step) => CARRIED_STATUSES.has(step.status))
			.map((step) => [step.identifier, step]),
	)
	const withCall = withEngineerCall(value.steps, input, trustedByIdentifier)
	const recovered = withRecoverNow(
		value.priorities,
		withCall,
		value.capacity,
		input,
		trustedByIdentifier,
	)
	const postponedServices = new Set(
		(Array.isArray(recovered.priorities) ? recovered.priorities : [])
			.filter(isRecord)
			.filter((priority) => priority.decision === "postpone")
			.map((priority) => textOf(priority, "serviceIdentifier")),
	)
	const repairedSteps = recovered.steps.map((step) => {
		// Dispatched work is server state: the model only has to keep listing it.
		const trusted = isRecord(step)
			? trustedByIdentifier.get(textOf(step, "identifier"))
			: undefined
		if (trusted) {
			return trusted
		}
		return repairStep(step, input, servicesByIdentifier)
	})
	const stepServiceByIdentifier = new Map(
		repairedSteps
			.filter(isRecord)
			.map((step) => [
				textOf(step, "identifier"),
				textOf(step, "serviceIdentifier"),
			]),
	)
	const steps = repairedSteps.map((step) => {
		if (isRecord(step) && carried.has(textOf(step, "identifier")))
			return step
		if (!isRecord(step) || !Array.isArray(step.dependsOn)) {
			return step
		}
		const ownService = textOf(step, "serviceIdentifier")
		const dependsOn = step.dependsOn.filter((dependency) => {
			if (!isText(dependency)) {
				return false
			}
			const targetService = stepServiceByIdentifier.get(dependency)
			if (targetService === undefined) {
				return false
			}
			const targetPostponed = postponedServices.has(targetService)
			return !targetPostponed || postponedServices.has(ownService)
		})
		return { ...step, dependsOn }
	})
	const priorities = repairPriorities(
		recovered.priorities,
		servicesByIdentifier,
	)
	return onlyKeys(
		{
			...value,
			capacity: repairCapacity(
				value.capacity,
				priorities,
				steps,
				trustedByIdentifier,
				input,
			),
			priorities,
			steps: steps.map((step) =>
				isRecord(step) ? onlyKeys(step, STEP_KEYS) : step,
			),
		},
		PLAN_KEYS,
	)
}

function onlyKeys(
	value: UnknownRecord,
	keys: ReadonlyArray<string>,
): UnknownRecord {
	return Object.fromEntries(
		Object.entries(value).filter(([key]) => keys.includes(key)),
	)
}

/**
 * Service names, blockers and recovery costs are copies of trusted state, so a
 * revision should not be rejected over their spelling, listing a non-dependency,
 * or repeating a healthy service's original recovery cost.
 */
function repairPriorities(
	value: unknown,
	servicesByIdentifier: ReadonlyMap<
		string,
		PlanBuildInput["incident"]["services"][number]
	>,
): unknown {
	if (!Array.isArray(value)) {
		return value
	}
	return value.map((priority) => {
		if (!isRecord(priority)) {
			return priority
		}
		const service = servicesByIdentifier.get(
			textOf(priority, "serviceIdentifier"),
		)
		if (!service) {
			return priority
		}
		const unhealthy = service.dependencies.filter(
			(dependency) =>
				servicesByIdentifier.get(dependency)?.status !== "healthy",
		)
		if (service.status === "healthy") {
			return {
				...priority,
				blockedBy: [],
				capacityUnits: 0,
				decision: "already-healthy",
				serviceName: service.name,
			}
		}
		const decision = textOf(priority, "decision")
		const blockedBy =
			decision === "recover-now" || decision === "already-healthy"
				? []
				: unhealthy
		return {
			...priority,
			blockedBy,
			capacityUnits: service.recoveryCapacityUnits,
			serviceName: service.name,
		}
	})
}

/**
 * The capacity block is arithmetic over trusted state and the plan's own decisions, so it is
 * derived here instead of being rejected field by field. Costs come from the incident, never
 * from the model's numbers, and an incomplete or contradictory priority list is left to the
 * validator rather than guessed.
 */
function repairCapacity(
	value: unknown,
	priorities: unknown,
	steps: ReadonlyArray<unknown>,
	trustedByIdentifier: ReadonlyMap<string, unknown>,
	input: PlanBuildInput,
): unknown {
	if (!isRecord(value) || !Array.isArray(priorities)) {
		return value
	}
	const servicesByIdentifier = new Map(
		input.incident.services.map((service) => [service.identifier, service]),
	)
	const seen = new Set<string>()
	let postponedUnits = 0
	const valid = priorities.every((priority) => {
		if (!isRecord(priority)) return false
		const identifier = textOf(priority, "serviceIdentifier")
		const service = servicesByIdentifier.get(identifier)
		if (!service || seen.has(identifier)) return false
		seen.add(identifier)
		if (textOf(priority, "decision") === "postpone") {
			postponedUnits += service.recoveryCapacityUnits
		}
		return true
	})
	if (!valid || seen.size !== servicesByIdentifier.size) {
		return value
	}
	const resource = planningResource(input)
	if (!resource) {
		return { ...value, postponedUnits }
	}
	const totals = {
		...value,
		confirmed: resource.confirmed,
		postponedUnits,
		resourceIdentifier: resource.identifier,
		totalCapacity: resource.totalCapacity,
	}
	const newRecoveryUnits = steps
		.filter(isRecord)
		.filter((step) => !trustedByIdentifier.has(textOf(step, "identifier")))
		.filter((step) => {
			const invocation = step.invocation
			return (
				isRecord(invocation) &&
				textOf(invocation, "name") === "execute_recovery"
			)
		})
		.reduce((total, step) => {
			const service = servicesByIdentifier.get(
				textOf(step, "serviceIdentifier"),
			)
			return total + (service ? service.recoveryCapacityUnits : 0)
		}, 0)
	const plannedUnits = resource.allocatedCapacity + newRecoveryUnits
	const assumedCapacity = resolvedAssumedCapacity(resource, input, value)
	return {
		...totals,
		assumedCapacity,
		plannedUnits,
		remainingUnits: assumedCapacity - plannedUnits,
	}
}

function remainingOf(
	resource: PlanBuildInput["incident"]["resources"][number],
	input: PlanBuildInput,
): number {
	return effectiveCapacity(resource, input) - resource.allocatedCapacity
}

function planningResource(input: PlanBuildInput) {
	return selectBackupResource(input.incident, (candidate) =>
		remainingOf(candidate, input),
	)
}

function resolvedAssumedCapacity(
	resource: PlanBuildInput["incident"]["resources"][number],
	input: PlanBuildInput,
	capacity: unknown,
): number {
	const usable = effectiveCapacity(resource, input)
	const proposedResource = isRecord(capacity)
		? textOf(capacity, "resourceIdentifier")
		: ""
	if (proposedResource.length && proposedResource !== resource.identifier) {
		return usable
	}
	const proposed = isRecord(capacity)
		? numberOrDefault(capacity, "assumedCapacity", usable)
		: usable
	return Math.min(
		proposed === 0 && usable > 0 ? usable : proposed,
		resource.totalCapacity,
	)
}

function numberOrDefault(
	value: UnknownRecord,
	key: string,
	fallback: number,
): number {
	const candidate = value[key]
	return Object.prototype.toString.call(candidate) === "[object Number]" &&
		Number.isFinite(candidate)
		? (candidate as number)
		: fallback
}

function repairStep(
	step: unknown,
	input: PlanBuildInput,
	servicesByIdentifier: ReadonlyMap<
		string,
		PlanBuildInput["incident"]["services"][number]
	>,
): unknown {
	if (!isRecord(step) || !isRecord(step.invocation)) {
		return step
	}
	const name = textOf(step.invocation, "name")
	const toolInput = isRecord(step.invocation.input)
		? step.invocation.input
		: {}
	const defaults: UnknownRecord = {
		approvalIdentifier: "",
		attempts: 0,
		resultSummary: "",
		status: "proposed",
		statusReason: "",
		toolCallIdentifier: "",
		updatedAt: input.incident.updatedAt,
	}
	const base: UnknownRecord = {
		...defaults,
		...step,
		updatedAt: input.incident.updatedAt,
	}

	if (READ_STEP_NAMES.has(name) || COMMUNICATION_STEP_NAMES.has(name)) {
		return {
			...base,
			capacityUnits: 0,
			owner: AGENT_ACTOR,
			requiresApproval: false,
			serviceIdentifier: "",
		}
	}
	switch (name) {
		case "call_engineer":
			return {
				...base,
				capacityUnits: 0,
				owner: { kind: "engineer", name: input.engineer.name },
				requiresApproval: false,
				serviceIdentifier: "",
			}
		case "assign_task": {
			const assignee = trustedAssignee(toolInput, input)
			return {
				...base,
				capacityUnits: 0,
				invocation: {
					input: {
						...toolInput,
						assigneeName: assignee.name,
						assigneeRole: assignee.role,
					},
					name,
				},
				owner: assignee.name.length
					? { kind: "engineer", name: assignee.name }
					: base.owner,
				requiresApproval: false,
				serviceIdentifier: textOf(toolInput, "serviceIdentifier"),
			}
		}
		case "verify_recovery":
			return {
				...base,
				capacityUnits: 0,
				invocation: {
					input: { ...toolInput, recoveryActionIdentifier: "" },
					name,
				},
				owner: AGENT_ACTOR,
				requiresApproval: false,
				serviceIdentifier: textOf(toolInput, "serviceIdentifier"),
			}
		case "execute_recovery": {
			const serviceIdentifier = textOf(toolInput, "serviceIdentifier")
			const service = servicesByIdentifier.get(serviceIdentifier)
			if (!service) {
				return base
			}
			// The scenario decides: a plan cannot add an approval the service does not mandate.
			const requiresApproval = service.recoveryRequiresApproval
			const resource = planningResource(input)
			return {
				...base,
				capacityUnits: service.recoveryCapacityUnits,
				invocation: {
					input: {
						...toolInput,
						actionDescription:
							textOf(toolInput, "actionDescription") ||
							service.recoveryActionDescription,
						actionKind: service.recoveryActionKind,
						approvalIdentifier: "",
						capacityUnits: service.recoveryCapacityUnits,
						resourceIdentifier: resource.identifier,
						serviceIdentifier,
					},
					name,
				},
				owner: requiresApproval ? OPERATOR_ACTOR : AGENT_ACTOR,
				requiresApproval,
				serviceIdentifier,
			}
		}
		default:
			return base
	}
}

/**
 * A task recipient is a copy of trusted configuration, and the validator demands the exact
 * name and role pair. The model often translates the role or writes the title it read in the
 * briefing, so the pair is restored from the configured contact the name points at. A name
 * that matches neither contact is left untouched: inventing a recipient is a real mistake and
 * the validator must still reject it.
 */
function trustedAssignee(
	toolInput: UnknownRecord,
	input: PlanBuildInput,
): { readonly name: string; readonly role: string } {
	const name = textOf(toolInput, "assigneeName")
	const contact = [input.engineer, input.supportContact].find(
		(candidate) =>
			candidate.name.trim().toLowerCase() === name.trim().toLowerCase(),
	)
	if (contact) {
		return { name: contact.name, role: contact.role }
	}
	return { name, role: textOf(toolInput, "assigneeRole") }
}

/**
 * A plan that leaves facts unconfirmed without calling the on-call engineer strands the
 * incident. Briefing questions are preferred; when they are missing, a permission question
 * still satisfies the nonempty-question contract so a live permissions-only call can start.
 */
function withEngineerCall(
	steps: ReadonlyArray<unknown>,
	input: PlanBuildInput,
	trustedByIdentifier: ReadonlyMap<string, unknown>,
): ReadonlyArray<unknown> {
	const pendingFacts = input.incident.facts.some(
		(fact) => fact.status === "pending",
	)
	if (!pendingFacts) {
		return steps
	}
	const alreadyCalled = (
		input.previousPlan ? input.previousPlan.steps : []
	).some(
		(step) =>
			CALL_STEP_NAMES.has(step.invocation.name) &&
			step.status !== "failed",
	)
	const plannedCall = steps
		.filter(isRecord)
		.some(
			(step) =>
				isRecord(step.invocation) &&
				CALL_STEP_NAMES.has(textOf(step.invocation, "name")),
		)
	if (alreadyCalled || plannedCall) {
		return steps
	}
	const questions = input.briefing.questions.length
		? input.briefing.questions.map((question) => ({
				key: question.key,
				question: question.question,
			}))
		: PERMISSION_QUESTIONS
	const call = {
		approvalIdentifier: "",
		attempts: 0,
		capacityUnits: 0,
		dependsOn: [],
		identifier: CONTACT_ENGINEER_STEP_IDENTIFIER,
		invocation: {
			input: {
				engineerName: input.engineer.name,
				engineerPhone: input.engineer.phone,
				engineerRole: input.engineer.role,
				purpose:
					input.briefing.purpose ||
					"Request permission to notify affected clients and divert traffic to backup",
				questions,
			},
			name: "call_engineer",
		},
		order: 1,
		owner: { kind: "engineer", name: input.engineer.name },
		reason: "Settle the pending facts with the on-call engineer before committing capacity",
		requiresApproval: false,
		resultSummary: "",
		serviceIdentifier: "",
		status: "proposed",
		statusReason: "",
		title: `Call ${input.engineer.name} to confirm the pending facts`,
		toolCallIdentifier: "",
		updatedAt: input.incident.updatedAt,
	}
	const rest = steps.filter(
		(step) =>
			!isRecord(step) ||
			!trustedByIdentifier.has(textOf(step, "identifier")),
	)
	const trusted = steps.filter(
		(step) =>
			isRecord(step) &&
			trustedByIdentifier.has(textOf(step, "identifier")),
	)
	return [...trusted, call, ...rest].map((step, index) =>
		isRecord(step) ? { ...step, order: index + 1 } : step,
	)
}

type IncidentService = PlanBuildInput["incident"]["services"][number]
type IncidentResource = PlanBuildInput["incident"]["resources"][number]

function isExecuteForService(
	step: unknown,
	serviceIdentifier: string,
	executeIdentifier: string,
): boolean {
	if (!isRecord(step) || !isRecord(step.invocation)) {
		return false
	}
	if (textOf(step.invocation, "name") !== "execute_recovery") {
		return false
	}
	return (
		textOf(step, "identifier") === executeIdentifier ||
		textOf(step, "serviceIdentifier") === serviceIdentifier ||
		(isRecord(step.invocation.input) &&
			textOf(step.invocation.input, "serviceIdentifier") ===
				serviceIdentifier)
	)
}

function hasExecuteRecovery(
	steps: ReadonlyArray<unknown>,
	serviceIdentifier: string,
	trustedByIdentifier: ReadonlyMap<string, unknown>,
): boolean {
	const executeIdentifier = stepIdentifierFor(serviceIdentifier, "execute")
	if (trustedByIdentifier.has(executeIdentifier)) {
		return true
	}
	return steps.some((step) =>
		isExecuteForService(step, serviceIdentifier, executeIdentifier),
	)
}

function committedNewRecoveryUnits(
	steps: ReadonlyArray<unknown>,
	servicesByIdentifier: ReadonlyMap<string, IncidentService>,
	trustedByIdentifier: ReadonlyMap<string, unknown>,
): number {
	return steps
		.filter(isRecord)
		.filter((step) => !trustedByIdentifier.has(textOf(step, "identifier")))
		.reduce((total, step) => {
			const serviceIdentifier = isRecord(step.invocation)
				? isRecord(step.invocation.input)
					? textOf(step.invocation.input, "serviceIdentifier")
					: textOf(step, "serviceIdentifier")
				: textOf(step, "serviceIdentifier")
			if (
				!isExecuteForService(
					step,
					serviceIdentifier,
					stepIdentifierFor(serviceIdentifier, "execute"),
				)
			) {
				return total
			}
			const service = servicesByIdentifier.get(serviceIdentifier)
			return total + (service ? service.recoveryCapacityUnits : 0)
		}, 0)
}

function unhealthyDependenciesOf(
	service: IncidentService,
	servicesByIdentifier: ReadonlyMap<string, IncidentService>,
): string[] {
	return service.dependencies.filter(
		(dependency) =>
			servicesByIdentifier.get(dependency)?.status !== "healthy",
	)
}

function demoteRecoverNow(
	priority: UnknownRecord,
	kind: "waiting" | "postpone",
	blockedBy: ReadonlyArray<string>,
): UnknownRecord {
	return {
		...priority,
		blockedBy: kind === "waiting" ? [...blockedBy] : [],
		decision: kind === "waiting" ? "waiting-for-dependency" : "postpone",
	}
}

function recoveryPair(
	service: IncidentService,
	resource: IncidentResource,
	input: PlanBuildInput,
) {
	const executeIdentifier = stepIdentifierFor(service.identifier, "execute")
	const execute = {
		approvalIdentifier: "",
		attempts: 0,
		capacityUnits: service.recoveryCapacityUnits,
		dependsOn: [],
		identifier: executeIdentifier,
		invocation: {
			input: {
				actionDescription: service.recoveryActionDescription,
				actionKind: service.recoveryActionKind,
				approvalIdentifier: "",
				capacityUnits: service.recoveryCapacityUnits,
				resourceIdentifier: resource.identifier,
				serviceIdentifier: service.identifier,
			},
			name: "execute_recovery",
		},
		order: 0,
		owner: service.recoveryRequiresApproval ? OPERATOR_ACTOR : AGENT_ACTOR,
		reason: "Recover the highest-impact service that fits remaining capacity",
		requiresApproval: service.recoveryRequiresApproval,
		resultSummary: "",
		serviceIdentifier: service.identifier,
		status: "proposed",
		statusReason: "",
		title: `Recover ${service.name}`,
		toolCallIdentifier: "",
		updatedAt: input.incident.updatedAt,
	}
	const verify = {
		approvalIdentifier: "",
		attempts: 0,
		capacityUnits: 0,
		dependsOn: [executeIdentifier],
		identifier: stepIdentifierFor(service.identifier, "verify"),
		invocation: {
			input: {
				recoveryActionIdentifier: "",
				serviceIdentifier: service.identifier,
			},
			name: "verify_recovery",
		},
		order: 0,
		owner: AGENT_ACTOR,
		reason: "Verify the recovery before depending on it",
		requiresApproval: false,
		resultSummary: "",
		serviceIdentifier: service.identifier,
		status: "proposed",
		statusReason: "",
		title: `Verify ${service.name}`,
		toolCallIdentifier: "",
		updatedAt: input.incident.updatedAt,
	}
	return { execute, verify }
}

function insertRecoverySteps(
	steps: ReadonlyArray<unknown>,
	services: ReadonlyArray<IncidentService>,
	resource: IncidentResource,
	input: PlanBuildInput,
	trustedByIdentifier: ReadonlyMap<string, unknown>,
): ReadonlyArray<unknown> {
	if (!services.length) {
		return steps
	}
	const previousHadCall = (input.previousPlan?.steps ?? []).some(
		(step) =>
			CALL_STEP_NAMES.has(step.invocation.name) &&
			step.status !== "failed",
	)
	const maxCarriedOrder = Math.max(
		0,
		...(input.previousPlan?.steps ?? [])
			.filter((step) => CARRIED_STATUSES.has(step.status))
			.map((step) => step.order),
	)
	const injected: UnknownRecord[] = []
	let order = maxCarriedOrder
	for (const service of services) {
		const pair = recoveryPair(service, resource, input)
		injected.push({ ...pair.execute, order: ++order })
		injected.push({ ...pair.verify, order: ++order })
	}
	if (!previousHadCall) {
		return [...steps, ...injected].map((step, index) =>
			isRecord(step) ? { ...step, order: index + 1 } : step,
		)
	}
	const trusted = steps.filter(
		(step) =>
			isRecord(step) &&
			trustedByIdentifier.has(textOf(step, "identifier")),
	)
	const rest = steps.filter(
		(step) =>
			!isRecord(step) ||
			!trustedByIdentifier.has(textOf(step, "identifier")),
	)
	const restRenumbered = rest.map((step, index) =>
		isRecord(step) ? { ...step, order: order + 1 + index } : step,
	)
	return [...trusted, ...injected, ...restRenumbered]
}

/**
 * Recover-now must match execute/verify steps. Extra recover-now rows without
 * steps are demoted when they cannot fit; otherwise their steps are injected.
 * If nothing is recover-now, promote the highest-impact service that still fits.
 */
function withRecoverNow(
	priorities: unknown,
	steps: ReadonlyArray<unknown>,
	capacity: unknown,
	input: PlanBuildInput,
	trustedByIdentifier: ReadonlyMap<string, unknown>,
): { priorities: unknown; steps: ReadonlyArray<unknown> } {
	if (!Array.isArray(priorities)) {
		return { priorities, steps }
	}
	const servicesByIdentifier = new Map(
		input.incident.services.map((service) => [service.identifier, service]),
	)
	const seen = new Set<string>()
	const records = priorities.filter(isRecord)
	const complete =
		records.length === priorities.length &&
		records.every((priority) => {
			const identifier = textOf(priority, "serviceIdentifier")
			if (
				!identifier ||
				!servicesByIdentifier.has(identifier) ||
				seen.has(identifier)
			) {
				return false
			}
			seen.add(identifier)
			return true
		}) &&
		seen.size === servicesByIdentifier.size
	if (!complete) {
		return { priorities, steps }
	}
	const blocked = new Set([
		...input.rejectedServices.map((item) => item.serviceIdentifier),
		...input.failedServices.map((item) => item.serviceIdentifier),
	])
	const resource = planningResource(input)
	let remaining =
		resolvedAssumedCapacity(resource, input, capacity) -
		resource.allocatedCapacity -
		committedNewRecoveryUnits(
			steps,
			servicesByIdentifier,
			trustedByIdentifier,
		)
	const toInject: IncidentService[] = []
	const eligibleIncomplete: IncidentService[] = []

	function outcomeOf(
		service: IncidentService,
	): "keep" | "waiting" | "postpone" {
		if (blocked.has(service.identifier)) {
			return "postpone"
		}
		if (service.status === "healthy" || service.status === "recovering") {
			return "keep"
		}
		const waiting = unhealthyDependenciesOf(service, servicesByIdentifier)
		if (waiting.length) {
			return "waiting"
		}
		if (service.recoveryCapacityUnits > remaining) {
			return "postpone"
		}
		return "keep"
	}

	const nextPriorities = records.map((priority) => {
		const service = servicesByIdentifier.get(
			textOf(priority, "serviceIdentifier"),
		)
		if (
			!service ||
			textOf(priority, "decision") !== "recover-now" ||
			service.status === "healthy" ||
			service.status === "recovering"
		) {
			return priority
		}
		const planned = hasExecuteRecovery(
			steps,
			service.identifier,
			trustedByIdentifier,
		)
		if (planned) {
			return priority
		}
		const outcome = outcomeOf(service)
		if (outcome === "keep") {
			eligibleIncomplete.push(service)
			return priority
		}
		return demoteRecoverNow(
			priority,
			outcome,
			unhealthyDependenciesOf(service, servicesByIdentifier),
		)
	})

	for (const service of [...eligibleIncomplete].sort(
		(left, right) =>
			BUSINESS_IMPACT_WEIGHTS[right.businessImpact] -
			BUSINESS_IMPACT_WEIGHTS[left.businessImpact],
	)) {
		if (service.recoveryCapacityUnits > remaining) {
			const index = nextPriorities.findIndex(
				(priority) =>
					isRecord(priority) &&
					textOf(priority, "serviceIdentifier") ===
						service.identifier,
			)
			if (index >= 0 && isRecord(nextPriorities[index])) {
				nextPriorities[index] = demoteRecoverNow(
					nextPriorities[index],
					"postpone",
					[],
				)
			}
			continue
		}
		remaining -= service.recoveryCapacityUnits
		toInject.push(service)
	}

	const hasUnhealthyRecoverNow = nextPriorities.some((priority) => {
		if (!isRecord(priority)) {
			return false
		}
		const service = servicesByIdentifier.get(
			textOf(priority, "serviceIdentifier"),
		)
		return (
			textOf(priority, "decision") === "recover-now" &&
			service !== undefined &&
			service.status !== "healthy"
		)
	})
	if (!hasUnhealthyRecoverNow) {
		const candidate = records
			.map((priority) => {
				const service = servicesByIdentifier.get(
					textOf(priority, "serviceIdentifier"),
				)
				if (!service || blocked.has(service.identifier)) {
					return null
				}
				if (
					service.status === "healthy" ||
					service.status === "recovering"
				) {
					return null
				}
				if (
					unhealthyDependenciesOf(service, servicesByIdentifier)
						.length
				) {
					return null
				}
				if (service.recoveryCapacityUnits > remaining) {
					return null
				}
				return service
			})
			.filter((service): service is IncidentService => service !== null)
			.sort(
				(left, right) =>
					BUSINESS_IMPACT_WEIGHTS[right.businessImpact] -
					BUSINESS_IMPACT_WEIGHTS[left.businessImpact],
			)[0]
		if (candidate) {
			if (
				!hasExecuteRecovery(
					steps,
					candidate.identifier,
					trustedByIdentifier,
				)
			) {
				remaining -= candidate.recoveryCapacityUnits
				toInject.push(candidate)
			}
			const index = nextPriorities.findIndex(
				(priority) =>
					isRecord(priority) &&
					textOf(priority, "serviceIdentifier") ===
						candidate.identifier,
			)
			if (index >= 0 && isRecord(nextPriorities[index])) {
				nextPriorities[index] = {
					...nextPriorities[index],
					blockedBy: [],
					decision: "recover-now",
					reason:
						textOf(nextPriorities[index], "reason") ||
						"Highest-impact service that fits remaining reported capacity",
				}
			}
		}
	}

	return {
		priorities: nextPriorities,
		steps: insertRecoverySteps(
			steps,
			toInject,
			resource,
			input,
			trustedByIdentifier,
		),
	}
}
