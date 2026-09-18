export const WEBHOOK_DELIVERY_STATUSES = [
	"pending",
	"delivered",
	"failed",
	"exhausted",
] as const

export const WEBHOOK_SUBSCRIPTION_ENTITY_NAME = "Webhook subscription"

export const WEBHOOK_DELIVERY_ENTITY_NAME = "Webhook delivery"

export const WEBHOOK_WORKER_INTERVAL_MILLISECONDS = 2000

export const WEBHOOK_WORKER_BATCH_SIZE = 20

export const WEBHOOK_BACKOFF_BASE_MILLISECONDS = 1000

export const WEBHOOK_BACKOFF_MAXIMUM_MILLISECONDS = 60000

export const WEBHOOK_MINIMUM_SECRET_LENGTH = 16

export const WEBHOOK_PING_EVENT_TYPE = "webhook.ping"
