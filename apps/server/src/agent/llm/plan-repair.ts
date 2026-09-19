import {
	AGENT_ACTOR_NAME,
	CONTACT_ENGINEER_STEP_IDENTIFIER,
} from "@agent/constants/agent.constant"
import { PlanBuildInput } from "@agent/types/agent.type"
import { Actor } from "@common/types/identity.type"

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
 * trusted state. Business decisions (priorities, which services to recover,
 * questions, reasons) are never touched.
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
	const postponedServices = new Set(
		(Array.isArray(value.priorities) ? value.priorities : [])
			.filter(isRecord)
			.filter((priority) => priority.decision === "postpone")
			.map((priority) => textOf(priority, "serviceIdentifier")),
	)
	const trustedByIdentifier = new Map(
		(input.previousPlan ? input.previousPlan.steps : [])
			.filter((step) => CARRIED_STATUSES.has(step.status))
			.map((step) => [step.identifier, step]),
	)
	const withCall = withEngineerCall(value.steps, input, trustedByIdentifier)
	const repairedSteps = withCall.map((step) => {
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
	const priorities = repairPriorities(value.priorities, servicesByIdentifier)
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
 * Service names and blockers are copies of trusted state, so a revision should not be
 * rejected over their spelling or over listing something that is not a dependency.
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
		const decision = textOf(priority, "decision")
		const blockedBy =
			decision === "recover-now" || decision === "already-healthy"
				? []
				: unhealthy
		// The recovery cost stays the model's to get right: the validator must still catch a
		// plan that miscounts what it is committing.
		return { ...priority, blockedBy, serviceName: service.name }
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
	const resource =
		input.incident.resources.find(
			(candidate) =>
				candidate.identifier === textOf(value, "resourceIdentifier"),
		) ?? input.incident.resources[0]
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
	if (!steps.length) {
		return totals
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
	// Committed work survives a capacity drop: the assumption is never raised past the real
	// total, so remainingUnits is allowed to go negative instead of inventing capacity.
	const assumedCapacity = Math.min(
		numberOrDefault(value, "assumedCapacity", resource.totalCapacity),
		resource.totalCapacity,
	)
	return {
		...totals,
		assumedCapacity,
		plannedUnits,
		remainingUnits: assumedCapacity - plannedUnits,
	}
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
			return {
				...base,
				capacityUnits: service.recoveryCapacityUnits,
				invocation: {
					input: {
						...toolInput,
						actionKind: service.recoveryActionKind,
						approvalIdentifier: "",
						capacityUnits: service.recoveryCapacityUnits,
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
 * incident: the call is the only way to settle them. The scenario briefing already holds the
 * questions, so the step is added rather than rejected, and it runs first because it is
 * asynchronous and nothing else depends on it.
 */
function withEngineerCall(
	steps: ReadonlyArray<unknown>,
	input: PlanBuildInput,
	trustedByIdentifier: ReadonlyMap<string, unknown>,
): ReadonlyArray<unknown> {
	const pendingFacts = input.incident.facts.some(
		(fact) => fact.status === "pending",
	)
	if (!pendingFacts || !input.briefing.questions.length) {
		return steps
	}
	const alreadyCalled = (
		input.previousPlan ? input.previousPlan.steps : []
	).some(
		(step) =>
			step.invocation.name === "call_engineer" &&
			step.status !== "failed",
	)
	const plannedCall = steps
		.filter(isRecord)
		.some(
			(step) =>
				isRecord(step.invocation) &&
				textOf(step.invocation, "name") === "call_engineer",
		)
	if (alreadyCalled || plannedCall) {
		return steps
	}
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
				purpose: input.briefing.purpose,
				questions: input.briefing.questions.map((question) => ({
					key: question.key,
					question: question.question,
				})),
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
