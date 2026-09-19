import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { Type } from "class-transformer"
import {
	IsIn,
	IsObject,
	IsString,
	Matches,
	MaxLength,
	MinLength,
	ValidateIf,
	ValidateNested,
} from "class-validator"
import {
	ToolTestEngineer,
	ToolTestExecuteInput,
	ToolTestMode,
	ToolTestName,
} from "../../../../../packages/contracts/tool-tests"

const TOOL_TEST_NAMES: ReadonlyArray<ToolTestName> = [
	"send_incident_email",
	"call_engineer",
]

const TOOL_TEST_MODES: ReadonlyArray<ToolTestMode> = ["simulated", "live"]

export class ToolTestEngineerDTO implements ToolTestEngineer {
	@ApiProperty({ example: "Marta Ruiz" })
	@IsString()
	@MinLength(1)
	@MaxLength(120)
	@Matches(/\S/, { message: "name must contain a non-whitespace character" })
	name: string

	@ApiProperty({
		description: "Engineer phone number in E.164 format",
		example: "+34600000000",
	})
	@IsString()
	@Matches(/^\+[1-9]\d{7,14}$/, {
		message: "phone must be an E.164 number",
	})
	phone: string
}

export class ToolTestDTO implements ToolTestExecuteInput {
	@ApiProperty({ enum: TOOL_TEST_NAMES, example: "send_incident_email" })
	@IsIn(TOOL_TEST_NAMES)
	tool: ToolTestName

	@ApiPropertyOptional({ default: "simulated", enum: TOOL_TEST_MODES })
	@ValidateIf((_object, value) => value !== undefined)
	@IsIn(TOOL_TEST_MODES)
	mode: ToolTestMode = "simulated"

	@ApiProperty({
		description:
			"Client supplied key used to make a retry return the original result",
		example: "tool-test-email-2026-09-19-001",
	})
	@IsString()
	@MinLength(1)
	@MaxLength(200)
	@Matches(/\S/, {
		message: "idempotencyKey must contain a non-whitespace character",
	})
	idempotencyKey: string

	@ApiPropertyOptional({ type: ToolTestEngineerDTO })
	@ValidateIf((_object, value) => value !== undefined)
	@IsObject()
	@ValidateNested()
	@Type(() => ToolTestEngineerDTO)
	engineer?: ToolTestEngineerDTO
}
