import { ActivityService } from "@activity/services/activity.service"
import { RECENT_ACTIVITY_LIMIT } from "@agent/constants/agent.constant"
import { AgentService } from "@agent/services/agent.service"
import { Overview, OverviewPlan } from "@agent/types/agent.type"
import { ApprovalsService } from "@approvals/services/approvals.service"
import { EngineersService } from "@engineers/services/engineers.service"
import { RunsService } from "@incidents/services/runs.service"
import { Controller, Get, Query } from "@nestjs/common"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"
import { RunScopedQueryDTO } from "@plans/dtos/list-plans.dto"
import { comparePlans } from "@plans/helpers/plan-comparison.helper"
import { PlansService } from "@plans/services/plans.service"
import { TasksService } from "@tasks/services/tasks.service"
import { ToolRegistryService } from "@tools/services/tool-registry.service"
import { ToolsService } from "@tools/services/tools.service"

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
	) {}

	@Get()
	@ApiOperation({
		summary:
			"Everything the operations screen needs in one call: incident, plan, approvals, tasks, calls, tool calls and recent activity",
	})
	async overview(@Query() query: RunScopedQueryDTO): Promise<Overview> {
		const runIdentifier = await this.runsService.resolveRunIdentifier(
			query.runIdentifier,
		)
		const [
			incident,
			latestPlan,
			approvals,
			tasks,
			engineerCalls,
			toolCalls,
			activity,
			agent,
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
			this.agentService.getStatus(runIdentifier),
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
			agent,
			deliveryProbes,
			engineerCalls,
			incident,
			pendingApprovals: approvals.filter(
				(approval) => approval.status === "pending",
			),
			plan,
			planComparison: latestPlan
				? comparePlans(incident, latestPlan, previousPlan, approvals)
				: null,
			recentActivity: activity.items,
			tasks,
			toolCalls,
			tools: this.toolRegistry.describeAll(),
		}
	}
}
