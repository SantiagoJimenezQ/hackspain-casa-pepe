import { ActivityRecordedEvent } from "@activity/types/activity.type"
import { HTTP_HEADERS } from "@common/constants/application.constant"
import { DOMAIN_EVENTS } from "@common/constants/domain-events.constant"
import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import { insertEntity, updateEntity } from "@common/database/persistence.helper"
import { addMilliseconds, nowISO } from "@common/helpers/clock.helper"
import { describeError } from "@common/helpers/external-response.helper"
import { createPrefixedIdentifier } from "@common/helpers/identifier.helper"
import { signPayload } from "@common/helpers/signature.helper"
import { ConfigurationService } from "@common/services/configuration.service"
import { HttpService } from "@nestjs/axios"
import { Injectable, Logger } from "@nestjs/common"
import { OnEvent } from "@nestjs/event-emitter"
import { InjectRepository } from "@nestjs/typeorm"
import {
	WEBHOOK_PING_EVENT_TYPE,
	WEBHOOK_WORKER_BATCH_SIZE,
} from "@webhooks/constants/webhook.constant"
import { WebhookDeliveryEntity } from "@webhooks/entities/webhook-delivery.entity"
import { WebhookSubscriptionEntity } from "@webhooks/entities/webhook-subscription.entity"
import { backoffMilliseconds } from "@webhooks/helpers/backoff.helper"
import { WebhookSubscriptionsService } from "@webhooks/services/webhook-subscriptions.service"
import {
	DeliveryAttemptResult,
	WebhookDeliveryRecord,
	WebhookDeliveryStatus,
	WebhookEnvelope,
} from "@webhooks/types/webhook.type"
import { AxiosError } from "axios"
import { firstValueFrom } from "rxjs"
import { FindOptionsWhere, LessThanOrEqual, Repository } from "typeorm"

@Injectable()
export class WebhookDispatcherService {
	private readonly logger = new Logger(WebhookDispatcherService.name)

	constructor(
		@InjectRepository(WebhookDeliveryEntity)
		private readonly repository: Repository<WebhookDeliveryEntity>,
		private readonly subscriptions: WebhookSubscriptionsService,
		private readonly httpService: HttpService,
		private readonly configuration: ConfigurationService,
	) {}

	@OnEvent(DOMAIN_EVENTS.ACTIVITY_RECORDED, { async: true, promisify: true })
	async onActivityRecorded(event: ActivityRecordedEvent): Promise<void> {
		const { record } = event
		const targets = await this.subscriptions.findActiveForEventType(
			record.type,
		)
		for (const subscription of targets) {
			const delivery = await this.createDelivery(
				subscription,
				record.identifier,
				record.type,
				record.runIdentifier,
				record,
			)
			await this.attempt(delivery, subscription)
		}
	}

	async sendPing(
		subscriptionIdentifier: string,
	): Promise<WebhookDeliveryRecord> {
		const subscription = await this.subscriptions.getEntity(
			subscriptionIdentifier,
		)
		const delivery = await this.createDelivery(
			subscription,
			createPrefixedIdentifier("ping"),
			WEBHOOK_PING_EVENT_TYPE,
			"",
			{
				message: "Casa Pepe webhook test",
				sentAt: nowISO(),
			},
		)
		return this.attempt(delivery, subscription)
	}

	async processDue(): Promise<number> {
		const due = await this.repository.find({
			order: { nextAttemptAt: "ASC" },
			take: WEBHOOK_WORKER_BATCH_SIZE,
			where: {
				nextAttemptAt: LessThanOrEqual(nowISO()),
				status: "pending",
			},
		})
		let processed = 0
		for (const delivery of due) {
			const subscription = await this.subscriptions.getEntity(
				delivery.subscriptionIdentifier,
			)
			if (!subscription.active) {
				delivery.status = "exhausted"
				delivery.lastError = "Subscription removed"
				await updateEntity(this.repository, delivery)
				continue
			}
			await this.attempt(delivery, subscription)
			processed += 1
		}
		return processed
	}

	async list(
		subscriptionIdentifier: string | undefined,
		status: WebhookDeliveryStatus | undefined,
		limit: number,
	): Promise<ReadonlyArray<WebhookDeliveryRecord>> {
		const where: FindOptionsWhere<WebhookDeliveryEntity> = {}
		if (subscriptionIdentifier) {
			where.subscriptionIdentifier = subscriptionIdentifier
		}
		if (status) {
			where.status = status
		}
		const entities = await this.repository.find({
			order: { createdAt: "DESC" },
			take: limit,
			where,
		})
		return entities.map(toDeliveryRecord)
	}

