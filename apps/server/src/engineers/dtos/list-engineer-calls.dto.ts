import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsOptional, IsString } from "class-validator"

export class ListEngineerCallsDTO {
	@ApiPropertyOptional({
		description: "Run identifier. Defaults to the active run",
	})
	@IsOptional()
	@IsString()
	runIdentifier?: string
}
