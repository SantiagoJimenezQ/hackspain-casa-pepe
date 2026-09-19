import {
	ACTIVITY_DEFAULT_PAGE_LIMIT,
	ACTIVITY_EVENT_TYPES,
	ACTIVITY_MAXIMUM_PAGE_LIMIT,
} from "@activity/constants/activity.constant"
import { ActivityEventType } from "@activity/types/activity.type"
import { ApiPropertyOptional } from "@nestjs/swagger"
import { Transform, Type } from "class-transformer"
import {
	IsArray,
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	Max,
	Min,
} from "class-validator"

export class ListActivityDTO {
	@ApiPropertyOptional({
		description: "Exclusive cursor for older LLM history",
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	beforeSequence?: number

	@ApiPropertyOptional({
		description: "Run identifier. Defaults to the active run",
	})
	@IsOptional()
	@IsString()
	runIdentifier?: string

	@ApiPropertyOptional({
		description: "Comma separated event types",
		enum: ACTIVITY_EVENT_TYPES,
		isArray: true,
	})
	@IsOptional()
	@Transform(({ value }) =>
		String(value)
			.split(",")
			.filter((entry) => entry.length),
	)
	@IsArray()
	@IsIn(ACTIVITY_EVENT_TYPES, { each: true })
	types: ActivityEventType[] = []

	@ApiPropertyOptional({
		default: 0,
		description: "Only events with a sequence greater than this value",
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	afterSequence: number = 0

	@ApiPropertyOptional({ default: ACTIVITY_DEFAULT_PAGE_LIMIT })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(ACTIVITY_MAXIMUM_PAGE_LIMIT)
	limit: number = ACTIVITY_DEFAULT_PAGE_LIMIT

	@ApiPropertyOptional({ default: 0 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	offset: number = 0

	@ApiPropertyOptional({
		description:
			"API key for browser EventSource clients that cannot send headers",
	})
	@IsOptional()
	@IsString()
	apiKey?: string
}
