import { ApiPropertyOptional } from "@nestjs/swagger"
import { RunScopedQueryDTO } from "@plans/dtos/list-plans.dto"
import { IsOptional, IsString, MaxLength } from "class-validator"

export class OverviewQueryDTO extends RunScopedQueryDTO {
	@ApiPropertyOptional({
		description:
			"Return an unchanged marker when this snapshot revision is still current",
	})
	@IsOptional()
	@IsString()
	@MaxLength(64)
	knownRevision?: string
}
