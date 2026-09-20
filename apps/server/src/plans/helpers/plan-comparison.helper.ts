import { ApprovalRecord } from "@approvals/types/approval.type"
import { IncidentSnapshot } from "@incidents/types/incident.type"
import { PlanRecord } from "@plans/types/plan.type"
import type {
	PlanComparison,
	PlanComparisonSnapshot,
} from "../../../../../packages/contracts/demo-controls"

export function comparePlans(
	incident: IncidentSnapshot,
	current: PlanRecord,
	previous: PlanRecord | null,
	approvals: ReadonlyArray<ApprovalRecord>,
): PlanComparison {
	const snapshot = (plan: PlanRecord): PlanComparisonSnapshot => ({
		identifier: plan.identifier,
		plannedUnits: plan.capacity.plannedUnits,
		priorities: plan.priorities.map(
			({
				serviceIdentifier,
				serviceName,
				rank,
				decision,
				reason,
				blockedBy,
			}) => ({
				blockedBy,
				decision,
				rank,
				reason,
				serviceIdentifier,
				serviceName,
			}),
		),
		reason: plan.reason,
		resourceIdentifier: plan.capacity.resourceIdentifier,
		resourceName:
			incident.resources.find(
				(resource) =>
					resource.identifier === plan.capacity.resourceIdentifier,
			)?.name ?? plan.capacity.resourceIdentifier,
		steps: plan.steps.map(({ order, title, reason, status }) => ({
			order,
			reason,
			status,
			title,
		})),
		summary: plan.summary,
		totalCapacity: plan.capacity.totalCapacity,
		version: plan.version,
	})
	return {
		capacityChanges: incident.harnessEvents.flatMap(
			({ event, appliedAt }) => {
				if (
					event.type !== "capacity-limited" ||
					appliedAt > current.createdAt ||
					(previous && appliedAt < previous.createdAt)
				)
					return []
				const resource = incident.resources.find(
					(item) => item.identifier === event.resourceIdentifier,
				)
				return [
					{
						occurredAt: appliedAt,
						previousCapacity: event.previousCapacity ?? null,
						reason: event.reason,
						resourceIdentifier: event.resourceIdentifier ?? "",
						resourceName:
							resource?.name ?? event.resourceIdentifier ?? "",
						totalCapacity: event.availableCapacity,
					},
				]
			},
		),
		changes: current.changesFromPrevious,
		current: snapshot(current),
		previous: previous ? snapshot(previous) : null,
		supersededApprovals: approvals
			.filter(
				(approval) =>
					approval.planIdentifier === previous?.identifier &&
					approval.status === "superseded",
			)
			.map((approval) => ({
				actionSummary: approval.actionSummary,
				identifier: approval.identifier,
				reason: approval.invalidationReason,
			})),
		trigger: current.triggeredBy,
	}
}
