import { HappyRobotCallResultDTO } from "@engineers/dtos/happyrobot-call-result.dto"
import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	Post,
} from "@nestjs/common"
import { ApiHeader, ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"
import { ToolTestDTO } from "@tools/testing/tool-test.dto"
import { ToolTestsService } from "@tools/testing/tool-tests.service"
import { HappyRobotInbound } from "@webhooks/guards/inbound-secret.guard"
import {
	ToolTestCatalogEntry,
	ToolTestResult,
} from "../../../../../packages/contracts/tool-tests"

@ApiTags("Tool tests")
@Controller("tools/tests")
export class ToolTestsController {
	constructor(private readonly toolTests: ToolTestsService) {}

	@Get()
	@ApiSecurity("operator")
	@ApiOperation({
		summary:
			"List standalone email and engineer-call checks and their configured modes",
	})
	async catalog(): Promise<ReadonlyArray<ToolTestCatalogEntry>> {
		return this.toolTests.catalog()
	}

	@Post()
	@ApiSecurity("operator")
	@ApiOperation({
		summary:
			"Run a synthetic tool check without creating or changing an incident",
	})
	execute(@Body() body: ToolTestDTO): Promise<ToolTestResult> {
		return this.toolTests.execute(body)
	}

	@Post("callbacks/happyrobot")
	@HttpCode(HttpStatus.ACCEPTED)
	@HappyRobotInbound()
	@ApiHeader({
		description: "Shared secret configured in HAPPYROBOT_WEBHOOK_SECRET",
		name: "x-happyrobot-signature",
	})
	@ApiOperation({
		summary:
			"Receive a HappyRobot result for a standalone engineer-call check",
	})
	async happyRobotCallback(
		@Body() body: HappyRobotCallResultDTO,
	): Promise<{ readonly accepted: true }> {
		await this.toolTests.completeCall(body)
		return { accepted: true }
	}

	@Get(":identifier")
	@ApiSecurity("operator")
	@ApiOperation({
		summary: "Get a standalone tool-check result and its current status",
	})
	get(@Param("identifier") identifier: string): Promise<ToolTestResult> {
		return this.toolTests.get(identifier)
	}
}
