import { ApiProperty } from "@nestjs/swagger"
import { SCENARIO_LANGUAGES } from "@scenarios/constants/scenario.constant"
import { ScenarioLanguage } from "@scenarios/types/scenario.type"
import { IsIn } from "class-validator"

export class SwitchLanguageDTO {
	@ApiProperty({ enum: SCENARIO_LANGUAGES })
	@IsIn(SCENARIO_LANGUAGES)
	language: ScenarioLanguage
}
