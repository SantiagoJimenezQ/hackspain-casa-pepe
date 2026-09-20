import { Authorization } from "@authentication/decorators/authorization.decorator"
import {
	BadRequestException,
	Body,
	Controller,
	Get,
	HttpCode,
	Post,
	Query,
	UseGuards,
} from "@nestjs/common"
import { ApiHeader, ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"
import { CallInitiationDTO, CallOutcomeDTO } from "./company-call.dto"
import { CompanyCallGuard } from "./company-call.guard"
import { CompanyCallService } from "./company-call.service"
@ApiTags("Company priority calls")
@Controller()
export class CompanyCallController {
	constructor(private readonly calls: CompanyCallService) {}
	@Post("webhooks/happyrobot/initiation")
	@HttpCode(200)
	@Authorization("public")
	@UseGuards(CompanyCallGuard)
	@ApiHeader({ name: "x-casa-pepe-webhook-secret", required: true })
	@ApiOperation({
		summary: "Bind an inbound provider conversation to one active incident",
	})
	initiate(@Body() input: CallInitiationDTO) {
		return this.calls.initiate(
			input.conversationId,
			input.incidentIdentifier,
		)
	}
	@Post("webhooks/happyrobot/call-outcomes")
	@HttpCode(202)
	@Authorization("public")
	@UseGuards(CompanyCallGuard)
	@ApiHeader({ name: "x-casa-pepe-webhook-secret", required: true })
	@ApiOperation({
		summary:
			"Persist a company priority request without changing capacity or granting approval",
	})
	receive(@Body() input: CallOutcomeDTO) {
		return this.calls.receive(input)
	}
	@Get("call-outcomes")
	@ApiSecurity("operator")
	@ApiOperation({
		summary:
			"List redacted company priority evidence for an explicit incident run",
	})
	list(@Query("runIdentifier") runIdentifier: string) {
		if (typeof runIdentifier !== "string" || !runIdentifier.trim())
			throw new BadRequestException("runIdentifier is required")
		return this.calls.list(runIdentifier)
	}
}
