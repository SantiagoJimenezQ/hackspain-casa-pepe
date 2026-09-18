import { ApiPropertyOptional } from "@nestjs/swagger"
import { Type } from "class-transformer"
import { IsInt, IsOptional, Max, Min } from "class-validator"

export class AdvanceSimulationDTO {
	@ApiPropertyOptional({ default: 1, maximum: 60, minimum: 1 })
	@IsInt()
	@IsOptional()
	@Max(60)
	@Min(1)
	@Type(() => Number)
	minutes?: number
}
