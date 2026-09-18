import {
	AGENT_ACTOR_NAME,
	CONTACT_ENGINEER_STEP_IDENTIFIER,
	DEPENDENT_SERVICE_SCORE_BONUS,
	STEP_IDENTIFIER_PREFIX,
	SUPPORT_COMMUNICATION_STEP_IDENTIFIER,
} from "@agent/constants/agent.constant"
import {
	PlanBuildInput,
	PlanDraft,
	ServiceConstraint,
} from "@agent/types/agent.type"
import { sumBy, uniqueValues } from "@common/helpers/collection.helper"
import { Actor } from "@common/types/identity.type"
import { remainingCapacity } from "@incidents/helpers/incident-state.helper"
import { IncidentSnapshot, ServiceState } from "@incidents/types/incident.type"
import {
	PlanStep,
	PlanStepStatus,
	ServiceDecisionKind,
	ServicePriority,
} from "@plans/types/plan.type"
import { BUSINESS_IMPACT_WEIGHTS } from "@scenarios/constants/scenario.constant"
import { ToolInvocation } from "@tools/types/tool.type"

type StepKind = "task" | "execute" | "verify"

interface ScoredService {
	readonly service: ServiceState
	readonly score: number
	readonly dependents: number
}

interface DecisionOutcome {
	readonly decision: ServiceDecisionKind
	readonly reason: string
	readonly blockedBy: ReadonlyArray<string>
}

const AGENT_ACTOR: Actor = { kind: "agent", name: AGENT_ACTOR_NAME }

const CARRIED_STATUSES: ReadonlyArray<PlanStepStatus> = ["running", "completed"]

export function stepIdentifierFor(
	serviceIdentifier: string,
	kind: StepKind,
): string {
	return `${STEP_IDENTIFIER_PREFIX}_${serviceIdentifier}_${kind}`
}

