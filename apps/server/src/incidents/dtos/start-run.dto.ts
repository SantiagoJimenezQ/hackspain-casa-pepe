import { ApiPropertyOptional } from "@nestjs/swagger"
import { DEFAULT_SCENARIO_IDENTIFIER } from "@scenarios/constants/scenario.constant"
import {
	SIMULATION_DIFFICULTIES,
	SIMULATION_MODES,
} from "@scenarios/types/simulation.type"
import { Type } from "class-transformer"
import {
	IsBoolean,
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	Max,
	Min,
} from "class-validator"

export class StartRunDTO {
	@ApiPropertyOptional({ default: DEFAULT_SCENARIO_IDENTIFIER })
	@IsOptional()
	@IsString()
	scenarioIdentifier: string = DEFAULT_SCENARIO_IDENTIFIER

	@ApiPropertyOptional({ default: "manual", enum: SIMULATION_MODES })
	@IsIn(SIMULATION_MODES)
	@IsOptional()
	mode?: (typeof SIMULATION_MODES)[number]

	@ApiPropertyOptional({ default: 42, maximum: 4294967295, minimum: 0 })
	@IsInt()
	@IsOptional()
	@Max(4294967295)
	@Min(0)
	@Type(() => Number)
	seed?: number

	@ApiPropertyOptional({ default: "medium", enum: SIMULATION_DIFFICULTIES })
	@IsIn(SIMULATION_DIFFICULTIES)
	@IsOptional()
	difficulty?: (typeof SIMULATION_DIFFICULTIES)[number]

	@ApiPropertyOptional({ default: true })
	@IsBoolean()
	@IsOptional()
	automaticEvents?: boolean

	@ApiPropertyOptional({ default: 2, maximum: 3, minimum: 1 })
	@IsInt()
	@IsOptional()
	@Max(3)
	@Min(1)
	@Type(() => Number)
	maxConcurrentDisruptions?: number
}
