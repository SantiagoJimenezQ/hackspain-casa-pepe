import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import {
	REPLAY_DEFAULT_SPEED_FACTOR,
	REPLAY_MAXIMUM_SPEED_FACTOR,
} from "@replays/constants/replay.constant"
import { IsNumber, IsOptional, IsString, Max, Min } from "class-validator"

export class StartReplayDTO {
	@ApiProperty({
		description: "Run whose recorded activity will be reproduced",
	})
	@IsString()
	sourceRunIdentifier: string

	@ApiPropertyOptional({
		default: REPLAY_DEFAULT_SPEED_FACTOR,
		description:
			"How many times faster than real time the events are re-emitted",
	})
	@IsOptional()
	@IsNumber()
	@Min(1)
	@Max(REPLAY_MAXIMUM_SPEED_FACTOR)
	speedFactor: number = REPLAY_DEFAULT_SPEED_FACTOR
}
