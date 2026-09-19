import { ENGINEER_CALL_OUTCOMES } from "@engineers/constants/engineer.constant"
import { EngineerCallOutcome } from "@engineers/types/engineer.type"
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { Type } from "class-transformer"
import {
	IsArray,
	IsBoolean,
	IsDefined,
	IsIn,
	IsOptional,
	IsString,
	ValidateIf,
	ValidateNested,
} from "class-validator"

export class HappyRobotAnswerDTO {
	@ApiProperty()
	@IsString()
	key: string

	@ApiProperty()
	@IsString()
	answer: string

	@ApiPropertyOptional({
		description:
			"Explicit verdict from the HappyRobot extraction node. When present it overrides the text interpretation",
	})
	@IsOptional()
	@IsBoolean()
	confirmed?: boolean
}

export class HappyRobotAuthorizationDTO {
	@ApiProperty({ nullable: true, type: Boolean })
	@ValidateIf((_object, value) => value !== null)
	@IsBoolean()
	value: boolean | null

	@ApiProperty()
	@IsString()
	rationale: string
}

export class HappyRobotAuthorizationsDTO {
	@ApiProperty({ type: HappyRobotAuthorizationDTO })
	@IsDefined()
	@ValidateNested()
	@Type(() => HappyRobotAuthorizationDTO)
	notifyAllClients: HappyRobotAuthorizationDTO

	@ApiProperty({ type: HappyRobotAuthorizationDTO })
	@IsDefined()
	@ValidateNested()
	@Type(() => HappyRobotAuthorizationDTO)
	trafficFailoverAuthorized: HappyRobotAuthorizationDTO
}

export class HappyRobotCallResultDTO {
	@ApiPropertyOptional({ enum: ["authorization", "completed"] })
	@IsOptional()
	@IsIn(["authorization", "completed"])
	phase?: "authorization" | "completed"

	@ApiProperty({
		description: "Identifier sent by Casa Pepe when the call was triggered",
	})
	@IsString()
	callIdentifier: string

	@ApiProperty({ enum: ENGINEER_CALL_OUTCOMES })
	@IsIn(ENGINEER_CALL_OUTCOMES)
	outcome: EngineerCallOutcome

	@ApiPropertyOptional({ default: "" })
	@IsOptional()
	@IsString()
	summary: string = ""

	@ApiPropertyOptional({ default: "" })
	@IsOptional()
	@IsString()
	transcript: string = ""

	@ApiPropertyOptional({ type: [HappyRobotAnswerDTO] })
	@IsOptional()
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => HappyRobotAnswerDTO)
	answers: HappyRobotAnswerDTO[] = []

	@ApiPropertyOptional({ type: HappyRobotAuthorizationsDTO })
	@IsOptional()
	@ValidateNested()
	@Type(() => HappyRobotAuthorizationsDTO)
	authorizations?: HappyRobotAuthorizationsDTO
}
