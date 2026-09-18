import { ConfigurationService } from "@common/services/configuration.service"
import {
	ConfirmIncomingCallDTO,
	IncomingCallDTO,
} from "@engineers/dtos/incoming-call.dto"
import { IncomingCallsService } from "@engineers/services/incoming-calls.service"
import { RunsService } from "@incidents/services/runs.service"
import {
	Body,
	Controller,
	ForbiddenException,
	Get,
	Param,
	Post,
} from "@nestjs/common"
@Controller("engineers/incoming-calls")
export class IncomingCallsController {
	constructor(
		private readonly calls: IncomingCallsService,
		private readonly runs: RunsService,
		private readonly config: ConfigurationService,
	) {}
	@Get() async list() {
		return this.calls.list(await this.runs.resolveRunIdentifier())
	}
	@Post("simulate") simulate(@Body() body: IncomingCallDTO) {
		if (this.config.happyRobot.mode !== "simulated")
			throw new ForbiddenException(
				"Simulation endpoint is disabled in live mode",
			)
		return this.calls.receive(body, "simulated")
	}
	@Post(":identifier/confirm") confirm(
		@Param("identifier") identifier: string,
		@Body() body: ConfirmIncomingCallDTO,
	) {
		return this.calls.confirm(identifier, body)
	}
}
