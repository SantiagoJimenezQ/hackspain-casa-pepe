import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsOptional, IsString, MaxLength } from "class-validator"

export class RequestCycleDTO {
	@ApiPropertyOptional({ default: "Operator" })
	@IsOptional()
	@IsString()
	@MaxLength(120)
	operatorName: string = "Operator"
}
