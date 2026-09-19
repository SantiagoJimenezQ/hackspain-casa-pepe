import { AGENT_ACTOR_NAME } from "@agent/constants/agent.constant"
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
	const servicesByIdentifier = new Map(
		input.incident.services.map((service) => [service.identifier, service]),
	)
	const postponedServices = new Set(
		(Array.isArray(value.priorities) ? value.priorities : [])
			.filter(isRecord)
			.filter((priority) => priority.decision === "postponed")
			.map((priority) => textOf(priority, "serviceIdentifier")),
	)
	const repairedSteps = value.steps.map((step) =>
		repairStep(step, input, servicesByIdentifier),
	)
	const stepServiceByIdentifier = new Map(
		repairedSteps
			.filter(isRecord)
			.map((step) => [
				textOf(step, "identifier"),
				textOf(step, "serviceIdentifier"),
			]),
	)
	const steps = repairedSteps.map((step) => {
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
	return { ...value, steps }
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
	const base: UnknownRecord = { ...defaults, ...step }

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
			const assigneeName = textOf(toolInput, "assigneeName")
			return {
				...base,
				capacityUnits: 0,
				owner: assigneeName.length
					? { kind: "engineer", name: assigneeName }
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
			const requiresApproval =
				service.recoveryRequiresApproval ||
				base.requiresApproval === true
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
