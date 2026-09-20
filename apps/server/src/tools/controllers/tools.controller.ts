import { RunResource } from "@authentication/session/browser-session"
import { RunsService } from "@incidents/services/runs.service"
import { Controller, Get, Param, Query } from "@nestjs/common"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"
import { ListToolCallsDTO } from "@tools/dtos/list-tool-calls.dto"
import { ToolCallEntity } from "@tools/entities/tool-call.entity"
import { ToolRegistryService } from "@tools/services/tool-registry.service"
import { ToolsService } from "@tools/services/tools.service"
import { ToolCallRecord, ToolDefinitionView } from "@tools/types/tool.type"

@ApiTags("Tools")
@ApiSecurity("operator")
@RunResource(ToolCallEntity)
@Controller("tools")
export class ToolsController {
	constructor(
		private readonly toolsService: ToolsService,
		private readonly registry: ToolRegistryService,
		private readonly runsService: RunsService,
	) {}

	@Get()
	@ApiOperation({
		summary:
			"Tools available to the agent and whether each one is simulated in this deployment",
	})
	describe(): ReadonlyArray<ToolDefinitionView> {
		return this.registry.describeAll()
	}

	@Get("calls")
	@ApiOperation({
		summary:
			"Tool calls of a run with parameters, status, result and error",
	})
	async listCalls(
		@Query() query: ListToolCallsDTO,
	): Promise<ReadonlyArray<ToolCallRecord>> {
		const runIdentifier = await this.runsService.resolveRunIdentifier(
			query.runIdentifier,
		)
		return this.toolsService.list(runIdentifier)
	}

	@Get("calls/:identifier")
	@ApiOperation({ summary: "A specific tool call" })
	getCall(@Param("identifier") identifier: string): Promise<ToolCallRecord> {
		return this.toolsService.getByIdentifier(identifier)
	}
}
