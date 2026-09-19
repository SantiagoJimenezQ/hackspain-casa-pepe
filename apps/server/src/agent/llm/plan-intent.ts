import { PlanBuildInput, PlanDraft } from "@agent/types/agent.type"
import { PlanStep, ServicePriority } from "@plans/types/plan.type"
import {
	LlmPlanValidationError,
	llmPlanSchema,
	validateLlmPlan,
} from "./plan-validation"

// Model-owned choices only; operational identity and authority are materialized below.
export interface PlanIntent {
	summary: string
	reason: string
	assumptions: string[]
	resourceIdentifier: string
	assumedCapacity: number
	priorities: Array<
		Pick<
			ServicePriority,
			| "serviceIdentifier"
			| "rank"
			| "score"
			| "decision"
			| "reason"
			| "blockedBy"
		>
	>
	steps: Array<{
		key: string
		tool: string
		serviceIdentifier: string
		title: string
		reason: string
		dependsOn: string[]
		input: Record<string, unknown>
	}>
}
const string = { type: "string" }
const strings = { items: string, type: "array" }
export const planIntentSchema = {
	additionalProperties: false,
	properties: {
		assumedCapacity: { minimum: 0, type: "number" },
		assumptions: strings,
		priorities: {
			items: {
				additionalProperties: false,
				properties: Object.fromEntries(
					Object.entries(
						llmPlanSchema.definitions.priority.properties,
					).filter(
						([key]) =>
							![
								"serviceName",
								"businessImpact",
								"capacityUnits",
							].includes(key),
					),
				),
				required: [
					"serviceIdentifier",
					"rank",
					"score",
					"decision",
					"reason",
					"blockedBy",
				],
				type: "object",
			},
			type: "array",
		},
		reason: string,
		resourceIdentifier: string,
		steps: {
			items: {
				additionalProperties: false,
				properties: {
					dependsOn: strings,
					input: {
						additionalProperties: false,
						properties: {
							assignee: {
								enum: ["engineer", "support"],
								type: "string",
							},
							description: string,
							priority: {
								enum: ["critical", "high", "medium", "low"],
								type: "string",
							},
							purpose: string,
							questions: {
								items: {
									additionalProperties: false,
									properties: {
										key: string,
										question: string,
									},
									required: ["key", "question"],
									type: "object",
								},
								type: "array",
							},
							title: string,
						},
						type: "object",
					},
					key: string,
					reason: string,
					serviceIdentifier: string,
					title: string,
					tool: {
						enum: [
							"call_engineer",
							"execute_recovery",
							"verify_recovery",
							"assign_task",
							"send_incident_email",
							"publish_status_update",
							"get_incident_context",
							"get_service_health",
							"get_recovery_capacity",
							"check_services_status",
						],
						type: "string",
					},
				},
				required: [
					"key",
					"tool",
					"serviceIdentifier",
					"title",
					"reason",
					"dependsOn",
					"input",
				],
				type: "object",
			},
			type: "array",
		},
		summary: string,
	},
	required: [
		"summary",
		"reason",
		"assumptions",
		"resourceIdentifier",
		"assumedCapacity",
		"priorities",
		"steps",
	],
	type: "object",
}
function exact(value: unknown, fields: string[]): Record<string, unknown> {
	if (
		!value ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		Object.keys(value).some((key) => !fields.includes(key))
	)
		throw new LlmPlanValidationError(
			"intent",
			"Unknown or invalid intent fields",
		)
	return value as Record<string, unknown>
}
export function materializePlanIntent(
	value: unknown,
	input: PlanBuildInput,
): { draft: PlanDraft; identifiers: Map<string, string> } {
	const raw = exact(value, Object.keys(planIntentSchema.properties))
	if (!Array.isArray(raw.steps) || !Array.isArray(raw.priorities))
		throw new LlmPlanValidationError(
			"intent",
			"Steps and priorities must be arrays",
		)
	const intent = raw as unknown as PlanIntent
	const resource = input.incident.resources.find(
		(r) => r.identifier === intent.resourceIdentifier,
	)
	if (!resource)
		throw new LlmPlanValidationError("intent", "Unknown resource")
	const service = (id: string) => {
		const found = input.incident.services.find((s) => s.identifier === id)
		if (!found)
			throw new LlmPlanValidationError("intent", "Unknown service")
		return found
	}
	const trusted =
		input.previousPlan?.steps.filter(
			(s) => s.status === "running" || s.status === "completed",
		) ?? []
	const identifiers = new Map<string, string>(
		trusted.map((s) => [s.identifier, s.identifier]),
	)
	const seen = new Set<string>()
	for (const step of intent.steps) {
		exact(step, [
			"key",
			"tool",
			"serviceIdentifier",
			"title",
			"reason",
			"dependsOn",
			"input",
		])
		if (
			typeof step.key !== "string" ||
			!/^[a-zA-Z0-9_-]{1,120}$/.test(step.key) ||
			identifiers.has(step.key) ||
			seen.has(step.key)
		)
			throw new LlmPlanValidationError(
				"intent",
				"Duplicate or invalid action key; omit already dispatched steps",
			)
		seen.add(step.key)
		const suffix =
			step.tool === "execute_recovery"
				? "execute"
				: step.tool === "verify_recovery"
					? "verify"
					: null
		const id = suffix
			? `stp_${step.serviceIdentifier}_${suffix}`
			: step.key.startsWith("stp_")
				? step.key
				: `stp_${step.key}`
		if ([...identifiers.values()].includes(id))
			throw new LlmPlanValidationError(
				"intent",
				"Duplicate action or attempted replacement of dispatched work",
			)
		identifiers.set(step.key, id)
	}
	const steps: PlanStep[] = intent.steps.map((step, index) => {
		const allowed =
			step.tool === "call_engineer"
				? ["purpose", "questions"]
				: step.tool === "assign_task" && step.serviceIdentifier
					? ["assignee", "title", "description", "priority"]
					: []
		const args = exact(step.input, allowed)
		let invocation: unknown = { input: {}, name: step.tool }
		let owner: PlanStep["owner"] = {
			kind: "agent",
			name: "Casa Pepe agent",
		}
		let units = 0,
			approval = false
		if (step.serviceIdentifier) service(step.serviceIdentifier)
		if (step.tool === "execute_recovery") {
			const target = service(step.serviceIdentifier)
			units = target.recoveryCapacityUnits
			approval = target.recoveryRequiresApproval
			if (approval) owner = { kind: "operator", name: "Operator" }
			invocation = {
				input: {
					actionDescription: target.recoveryActionDescription,
					actionKind: target.recoveryActionKind,
					approvalIdentifier: "",
					capacityUnits: units,
					resourceIdentifier: resource.identifier,
					serviceIdentifier: target.identifier,
				},
				name: step.tool,
			}
		} else if (step.tool === "verify_recovery")
			invocation = {
				input: {
					recoveryActionIdentifier: "",
					serviceIdentifier: step.serviceIdentifier,
				},
				name: step.tool,
			}
		else if (step.tool === "call_engineer") {
			owner = { kind: "engineer", name: input.engineer.name }
			invocation = {
				input: {
					...args,
					engineerName: input.engineer.name,
					engineerPhone: input.engineer.phone,
					engineerRole: input.engineer.role,
				},
				name: step.tool,
			}
		} else if (step.tool === "assign_task") {
			if (args.assignee !== "engineer" && args.assignee !== "support")
				throw new LlmPlanValidationError("intent", "Unknown assignee")
			const who =
				args.assignee === "engineer"
					? input.engineer
					: input.supportContact
			owner = { kind: "engineer", name: who.name }
			invocation = {
				input: {
					assigneeName: who.name,
					assigneeRole: who.role,
					description: args.description,
					priority: args.priority,
					serviceIdentifier: step.serviceIdentifier,
					title: args.title,
				},
				name: step.tool,
			}
		} else if (
			["send_incident_email", "publish_status_update"].includes(step.tool)
		)
			invocation = { input: { planIdentifier: "" }, name: step.tool }
		if (!Array.isArray(step.dependsOn))
			throw new LlmPlanValidationError("intent", "Invalid dependencies")
		return {
			approvalIdentifier: "",
			attempts: 0,
			capacityUnits: units,
			dependsOn: step.dependsOn.map((key) => identifiers.get(key) ?? key),
			identifier: identifiers.get(step.key) ?? "",
			invocation: invocation as PlanStep["invocation"],
			order: Math.max(0, ...trusted.map((s) => s.order)) + index + 1,
			owner,
			reason: step.reason,
			requiresApproval: approval,
			resultSummary: "",
			serviceIdentifier: step.serviceIdentifier,
			status: "proposed",
			statusReason: "",
			title: step.title,
			toolCallIdentifier: "",
			updatedAt: input.incident.updatedAt,
		}
	})
	const priorities = intent.priorities.map((priority) => {
		exact(priority, [
			"serviceIdentifier",
			"rank",
			"score",
			"decision",
			"reason",
			"blockedBy",
		])
		const target = service(priority.serviceIdentifier)
		return {
			...priority,
			businessImpact: target.businessImpact,
			capacityUnits:
				target.status === "healthy" ? 0 : target.recoveryCapacityUnits,
			serviceName: target.name,
		}
	})
	const plannedUnits =
		resource.allocatedCapacity +
		steps
			.filter((s) => s.invocation.name === "execute_recovery")
			.reduce((sum, s) => sum + s.capacityUnits, 0)
	const draft = validateLlmPlan(
		{
			assumptions: intent.assumptions,
			capacity: {
				assumedCapacity: intent.assumedCapacity,
				confirmed: resource.confirmed,
				plannedUnits,
				postponedUnits: priorities
					.filter((p) => p.decision === "postpone")
					.reduce((sum, p) => sum + p.capacityUnits, 0),
				remainingUnits: intent.assumedCapacity - plannedUnits,
				resourceIdentifier: resource.identifier,
				totalCapacity: resource.totalCapacity,
			},
			priorities,
			reason: intent.reason,
			steps: [...trusted, ...steps],
			summary: intent.summary,
		},
		input,
	)
	return { draft, identifiers }
}
