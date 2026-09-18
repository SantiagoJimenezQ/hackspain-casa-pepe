import { Injectable } from "@nestjs/common"
import { Interval } from "@nestjs/schedule"
import { WEBHOOK_WORKER_INTERVAL_MILLISECONDS } from "@webhooks/constants/webhook.constant"
import { WebhookDispatcherService } from "@webhooks/services/webhook-dispatcher.service"

@Injectable()
export class WebhookDeliveryWorkerService {
	private running = false

	constructor(private readonly dispatcher: WebhookDispatcherService) {}

	@Interval(WEBHOOK_WORKER_INTERVAL_MILLISECONDS)
	async retryDueDeliveries(): Promise<void> {
		if (this.running) {
			return
		}
		this.running = true
		try {
			await this.dispatcher.processDue()
		} finally {
			this.running = false
		}
	}
}
