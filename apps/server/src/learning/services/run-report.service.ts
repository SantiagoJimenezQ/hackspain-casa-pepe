import { ActivityService } from "@activity/services/activity.service"
import { ActivityRecord } from "@activity/types/activity.type"
import { ApprovalsService } from "@approvals/services/approvals.service"
import { elapsedMilliseconds } from "@common/helpers/clock.helper"
import { RunsService } from "@incidents/services/runs.service"
import { REPORT_TIMELINE_EVENT_TYPES } from "@learning/constants/learning.constant"
import { LearningService } from "@learning/services/learning.service"
import { ReportApproval, RunReport } from "@learning/types/learning.type"
import { Injectable } from "@nestjs/common"
import { PlansService } from "@plans/services/plans.service"
import { ScenariosService } from "@scenarios/services/scenarios.service"
import { ToolsService } from "@tools/services/tools.service"

function firstOfType(
	events: ReadonlyArray<ActivityRecord>,
	type: string,
): ActivityRecord | null {
	const found = events.find((event) => event.type === type)
	if (!found) {
		return null
	}
	return found
}

function elapsedOrNull(
	from: string,
	event: ActivityRecord | null,
): number | null {
	if (!event) {
		return null
	}
	if (!from) {
		return null
	}
	return elapsedMilliseconds(from, event.occurredAt)
}

@Injectable()
export class RunReportService {
	constructor(
		private readonly runsService: RunsService,
		private readonly activityService: ActivityService,
		private readonly plansService: PlansService,
		private readonly approvalsService: ApprovalsService,
		private readonly toolsService: ToolsService,
		private readonly learningService: LearningService,
		private readonly scenariosService: ScenariosService,
	) {}

	async build(runIdentifier: string): Promise<RunReport> {
		const incident =
			await this.runsService.getByRunIdentifier(runIdentifier)
		const [events, plans, approvals, toolCalls, insights] =
			await Promise.all([
				this.activityService.listAllForRun(runIdentifier),
				this.plansService.listForRun(runIdentifier),
				this.approvalsService.list(runIdentifier),
				this.toolsService.list(runIdentifier),
				this.learningService.list(
					this.scenariosService.getByIdentifier(
						incident.scenarioIdentifier,
					).family,
				),
			])
		const firstRecovery = events.find(
			(event) => event.type === "recovery.executed",
		)
		const reportApprovals: ReadonlyArray<ReportApproval> = approvals.map(
			(approval) => ({
				actionSummary: approval.actionSummary,
				decidedBy: approval.decidedBy,
				identifier: approval.identifier,
				status: approval.status,
				waitMilliseconds: approval.decidedAt
					? elapsedMilliseconds(
							approval.requestedAt,
							approval.decidedAt,
						)
					: null,
			}),
		)
		const approvalWait = reportApprovals.reduce(
			(total, approval) =>
				total +
				(approval.waitMilliseconds === null
					? 0
					: approval.waitMilliseconds),
			0,
		)
		return {
			approvals: reportApprovals,
			durations: {
				approvalWaitMilliseconds: approvalWait,
				impactToFirstApprovalRequestMilliseconds: elapsedOrNull(
					incident.impactedAt,
					firstOfType(events, "approval.requested"),
				),
				impactToFirstPlanMilliseconds: elapsedOrNull(
					incident.impactedAt,
					firstOfType(events, "plan.created"),
				),
				impactToFirstRecoveryMilliseconds: elapsedOrNull(
					incident.impactedAt,
					firstRecovery ? firstRecovery : null,
				),
				impactToResolutionMilliseconds:
					incident.resolvedAt && incident.impactedAt
						? elapsedMilliseconds(
								incident.impactedAt,
								incident.resolvedAt,
							)
						: null,
			},
			eventCount: events.length,
			impactedAt: incident.impactedAt,
			lessons: insights.map((insight) => insight.summary),
			planVersions: plans.map((plan) => ({
				assumptions: plan.assumptions,
				changeCount: plan.changesFromPrevious.length,
				createdAt: plan.createdAt,
				summary: plan.summary,
				triggeredBy: plan.triggeredBy,
				version: plan.version,
			})),
			resolvedAt: incident.resolvedAt,
			runIdentifier,
			scenarioIdentifier: incident.scenarioIdentifier,
			services: {
				degraded: incident.services
					.filter((service) => service.status === "degraded")
					.map((service) => service.name),
				down: incident.services
					.filter(
						(service) =>
							service.status === "down" ||
							service.status === "recovering",
					)
					.map((service) => service.name),
				recovered: incident.services
					.filter((service) => service.status === "healthy")
					.map((service) => service.name),
			},
			startedAt: incident.startedAt,
			status: incident.status,
			timeline: events
				.filter((event) =>
					REPORT_TIMELINE_EVENT_TYPES.includes(
						event.type as (typeof REPORT_TIMELINE_EVENT_TYPES)[number],
					),
				)
				.map((event) => ({
					occurredAt: event.occurredAt,
					simulated: event.simulated,
					summary: event.summary,
					title: event.title,
					type: event.type,
				})),
			toolCalls: {
				failed: toolCalls.filter(
					(toolCall) => toolCall.status === "failed",
				).length,
				simulated: toolCalls.filter((toolCall) => toolCall.simulated)
					.length,
				succeeded: toolCalls.filter(
					(toolCall) => toolCall.status === "succeeded",
				).length,
				total: toolCalls.length,
			},
		}
	}
}
