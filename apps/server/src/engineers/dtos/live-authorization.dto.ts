import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import {
	IsBoolean,
	IsOptional,
	IsString,
	MaxLength,
	MinLength,
} from "class-validator"
import { LiveAuthorizationReport } from "../../../../../packages/contracts/outbound-calls"

export class LiveAuthorizationDTO implements LiveAuthorizationReport {
	@ApiProperty({
		description: "Identifier Casa Pepe sent to the provider when the call started",
	})
	@IsString()
	@MinLength(1)
	@MaxLength(200)
	callIdentifier: string

	@ApiProperty({ description: "The contact allowed notifying every client" })
	@IsBoolean()
	notifyAllClients: boolean

	@ApiProperty({
		description: "The contact allowed moving traffic to the backup regions",
	})
	@IsBoolean()
	trafficFailoverAuthorized: boolean

	@ApiPropertyOptional({
		default: "",
		description: "What the contact said, so an operator can audit the claim",
	})
	@IsOptional()
	@IsString()
	@MaxLength(1000)
	rationale: string = ""
}