	private async createDelivery(
		subscription: WebhookSubscriptionEntity,
		eventIdentifier: string,
		eventType: string,
		runIdentifier: string,
		payload: WebhookEnvelope["event"],
	): Promise<WebhookDeliveryEntity> {
		const timestamp = nowISO()
		const identifier = createPrefixedIdentifier("whd")
		const envelope: WebhookEnvelope = {
			attempt: 0,
			deliveryIdentifier: identifier,
			event: payload,
			eventType,
			sentAt: timestamp,
			subscriptionIdentifier: subscription.identifier,
		}
		return insertEntity(
			this.repository,
			this.repository.create({
				attempts: 0,
				createdAt: timestamp,
				deliveredAt: "",
				envelope,
				eventIdentifier,
				eventType,
				identifier,
				lastAttemptAt: "",
				lastError: "",
				lastStatusCode: 0,
				nextAttemptAt: timestamp,
				runIdentifier,
				status: "pending",
				subscriptionIdentifier: subscription.identifier,
			}),
		)
	}

	private async attempt(
		delivery: WebhookDeliveryEntity,
		subscription: WebhookSubscriptionEntity,
	): Promise<WebhookDeliveryRecord> {
		const attempt = delivery.attempts + 1
		const sentAt = nowISO()
		const envelope: WebhookEnvelope = {
			...delivery.envelope,
			attempt,
			sentAt,
		}
		const body = JSON.stringify(envelope)
		const result = await this.post(subscription, envelope, body, sentAt)
		delivery.attempts = attempt
		delivery.lastAttemptAt = sentAt
		delivery.envelope = envelope
		switch (result.kind) {
			case "delivered":
				delivery.status = "delivered"
				delivery.deliveredAt = sentAt
				delivery.lastStatusCode = result.statusCode
				delivery.lastError = ""
				this.logger.log(LOG_MESSAGES.WEBHOOKS.DELIVERY_SUCCEEDED, {
					attempt,
					deliveryIdentifier: delivery.identifier,
					eventType: delivery.eventType,
				})
				break
			case "failed":
				delivery.lastStatusCode = result.statusCode
				delivery.lastError = result.error
				if (attempt >= this.configuration.webhooks.maximumAttempts) {
					delivery.status = "exhausted"
					this.logger.error(
						LOG_MESSAGES.WEBHOOKS.DELIVERY_EXHAUSTED,
						{
							attempt,
							deliveryIdentifier: delivery.identifier,
							error: result.error,
						},
					)
				} else {
					delivery.status = "pending"
					delivery.nextAttemptAt = addMilliseconds(
						sentAt,
						backoffMilliseconds(attempt),
					)
					this.logger.warn(LOG_MESSAGES.WEBHOOKS.DELIVERY_FAILED, {
						attempt,
						deliveryIdentifier: delivery.identifier,
						error: result.error,
						nextAttemptAt: delivery.nextAttemptAt,
					})
				}
				break
		}
		return toDeliveryRecord(await updateEntity(this.repository, delivery))
	}

	private async post(
		subscription: WebhookSubscriptionEntity,
		envelope: WebhookEnvelope,
		body: string,
		timestamp: string,
	): Promise<DeliveryAttemptResult> {
		try {
			const response = await firstValueFrom(
				this.httpService.post(subscription.targetURL, body, {
					headers: {
						"Content-Type": "application/json",
						[HTTP_HEADERS.WEBHOOK_DELIVERY]:
							envelope.deliveryIdentifier,
						[HTTP_HEADERS.WEBHOOK_EVENT]: envelope.eventType,
						[HTTP_HEADERS.WEBHOOK_SIGNATURE]: signPayload(
							subscription.secret,
							timestamp,
							body,
						),
						[HTTP_HEADERS.WEBHOOK_TIMESTAMP]: timestamp,
					},
					timeout: this.configuration.webhooks.timeoutMilliseconds,
					validateStatus: (status) => status >= 200 && status < 300,
				}),
			)
			return { kind: "delivered", statusCode: response.status }
		} catch (error) {
			if (error instanceof AxiosError && error.response) {
				return {
					error: `HTTP ${error.response.status}`,
					kind: "failed",
					statusCode: error.response.status,
				}
			}
			return {
				error: describeError(error),
				kind: "failed",
				statusCode: 0,
			}
		}
	}
}

export function toDeliveryRecord(
	entity: WebhookDeliveryEntity,
): WebhookDeliveryRecord {
	return {
		attempts: entity.attempts,
		createdAt: entity.createdAt,
		deliveredAt: entity.deliveredAt,
		eventIdentifier: entity.eventIdentifier,
		eventType: entity.eventType,
		identifier: entity.identifier,
		lastAttemptAt: entity.lastAttemptAt,
		lastError: entity.lastError,
		lastStatusCode: entity.lastStatusCode,
		nextAttemptAt: entity.nextAttemptAt,
		runIdentifier: entity.runIdentifier,
		status: entity.status,
		subscriptionIdentifier: entity.subscriptionIdentifier,
	}
}
