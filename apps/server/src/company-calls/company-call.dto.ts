import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { Transform, Type } from "class-transformer"
import {
	Equals,
	IsDefined,
	IsNotEmpty,
	IsObject,
	IsOptional,
	IsString,
	MaxLength,
	ValidateNested,
} from "class-validator"
import {
	CallInitiationInput,
	CallOutcomeInput,
	CompanyPriorityRequest,
} from "../../../../packages/contracts/call-outcomes"

const trim = ({ value }: { value: unknown }) =>
	typeof value === "string" ? value.trim() : value
export class CallInitiationDTO implements CallInitiationInput {
	@ApiProperty()
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	@Transform(trim)
	conversationId: string
}
export class CompanyPriorityDTO implements CompanyPriorityRequest {
	@ApiProperty({ enum: ["priority-request"] })
	@Equals("priority-request")
	kind: "priority-request"
	@ApiProperty()
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	@Transform(trim)
	customerName: string
	@ApiProperty({ enum: ["first"] })
	@Equals("first")
	requestedPriority: "first"
	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	@Transform(trim)
	reason?: string
}
export class CallOutcomeDTO implements CallOutcomeInput {
	@ApiProperty({ enum: [1] }) @Equals(1) schemaVersion: 1
	@ApiProperty()
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	sessionReference: string
	@ApiProperty({ type: CompanyPriorityDTO })
	@IsDefined()
	@IsObject()
	@ValidateNested()
	@Type(() => CompanyPriorityDTO)
	outcome: CompanyPriorityDTO
}
