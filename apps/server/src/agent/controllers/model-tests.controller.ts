import { ModelTestsService } from "@agent/llm/model-tests.service"
import { SessionAdministration } from "@authentication/session/browser-session"
import { Controller, HttpCode, HttpStatus, Post } from "@nestjs/common"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"

@ApiTags("Agent")
@ApiSecurity("operator")
@SessionAdministration()
@Controller("agent/models")
export class ModelTestsController {
	constructor(private readonly modelTests: ModelTestsService) {}

	@Post("test")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary:
			"Test configured agent and customer-ranking models with synthetic tool calls (billable; no incident actions)",
	})
	test() {
		return this.modelTests.execute()
	}
}
