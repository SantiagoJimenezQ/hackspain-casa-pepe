import { RunsService } from "@incidents/services/runs.service"
import { LearningService } from "@learning/services/learning.service"
import { RunReportService } from "@learning/services/run-report.service"
import { LearningInsightRecord, RunReport } from "@learning/types/learning.type"
import {
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	Query,
} from "@nestjs/common"
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from "@nestjs/swagger"

@ApiTags("Learning")
@ApiSecurity("operator")
@Controller("learning")
export class LearningController {
	constructor(
		private readonly learningService: LearningService,
		private readonly runReportService: RunReportService,
		private readonly runsService: RunsService,
	) {}

	@Get("insights")
	@ApiQuery({ name: "scenarioIdentifier", required: false })
	@ApiOperation({
		summary:
			"What the agent learned from previous runs and applies to new plans",
	})
	insights(
		@Query("scenarioIdentifier") scenarioIdentifier?: string,
	): Promise<ReadonlyArray<LearningInsightRecord>> {
		return this.learningService.list(scenarioIdentifier)
	}

	@Delete("insights")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary:
			"Forget every insight so the next run starts without prior knowledge",
	})
	async clear(): Promise<{ readonly removed: number }> {
		return { removed: await this.learningService.clear() }
	}

	@Get("reports/current")
	@ApiOperation({ summary: "Post-incident report of the active run" })
	async currentReport(): Promise<RunReport> {
		return this.runReportService.build(
			await this.runsService.resolveRunIdentifier(),
		)
	}

	@Get("reports/:runIdentifier")
	@ApiOperation({
		summary:
			"Post-incident report of a run: durations, plan versions, approvals, outcomes and lessons",
	})
	report(@Param("runIdentifier") runIdentifier: string): Promise<RunReport> {
		return this.runReportService.build(runIdentifier)
	}
}
