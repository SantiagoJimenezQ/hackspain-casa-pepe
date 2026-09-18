import { AgentMessages } from "@agent/types/agent-messages.type"
import {
	PlanChange,
	PlanRecord,
	PlanStep,
	ServicePriority,
} from "@plans/types/plan.type"

interface DraftPlan {
	readonly priorities: ReadonlyArray<ServicePriority>
	readonly steps: ReadonlyArray<PlanStep>
	readonly totalCapacity: number
}

export function diffPlans(
	previous: PlanRecord,
	next: DraftPlan,
	messages: AgentMessages,
): ReadonlyArray<PlanChange> {
	const changes: PlanChange[] = []
	if (previous.capacity.totalCapacity !== next.totalCapacity) {
		changes.push({
			description: messages.changeCapacity(
				previous.capacity.totalCapacity,
				next.totalCapacity,
			),
			kind: "capacity-changed",
			serviceIdentifier: "",
			stepIdentifier: "",
		})
	}
	const previousPriorities = new Map(
		previous.priorities.map((priority) => [
			priority.serviceIdentifier,
			priority,
		]),
	)
	for (const priority of next.priorities) {
		const before = previousPriorities.get(priority.serviceIdentifier)
		if (!before) {
			continue
		}
		if (
			before.decision === "recover-now" &&
			priority.decision === "postpone"
		) {
			changes.push({
				description: messages.changePostponed(
					priority.serviceName,
					priority.reason,
				),
				kind: "step-postponed",
				serviceIdentifier: priority.serviceIdentifier,
				stepIdentifier: "",
			})
		} else if (
			before.decision === "postpone" &&
			priority.decision === "recover-now"
		) {
			changes.push({
				description: messages.changeBackInPlan(
					priority.serviceName,
					priority.reason,
				),
				kind: "step-added",
				serviceIdentifier: priority.serviceIdentifier,
				stepIdentifier: "",
			})
		} else if (before.rank !== priority.rank) {
			changes.push({
				description: messages.changePriority(
					priority.serviceName,
					before.rank,
					priority.rank,
				),
				kind: "priority-changed",
				serviceIdentifier: priority.serviceIdentifier,
				stepIdentifier: "",
			})
		}
	}
	const previousSteps = new Map(
		previous.steps.map((step) => [step.identifier, step]),
	)
	const nextSteps = new Map(next.steps.map((step) => [step.identifier, step]))
	for (const step of next.steps) {
		if (!previousSteps.has(step.identifier)) {
			changes.push({
				description: messages.changeStepAdded(step.title),
				kind: "step-added",
				serviceIdentifier: step.serviceIdentifier,
				stepIdentifier: step.identifier,
			})
		}
	}
	const postponedServices = new Set(
		changes
			.filter((change) => change.kind === "step-postponed")
			.map((change) => change.serviceIdentifier),
	)
	for (const step of previous.steps) {
		if (
			!nextSteps.has(step.identifier) &&
			step.status !== "completed" &&
			!postponedServices.has(step.serviceIdentifier)
		) {
			changes.push({
				description: messages.changeStepRemoved(step.title),
				kind: "step-removed",
				serviceIdentifier: step.serviceIdentifier,
				stepIdentifier: step.identifier,
			})
		}
	}
	return changes
}