export function buildPlanDraft(input: PlanBuildInput): PlanDraft {
	const { incident, previousPlan } = input
	const timestamp = incident.updatedAt
	const servicesByIdentifier = new Map(
		incident.services.map((service) => [service.identifier, service]),
	)
	const unhealthy = incident.services.filter(
		(service) => service.status !== "healthy",
	)
	const scored = scoreServices(unhealthy, incident)
	const constraints = new Map<string, ServiceConstraint>([
		...input.rejectedServices.map(
			(constraint): [string, ServiceConstraint] => [
				constraint.serviceIdentifier,
				constraint,
			],
		),
		...input.failedServices.map(
			(constraint): [string, ServiceConstraint] => [
				constraint.serviceIdentifier,
				constraint,
			],
		),
	])
	const resource = incident.resources[0]
	const previousSteps = new Map(
		(previousPlan ? previousPlan.steps : []).map((step) => [
			step.identifier,
			step,
		]),
	)

	const alreadyAllocated = new Set<string>()
	for (const service of unhealthy) {
		const executeStep = previousSteps.get(
			stepIdentifierFor(service.identifier, "execute"),
		)
		if (executeStep && CARRIED_STATUSES.includes(executeStep.status)) {
			alreadyAllocated.add(service.identifier)
		}
		if (service.status === "recovering") {
			alreadyAllocated.add(service.identifier)
		}
	}

	let remaining = remainingCapacity(resource)
	const selected = new Set<string>(alreadyAllocated)
	const decisions = new Map<string, DecisionOutcome>()
	let postponedUnits = 0

	for (const { service } of scored) {
		if (decisions.has(service.identifier)) {
			continue
		}
		const constraint = constraints.get(service.identifier)
		if (constraint) {
			decisions.set(service.identifier, {
				blockedBy: [],
				decision: "postpone",
				reason: constraint.reason,
			})
			postponedUnits += service.recoveryCapacityUnits
			continue
		}
		const unhealthyDependencies = service.dependencies.filter(
			(dependencyIdentifier) => {
				const dependency =
					servicesByIdentifier.get(dependencyIdentifier)
				if (!dependency) {
					return false
				}
				return dependency.status !== "healthy"
			},
		)
		if (service.status === "degraded" && unhealthyDependencies.length) {
			decisions.set(service.identifier, {
				blockedBy: unhealthyDependencies,
				decision: "waiting-for-dependency",
				reason: `Degraded only because ${unhealthyDependencies.join(", ")} ${unhealthyDependencies.length === 1 ? "is" : "are"} down. It recovers on its own once they are back`,
			})
			continue
		}
		if (selected.has(service.identifier)) {
			decisions.set(service.identifier, {
				blockedBy: [],
				decision: "recover-now",
				reason: "Recovery already in progress with capacity reserved",
			})
			continue
		}
		const chain = unhealthyDependencies.filter(
			(dependencyIdentifier) => !selected.has(dependencyIdentifier),
		)
		const blockedChain = chain.filter((dependencyIdentifier) =>
			constraints.has(dependencyIdentifier),
		)
		if (blockedChain.length) {
			decisions.set(service.identifier, {
				blockedBy: blockedChain,
				decision: "postpone",
				reason: `Depends on ${blockedChain.join(", ")}, which cannot be recovered right now`,
			})
			postponedUnits += service.recoveryCapacityUnits
			continue
		}
		const chainUnits = sumBy(chain, (dependencyIdentifier) => {
			const dependency = servicesByIdentifier.get(dependencyIdentifier)
			return dependency ? dependency.recoveryCapacityUnits : 0
		})
		const neededUnits = service.recoveryCapacityUnits + chainUnits
		if (neededUnits > remaining) {
			decisions.set(service.identifier, {
				blockedBy: chain,
				decision: "postpone",
				reason: `Needs ${neededUnits} ${resource.unit} (${service.recoveryCapacityUnits} own${chain.length ? ` plus ${chainUnits} for ${chain.join(", ")}` : ""}) but only ${remaining} remain in ${resource.region}`,
			})
			postponedUnits += service.recoveryCapacityUnits
			continue
		}
		for (const dependencyIdentifier of chain) {
			const dependency = servicesByIdentifier.get(dependencyIdentifier)
			if (!dependency) {
				continue
			}
			selected.add(dependencyIdentifier)
			remaining -= dependency.recoveryCapacityUnits
			decisions.set(dependencyIdentifier, {
				blockedBy: [],
				decision: "recover-now",
				reason: `${dependency.businessImpact} impact and required by ${service.name}. Uses ${dependency.recoveryCapacityUnits} ${resource.unit}`,
			})
		}
		selected.add(service.identifier)
		remaining -= service.recoveryCapacityUnits
		decisions.set(service.identifier, {
			blockedBy: [],
			decision: "recover-now",
			reason: `${service.businessImpact} impact: ${service.impactDescription}. Uses ${service.recoveryCapacityUnits} ${resource.unit}`,
		})
	}

	const priorities = buildPriorities(scored, incident, decisions)
	const rankByService = new Map(
		priorities.map((priority) => [
			priority.serviceIdentifier,
			priority.rank,
		]),
	)
	const recoverNow = orderByDependencies(
		priorities
			.filter((priority) => priority.decision === "recover-now")
			.map((priority) => priority.serviceIdentifier),
		servicesByIdentifier,
		rankByService,
	)
	const postponed = priorities.filter(
		(priority) => priority.decision === "postpone",
	)

	const steps: PlanStep[] = []
	const factsPending = incident.facts.some(
		(fact) => fact.status === "pending",
	)
	const previousContact = previousSteps.get(CONTACT_ENGINEER_STEP_IDENTIFIER)
	if (previousContact) {
		steps.push(
			carryOrReset(previousContact, input.maximumStepAttempts, timestamp),
		)
	} else if (factsPending) {
		steps.push(
			createStep(
				CONTACT_ENGINEER_STEP_IDENTIFIER,
				"Call the on-call engineer to confirm the backup region facts",
				input.briefing.purpose,
				{
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
					name: "contact_engineer",
				},
				{ kind: "engineer", name: input.engineer.name },
				"",
				0,
				false,
				[],
				timestamp,
			),
		)
	}

	for (const serviceIdentifier of recoverNow) {
		const service = servicesByIdentifier.get(serviceIdentifier)
		if (!service) {
			continue
		}
		const taskIdentifier = stepIdentifierFor(serviceIdentifier, "task")
		const executeIdentifier = stepIdentifierFor(
			serviceIdentifier,
			"execute",
		)
		const verifyIdentifier = stepIdentifierFor(serviceIdentifier, "verify")
		const dependencyVerifySteps = service.dependencies
			.filter((dependencyIdentifier) =>
				recoverNow.includes(dependencyIdentifier),
			)
			.map((dependencyIdentifier) =>
				stepIdentifierFor(dependencyIdentifier, "verify"),
			)
		const position = recoverNow.indexOf(serviceIdentifier)
		const previousServiceVerifySteps =
			position > 0
				? [stepIdentifierFor(recoverNow[position - 1], "verify")]
				: []
		const executeDependencies = uniqueValues([
			...(steps.some(
				(step) => step.identifier === CONTACT_ENGINEER_STEP_IDENTIFIER,
			)
				? [CONTACT_ENGINEER_STEP_IDENTIFIER]
				: []),
			...previousServiceVerifySteps,
			...dependencyVerifySteps,
		])

		steps.push(
			carryOrCreate(
				previousSteps.get(taskIdentifier),
				input.maximumStepAttempts,
				timestamp,
				() =>
					createStep(
						taskIdentifier,
						`Prepare ${service.name} for recovery in ${incident.backupRegion}`,
						`${service.name} is prioritized: ${reasonFor(decisions, serviceIdentifier)}`,
						{
							input: {
								assigneeName: input.engineer.name,
								assigneeRole: input.engineer.role,
								description: `${service.recoveryActionDescription}. Confirm prerequisites and report blockers before the action is executed.`,
								priority: service.businessImpact,
								serviceIdentifier,
								title: `Prepare ${service.name} recovery`,
							},
							name: "assign_task",
						},
						{ kind: "engineer", name: input.engineer.name },
						serviceIdentifier,
						0,
						false,
						[],
						timestamp,
					),
			),
		)
		steps.push(
			carryOrCreate(
				previousSteps.get(executeIdentifier),
				input.maximumStepAttempts,
				timestamp,
				() =>
					createStep(
						executeIdentifier,
						service.recoveryActionDescription,
						reasonFor(decisions, serviceIdentifier),
						{
							input: {
								actionDescription:
									service.recoveryActionDescription,
								actionKind: service.recoveryActionKind,
								approvalIdentifier: "",
								capacityUnits: service.recoveryCapacityUnits,
								resourceIdentifier: resource.identifier,
								serviceIdentifier,
							},
							name: "execute_recovery",
						},
						service.recoveryRequiresApproval
							? { kind: "operator", name: "Operator" }
							: AGENT_ACTOR,
						serviceIdentifier,
						service.recoveryCapacityUnits,
						service.recoveryRequiresApproval,
						executeDependencies,
						timestamp,
					),
			),
		)
		steps.push(
			carryOrCreate(
				previousSteps.get(verifyIdentifier),
				input.maximumStepAttempts,
				timestamp,
				() =>
					createStep(
						verifyIdentifier,
						`Verify ${service.name} answers from ${incident.backupRegion}`,
						"A recovery is only complete after an independent check confirms it",
						{
							input: {
								recoveryActionIdentifier: "",
								serviceIdentifier,
							},
							name: "verify_recovery",
						},
						AGENT_ACTOR,
						serviceIdentifier,
						0,
						false,
						[executeIdentifier],
						timestamp,
					),
			),
		)
	}

	for (const priority of postponed) {
		const service = servicesByIdentifier.get(priority.serviceIdentifier)
		if (!service) {
			continue
		}
		const executeIdentifier = stepIdentifierFor(
			service.identifier,
			"execute",
		)
		const previous = previousSteps.get(executeIdentifier)
		if (previous && CARRIED_STATUSES.includes(previous.status)) {
			steps.push(previous)
			continue
		}
		steps.push({
			...createStep(
				executeIdentifier,
				service.recoveryActionDescription,
				priority.reason,
				{
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
				AGENT_ACTOR,
				service.identifier,
				service.recoveryCapacityUnits,
				service.recoveryRequiresApproval,
				[],
				timestamp,
			),
			status: "postponed",
			statusReason: priority.reason,
		})
	}

	if (postponed.length) {
		const previousSupport = previousSteps.get(
			SUPPORT_COMMUNICATION_STEP_IDENTIFIER,
		)
		const postponedNames = postponed
			.map((priority) => priority.serviceName)
			.join(", ")
		steps.push(
			carryOrCreate(
				previousSupport,
				input.maximumStepAttempts,
				timestamp,
				() =>
					createStep(
						SUPPORT_COMMUNICATION_STEP_IDENTIFIER,
						"Brief customer support about the services that stay down",
						"People waiting on postponed services need to know what to tell customers",
						{
							input: {
								assigneeName: input.supportContact.name,
								assigneeRole: input.supportContact.role,
								description: `${postponedNames} will stay unavailable until more capacity is available. Share the delay with customers and escalate urgent cases.`,
								priority: "high",
								serviceIdentifier:
									postponed[0].serviceIdentifier,
								title: `Communicate delay of ${postponedNames}`,
							},
							name: "assign_task",
						},
						{ kind: "engineer", name: input.supportContact.name },
						postponed[0].serviceIdentifier,
						0,
						false,
						[],
						timestamp,
					),
			),
		)
	}

	const orderedSteps = steps.map((step, index) => ({
		...step,
		order: index + 1,
	}))
	const plannedUnits = sumBy(
		recoverNow.filter(
			(serviceIdentifier) => !alreadyAllocated.has(serviceIdentifier),
		),
		(serviceIdentifier) =>
			capacityUnitsOf(servicesByIdentifier, serviceIdentifier),
	)
	const recoverNowNames = recoverNow.map((serviceIdentifier) =>
		nameOf(servicesByIdentifier, serviceIdentifier),
	)
	const postponedSummary = postponed.length
		? ` Postponed: ${postponed.map((priority) => `${priority.serviceName} (${priority.reason})`).join("; ")}.`
		: ""
	const summary = recoverNow.length
		? `Recover ${recoverNowNames.join(", then ")} using ${plannedUnits + resource.allocatedCapacity} of ${resource.totalCapacity} ${resource.unit} in ${resource.region}.${postponedSummary}`
		: unhealthy.length
			? `No service can be recovered with the ${resource.totalCapacity} ${resource.unit} available.${postponedSummary}`
			: "Every service is healthy. Nothing left to recover."

	return {
		capacity: {
			confirmed: resource.confirmed,
			plannedUnits: plannedUnits + resource.allocatedCapacity,
			postponedUnits,
			remainingUnits: remaining,
			resourceIdentifier: resource.identifier,
			totalCapacity: resource.totalCapacity,
		},
		priorities,
		reason: input.triggeredBy,
		steps: orderedSteps,
		summary,
	}
}

function decisionFor(
	decisions: ReadonlyMap<string, DecisionOutcome>,
	serviceIdentifier: string,
): DecisionOutcome {
	const decision = decisions.get(serviceIdentifier)
	if (!decision) {
		return { blockedBy: [], decision: "postpone", reason: "Not evaluated" }
	}
	return decision
}

function reasonFor(
	decisions: ReadonlyMap<string, DecisionOutcome>,
	serviceIdentifier: string,
): string {
	return decisionFor(decisions, serviceIdentifier).reason
}

function capacityUnitsOf(
	servicesByIdentifier: ReadonlyMap<string, ServiceState>,
	serviceIdentifier: string,
): number {
	const service = servicesByIdentifier.get(serviceIdentifier)
	if (!service) {
		return 0
	}
	return service.recoveryCapacityUnits
}

function nameOf(
	servicesByIdentifier: ReadonlyMap<string, ServiceState>,
	serviceIdentifier: string,
): string {
	const service = servicesByIdentifier.get(serviceIdentifier)
	if (!service) {
		return serviceIdentifier
	}
	return service.name
}

function scoreServices(
	unhealthy: ReadonlyArray<ServiceState>,
	incident: IncidentSnapshot,
): ReadonlyArray<ScoredService> {
	const unhealthyIdentifiers = new Set(
		unhealthy.map((service) => service.identifier),
	)
	return unhealthy
		.map((service) => {
			const dependents = countDependents(
				service.identifier,
				incident.services,
				unhealthyIdentifiers,
			)
			return {
				dependents,
				score:
					BUSINESS_IMPACT_WEIGHTS[service.businessImpact] +
					DEPENDENT_SERVICE_SCORE_BONUS * dependents,
				service,
			}
		})
		.sort((left, right) => {
			if (right.score !== left.score) {
				return right.score - left.score
			}
			return (
				left.service.recoveryCapacityUnits -
				right.service.recoveryCapacityUnits
			)
		})
}

function countDependents(
	serviceIdentifier: string,
	services: ReadonlyArray<ServiceState>,
	unhealthyIdentifiers: ReadonlySet<string>,
): number {
	const visited = new Set<string>()
	const queue = [serviceIdentifier]
	while (queue.length) {
		const current = queue.shift() as string
		for (const service of services) {
			if (
				service.dependencies.includes(current) &&
				!visited.has(service.identifier) &&
				unhealthyIdentifiers.has(service.identifier)
			) {
				visited.add(service.identifier)
				queue.push(service.identifier)
			}
		}
	}
	return visited.size
}

function buildPriorities(
	scored: ReadonlyArray<ScoredService>,
	incident: IncidentSnapshot,
	decisions: ReadonlyMap<string, DecisionOutcome>,
): ReadonlyArray<ServicePriority> {
	const ranked = scored.map(({ service, score }, index): ServicePriority => {
		const outcome = decisionFor(decisions, service.identifier)
		return {
			blockedBy: outcome.blockedBy,
			businessImpact: service.businessImpact,
			capacityUnits: service.recoveryCapacityUnits,
			decision: outcome.decision,
			rank: index + 1,
			reason: outcome.reason,
			score,
			serviceIdentifier: service.identifier,
			serviceName: service.name,
		}
	})
	const healthy = incident.services
		.filter((service) => service.status === "healthy")
		.map(
			(service, index): ServicePriority => ({
				blockedBy: [],
				businessImpact: service.businessImpact,
				capacityUnits: 0,
				decision: "already-healthy",
				rank: ranked.length + index + 1,
				reason: "Healthy, no action needed",
				score: 0,
				serviceIdentifier: service.identifier,
				serviceName: service.name,
			}),
		)
	return [...ranked, ...healthy]
}

function orderByDependencies(
	serviceIdentifiers: ReadonlyArray<string>,
	servicesByIdentifier: ReadonlyMap<string, ServiceState>,
	rankByService: ReadonlyMap<string, number>,
): ReadonlyArray<string> {
	const ordered: string[] = []
	const pending = new Set(serviceIdentifiers)
	const rankOf = (serviceIdentifier: string): number => {
		const rank = rankByService.get(serviceIdentifier)
		if (rank === undefined) {
			return Number.MAX_SAFE_INTEGER
		}
		return rank
	}
	while (pending.size) {
		const ready = Array.from(pending)
			.filter((serviceIdentifier) => {
				const service = servicesByIdentifier.get(serviceIdentifier)
				if (!service) {
					return true
				}
				return service.dependencies.every(
					(dependencyIdentifier) =>
						!pending.has(dependencyIdentifier),
				)
			})
			.sort((left, right) => rankOf(left) - rankOf(right))
		if (!ready.length) {
			ordered.push(...pending)
			break
		}
		ordered.push(ready[0])
		pending.delete(ready[0])
	}
	return ordered
}

function createStep(
	identifier: string,
	title: string,
	reason: string,
	invocation: ToolInvocation,
	owner: Actor,
	serviceIdentifier: string,
	capacityUnits: number,
	requiresApproval: boolean,
	dependsOn: ReadonlyArray<string>,
	timestamp: string,
): PlanStep {
	return {
		approvalIdentifier: "",
		attempts: 0,
		capacityUnits,
		dependsOn,
		identifier,
		invocation,
		order: 0,
		owner,
		reason,
		requiresApproval,
		resultSummary: "",
		serviceIdentifier,
		status: "proposed",
		statusReason: "Proposed by the agent",
		title,
		toolCallIdentifier: "",
		updatedAt: timestamp,
	}
}

function carryOrCreate(
	previous: PlanStep | undefined,
	maximumStepAttempts: number,
	timestamp: string,
	create: () => PlanStep,
): PlanStep {
	if (!previous) {
		return create()
	}
	return carryOrReset(previous, maximumStepAttempts, timestamp)
}

function carryOrReset(
	previous: PlanStep,
	maximumStepAttempts: number,
	timestamp: string,
): PlanStep {
	switch (previous.status) {
		case "running":
		case "completed":
			return previous
		case "failed":
			if (previous.attempts < maximumStepAttempts) {
				return {
					...previous,
					status: "proposed",
					statusReason: `Retrying after failure: ${previous.statusReason}`,
					updatedAt: timestamp,
				}
			}
			return previous
		case "awaiting-approval":
		case "approved":
			return {
				...previous,
				approvalIdentifier: "",
				status: "proposed",
				statusReason:
					"Approval will be requested again for the revised plan",
				updatedAt: timestamp,
			}
		case "proposed":
		case "rejected":
		case "cancelled":
		case "postponed":
			return {
				...previous,
				approvalIdentifier: "",
				status: "proposed",
				statusReason: "Proposed by the agent",
				updatedAt: timestamp,
			}
	}
}
