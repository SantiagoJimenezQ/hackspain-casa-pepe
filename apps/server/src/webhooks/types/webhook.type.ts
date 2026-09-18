import { ActivityRecord } from "@activity/types/activity.type"
import { WEBHOOK_DELIVERY_STATUSES } from "@webhooks/constants/webhook.constant"

export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number]

export interface WebhookSubscriptionRecord {
	readonly identifier: string
	readonly name: string
	readonly description: string
	readonly targetURL: string
	readonly eventTypes: ReadonlyArray<string>
	readonly active: boolean
	readonly createdAt: string
	readonly updatedAt: string
}

export interface CreateWebhookSubscriptionCommand {
	readonly name: string
	readonly description: string
	readonly targetURL: string
	readonly secret: string
	readonly eventTypes: ReadonlyArray<string>
}

export interface WebhookEnvelope {
	readonly deliveryIdentifier: string
	readonly subscriptionIdentifier: string
	readonly attempt: number
	readonly sentAt: string
	readonly eventType: string
	readonly event: ActivityRecord | Record<string, unknown>
}

export interface WebhookDeliveryRecord {
	readonly identifier: string
	readonly subscriptionIdentifier: string
	readonly eventIdentifier: string
	readonly eventType: string
	readonly runIdentifier: string
	readonly status: WebhookDeliveryStatus
	readonly attempts: number
	readonly nextAttemptAt: string
	readonly lastAttemptAt: string
	readonly lastStatusCode: number
	readonly lastError: string
	readonly createdAt: string
	readonly deliveredAt: string
}

export type DeliveryAttemptResult =
	| { readonly kind: "delivered"; readonly statusCode: number }
	| {
			readonly kind: "failed"
			readonly statusCode: number
			readonly error: string
	  }
