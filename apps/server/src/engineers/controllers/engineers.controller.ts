import { ListEngineerCallsDTO } from "@engineers/dtos/list-engineer-calls.dto"
import { EngineersService } from "@engineers/services/engineers.service"
import { EngineerCallRecord } from "@engineers/types/engineer.type"
import { RunsService } from "@incidents/services/runs.service"
import { Controller, Get, Param, Query } from "@nestjs/common"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"

@ApiTags("Engineer calls")
@ApiSecurity("operator")
@Controller("engineers/calls")
export class EngineersController {
	constructor(
		private readonly engineersService: EngineersService,
		private readonly runsService: RunsService,
	) {}

	@Get()
	@ApiOperation({
		summary:
			"Calls made to engineers during a run, with questions, answers and mode",
	})
	async list(
		@Query() query: ListEngineerCallsDTO,
	): Promise<ReadonlyArray<EngineerCallRecord>> {
		const runIdentifier = await this.runsService.resolveRunIdentifier(
			query.runIdentifier,
		)
		return this.engineersService.list(runIdentifier)
	}

	@Get(":identifier")
	@ApiOperation({ summary: "A specific engineer call" })
	getByIdentifier(
		@Param("identifier") identifier: string,
	): Promise<EngineerCallRecord> {
		return this.engineersService.getByIdentifier(identifier)
	}
}
