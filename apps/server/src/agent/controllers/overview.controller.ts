import { createHash } from "node:crypto"
import { ActivityService } from "@activity/services/activity.service"
import { RECENT_ACTIVITY_LIMIT } from "@agent/constants/agent.constant"
import { OverviewQueryDTO } from "@agent/dtos/overview-query.dto"
import { AgentService } from "@agent/services/agent.service"
import { Overview, OverviewPlan } from "@agent/types/agent.type"
import { ApprovalsService } from "@approvals/services/approvals.service"
import { ConfigurationService } from "@common/services/configuration.service"
import { EngineersService } from "@engineers/services/engineers.service"
import { RunsService } from "@incidents/services/runs.service"
import { Controller, Get, Query } from "@nestjs/common"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"
import { comparePlans } from "@plans/helpers/plan-comparison.helper"
import { PlansService } from "@plans/services/plans.service"
import { TasksService } from "@tasks/services/tasks.service"
import { ToolRegistryService } from "@tools/services/tool-registry.service"
import { ToolsService } from "@tools/services/tools.service"
import type { UnchangedOverview } from "../../../../../packages/contracts/overview"

@ApiTags("Overview")
@ApiSecurity("operator")
@Controller("overview")
export class OverviewController {
	constructor(
		private readonly runsService: RunsService,
		private readonly plansService: PlansService,
		private readonly approvalsService: ApprovalsService,
		private readonly tasksService: TasksService,
		private readonly engineersService: EngineersService,
		private readonly toolsService: ToolsService,
		private readonly toolRegistry: ToolRegistryService,
		private readonly activityService: ActivityService,
		private readonly agentService: AgentService,
		private readonly configuration: ConfigurationService,
	) {}

	overview(
		query: OverviewQueryDTO & { knownRevision: string },
	): Promise<Overview | UnchangedOverview>
	overview(
		query: OverviewQueryDTO & { knownRevision?: undefined },
	): Promise<Overview>
	@Get()
	@ApiOperation({
		summary:
			"Everything the operations screen needs in one call: incident, plan, approvals, tasks, calls, tool calls and recent activity",
	})
	async overview(
		@Query() query: OverviewQueryDTO,
	): Promise<Overview | UnchangedOverview> {
		const reference = await this.runsService.getReference(
			query.runIdentifier,
		)
		const { runIdentifier } = reference
		// Sample BEFORE loading the snapshot. Concurrent writes invalidate the next poll,
		// rather than allowing an old snapshot to acquire a newer revision.
		const revision = createHash("sha256")
			.update(
				JSON.stringify([
					runIdentifier,
					reference.updatedAt,
					await this.activityService.countForRun(runIdentifier),
					this.agentService.statusVersion(runIdentifier),
				]),
			)
			.digest("hex")
		if (query.knownRevision === revision)
			return { revision, unchanged: true }
		const [
			incident,
			latestPlan,
			approvals,
			tasks,
			engineerCalls,
			toolCalls,
			activity,
			deliveryProbes,
		] = await Promise.all([
			this.runsService.getByRunIdentifier(runIdentifier),
			this.plansService.findLatestPlan(runIdentifier),
			this.approvalsService.list(runIdentifier),
			this.tasksService.list(runIdentifier),
			this.engineersService.list(runIdentifier),
			this.toolsService.list(runIdentifier),
			this.activityService.list({
				afterSequence: 0,
				limit: RECENT_ACTIVITY_LIMIT,
				offset: 0,
				runIdentifier,
				types: [],
			}),
			this.activityService.deliveryProbes(runIdentifier),
		])
		const previousPlan = latestPlan?.previousPlanIdentifier
			? await this.plansService.getByIdentifier(
					latestPlan.previousPlanIdentifier,
				)
			: null
		const plan: OverviewPlan = latestPlan
			? { kind: "plan", plan: latestPlan }
			: { kind: "none" }
		return {
			agent: this.agentService.statusFromSnapshot(
				incident,
				latestPlan,
				approvals.filter((approval) => approval.status === "pending")
					.length,
				toolCalls.filter((call) => call.status === "running").length,
			),
			deliveryProbes,
			engineerCalls,
			inboundCall: {
				phoneNumber:
					this.configuration.happyRobot.inboundPhoneNumber ?? "",
			},
			incident,
			pendingApprovals: approvals.filter(
				(approval) => approval.status === "pending",
			),
			plan,
			planComparison: latestPlan
				? comparePlans(incident, latestPlan, previousPlan, approvals)
				: null,
			recentActivity: activity.items,
			revision,
			tasks,
			toolCalls,
			tools: this.toolRegistry.describeAll(),
		}
	}
}
