import { ACTIVITY_EVENT_TYPES } from "@activity/constants/activity.constant"
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { WEBHOOK_MINIMUM_SECRET_LENGTH } from "@webhooks/constants/webhook.constant"
import {
	IsArray,
	IsIn,
	IsOptional,
	IsString,
	IsUrl,
	MaxLength,
	MinLength,
} from "class-validator"

export class CreateWebhookSubscriptionDTO {
	@ApiProperty({ example: "Operations UI" })
	@IsString()
	@MinLength(1)
	@MaxLength(120)
	name: string

	@ApiPropertyOptional({ default: "" })
	@IsOptional()
	@IsString()
	@MaxLength(500)
	description: string = ""

	@ApiProperty({ example: "https://consumer.example.test/casa-pepe/events" })
	@IsUrl({ require_tld: false })
	targetURL: string

	@ApiProperty({
		description:
			"Shared secret used to sign every delivery with HMAC SHA-256",
		minLength: WEBHOOK_MINIMUM_SECRET_LENGTH,
	})
	@IsString()
	@MinLength(WEBHOOK_MINIMUM_SECRET_LENGTH)
	secret: string

	@ApiPropertyOptional({
		description: "Event types to receive. Empty means every event",
		enum: ACTIVITY_EVENT_TYPES,
		isArray: true,
	})
	@IsOptional()
	@IsArray()
	@IsIn(ACTIVITY_EVENT_TYPES, { each: true })
	eventTypes: string[] = []
}
