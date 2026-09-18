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
} from "@nestjs/common"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"

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
	async status(): Promise<AgentStatus> {
		const runIdentifier = await this.runsService.resolveRunIdentifier()
		return this.agentService.getStatus(runIdentifier)
	}

	@Post("cycle")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary:
			"Ask the agent to run a decision cycle now (operator intervention)",
	})
	async requestCycle(@Body() body: RequestCycleDTO): Promise<CycleOutcome> {
		const runIdentifier = await this.runsService.resolveRunIdentifier()
		return this.agentService.requestCycle(runIdentifier, {
			kind: "operator-requested",
			operatorName: body.operatorName,
		})
	}
}
