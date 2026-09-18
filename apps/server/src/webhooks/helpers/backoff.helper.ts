import {
	WEBHOOK_BACKOFF_BASE_MILLISECONDS,
	WEBHOOK_BACKOFF_MAXIMUM_MILLISECONDS,
} from "@webhooks/constants/webhook.constant"

export function backoffMilliseconds(attempts: number): number {
	return Math.min(
		WEBHOOK_BACKOFF_MAXIMUM_MILLISECONDS,
		WEBHOOK_BACKOFF_BASE_MILLISECONDS * 2 ** attempts,
	)
}

export function matchesEventType(
	subscribedTypes: ReadonlyArray<string>,
	eventType: string,
): boolean {
	if (!subscribedTypes.length) {
		return true
	}
	return subscribedTypes.includes(eventType)
}
