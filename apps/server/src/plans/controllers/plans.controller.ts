import { RunResource } from "@authentication/session/browser-session"
import { RunsService } from "@incidents/services/runs.service"
import { Controller, Get, Param, Query } from "@nestjs/common"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"
import { RunScopedQueryDTO } from "@plans/dtos/list-plans.dto"
import { PlanEntity } from "@plans/entities/plan.entity"
import { PlansService } from "@plans/services/plans.service"
import { CurrentPlanResponse, PlanRecord } from "@plans/types/plan.type"

@ApiTags("Plans")
@ApiSecurity("operator")
@RunResource(PlanEntity)
@Controller("plans")
export class PlansController {
	constructor(
		private readonly plansService: PlansService,
		private readonly runsService: RunsService,
	) {}

	@Get("current")
	@ApiOperation({
		summary:
			"Active plan of a run with priorities, steps, owners and changes from the previous version",
	})
	async getCurrent(
		@Query() query: RunScopedQueryDTO,
	): Promise<CurrentPlanResponse> {
		const runIdentifier = await this.runsService.resolveRunIdentifier(
			query.runIdentifier,
		)
		const plan = await this.plansService.findLatestPlan(runIdentifier)
		if (!plan) {
			return { kind: "none", runIdentifier }
		}
		return { kind: "plan", plan }
	}

	@Get()
	@ApiOperation({ summary: "Every plan version of a run, oldest first" })
	async list(
		@Query() query: RunScopedQueryDTO,
	): Promise<ReadonlyArray<PlanRecord>> {
		const runIdentifier = await this.runsService.resolveRunIdentifier(
			query.runIdentifier,
		)
		return this.plansService.listForRun(runIdentifier)
	}

	@Get(":identifier")
	@ApiOperation({ summary: "A specific plan version" })
	getByIdentifier(
		@Param("identifier") identifier: string,
	): Promise<PlanRecord> {
		return this.plansService.getByIdentifier(identifier)
	}
}
