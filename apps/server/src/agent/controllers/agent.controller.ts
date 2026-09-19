import { RequestCycleDTO } from "@agent/dtos/request-cycle.dto"
import { AgentService } from "@agent/services/agent.service"
import { AgentStatus, CycleOutcome } from "@agent/types/agent.type"
import { RunsService } from "@incidents/services/runs.service"
import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Post,
	Query,
} from "@nestjs/common"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"
import { RunScopedQueryDTO } from "@plans/dtos/list-plans.dto"

@ApiTags("Agent")
@ApiSecurity("operator")
@Controller("agent")
export class AgentController {
	constructor(
		private readonly agentService: AgentService,
		private readonly runsService: RunsService,
	) {}

	@Get("status")
	@ApiOperation({
		summary:
			"Agent status for the active run: cycles, limits, pending approvals and integration modes",
	})
	async status(@Query() query: RunScopedQueryDTO): Promise<AgentStatus> {
		const runIdentifier = await this.runsService.resolveRunIdentifier(
			query.runIdentifier,
		)
		return this.agentService.getStatus(runIdentifier)
	}

	@Post("cycle")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary:
			"Ask the agent to run a decision cycle now (operator intervention)",
	})
	async requestCycle(
		@Body() body: RequestCycleDTO,
		@Query() query: RunScopedQueryDTO,
	): Promise<CycleOutcome> {
		const runIdentifier = await this.runsService.resolveRunIdentifier(
			query.runIdentifier,
		)
		return this.agentService.requestCycle(runIdentifier, {
			kind: "operator-requested",
			operatorName: body.operatorName,
		})
	}
}
