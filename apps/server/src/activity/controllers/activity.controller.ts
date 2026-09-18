import { ListActivityDTO } from "@activity/dtos/list-activity.dto"
import { ActivityService } from "@activity/services/activity.service"
import { ActivityRecord } from "@activity/types/activity.type"
import { Page } from "@common/types/pagination.type"
import { RunsService } from "@incidents/services/runs.service"
import { Controller, Get, Query } from "@nestjs/common"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"

@ApiTags("Activity")
@ApiSecurity("operator")
@Controller("activity")
export class ActivityController {
	constructor(
		private readonly activityService: ActivityService,
		private readonly runsService: RunsService,
	) {}

	@Get()
	@ApiOperation({
		summary:
			"Live activity feed of a run: harness events, decisions, tool calls, approvals and results",
	})
	async list(@Query() query: ListActivityDTO): Promise<Page<ActivityRecord>> {
		const runIdentifier = await this.runsService.resolveRunIdentifier(
			query.runIdentifier,
		)
		return this.activityService.list({
			afterSequence: query.afterSequence,
			limit: query.limit,
			offset: query.offset,
			runIdentifier,
			types: query.types,
		})
	}
}
