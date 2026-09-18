import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsOptional, IsString } from "class-validator"

export class RunScopedQueryDTO {
	@ApiPropertyOptional({
		description: "Run identifier. Defaults to the active run",
	})
	@IsOptional()
	@IsString()
	runIdentifier?: string
}
