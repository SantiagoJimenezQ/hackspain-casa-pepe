import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { IsIn, IsOptional, IsString } from "class-validator"

export class RecoveryCallbackDTO {
	@ApiProperty({
		description:
			"Identifier sent by Casa Pepe when the action was requested",
	})
	@IsString()
	actionIdentifier: string

	@ApiProperty({ enum: ["succeeded", "partial", "failed"] })
	@IsIn(["succeeded", "partial", "failed"])
	status: "succeeded" | "partial" | "failed"

	@ApiPropertyOptional({ default: "" })
	@IsOptional()
	@IsString()
	detail: string = ""
}
