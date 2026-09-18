import { ApiPropertyOptional } from "@nestjs/swagger"
import { DEFAULT_SCENARIO_IDENTIFIER } from "@scenarios/constants/scenario.constant"
import { IsOptional, IsString } from "class-validator"

export class StartRunDTO {
	@ApiPropertyOptional({ default: DEFAULT_SCENARIO_IDENTIFIER })
	@IsOptional()
	@IsString()
	scenarioIdentifier: string = DEFAULT_SCENARIO_IDENTIFIER
}
