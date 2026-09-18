import { ApiPropertyOptional } from "@nestjs/swagger"
import { WEBHOOK_DELIVERY_STATUSES } from "@webhooks/constants/webhook.constant"
import { WebhookDeliveryStatus } from "@webhooks/types/webhook.type"
import { Type } from "class-transformer"
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator"

export class ListWebhookDeliveriesDTO {
	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	subscriptionIdentifier?: string

	@ApiPropertyOptional({ enum: WEBHOOK_DELIVERY_STATUSES })
	@IsOptional()
	@IsIn(WEBHOOK_DELIVERY_STATUSES)
	status?: WebhookDeliveryStatus

	@ApiPropertyOptional({ default: 50 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(200)
	limit: number = 50
}
