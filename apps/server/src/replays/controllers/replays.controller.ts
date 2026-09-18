import { Body, Controller, Get, Post } from "@nestjs/common"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"
import { StartReplayDTO } from "@replays/dtos/start-replay.dto"
import { ReplaysService } from "@replays/services/replays.service"
import { ReplayState } from "@replays/types/replay.type"

@ApiTags("Replays")
@ApiSecurity("operator")
@Controller("replays")
export class ReplaysController {
	constructor(private readonly replaysService: ReplaysService) {}

	@Post()
	@ApiOperation({
		summary:
			"Reproduce a previous run as a new run flagged as replay. Events are re-emitted through webhooks, no tool is executed",
	})
	start(@Body() body: StartReplayDTO): Promise<ReplayState> {
		return this.replaysService.start({
			sourceRunIdentifier: body.sourceRunIdentifier,
			speedFactor: body.speedFactor,
		})
	}

	@Get("status")
	@ApiOperation({ summary: "Progress of the current replay" })
	status(): ReplayState {
		return this.replaysService.getState()
	}
}
