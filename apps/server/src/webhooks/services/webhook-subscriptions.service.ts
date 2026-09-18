import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import { insertEntity, updateEntity } from "@common/database/persistence.helper"
import { EntityNotFoundException } from "@common/exceptions/domain.exception"
import { nowISO } from "@common/helpers/clock.helper"
import { createPrefixedIdentifier } from "@common/helpers/identifier.helper"
import { Injectable, Logger } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { WEBHOOK_SUBSCRIPTION_ENTITY_NAME } from "@webhooks/constants/webhook.constant"
import { WebhookSubscriptionEntity } from "@webhooks/entities/webhook-subscription.entity"
import { matchesEventType } from "@webhooks/helpers/backoff.helper"
import {
	CreateWebhookSubscriptionCommand,
	WebhookSubscriptionRecord,
} from "@webhooks/types/webhook.type"
import { Repository } from "typeorm"

@Injectable()
export class WebhookSubscriptionsService {
	private readonly logger = new Logger(WebhookSubscriptionsService.name)

	constructor(
		@InjectRepository(WebhookSubscriptionEntity)
		private readonly repository: Repository<WebhookSubscriptionEntity>,
	) {}

	async create(
		command: CreateWebhookSubscriptionCommand,
	): Promise<WebhookSubscriptionRecord> {
		const timestamp = nowISO()
		const entity = this.repository.create({
			active: true,
			createdAt: timestamp,
			description: command.description,
			eventTypes: [...command.eventTypes],
			identifier: createPrefixedIdentifier("whs"),
			name: command.name,
			secret: command.secret,
			targetURL: command.targetURL,
			updatedAt: timestamp,
		})
		const saved = await insertEntity(this.repository, entity)
		this.logger.log(LOG_MESSAGES.WEBHOOKS.SUBSCRIPTION_CREATED, {
			subscriptionIdentifier: saved.identifier,
			targetURL: saved.targetURL,
		})
		return toSubscriptionRecord(saved)
	}

	async list(): Promise<ReadonlyArray<WebhookSubscriptionRecord>> {
		const entities = await this.repository.find({
			order: { createdAt: "ASC" },
			where: { active: true },
		})
		return entities.map(toSubscriptionRecord)
	}

	async getEntity(identifier: string): Promise<WebhookSubscriptionEntity> {
		const entity = await this.repository.findOne({ where: { identifier } })
		if (!entity) {
			throw new EntityNotFoundException(
				WEBHOOK_SUBSCRIPTION_ENTITY_NAME,
				identifier,
			)
		}
		return entity
	}

	async getByIdentifier(
		identifier: string,
	): Promise<WebhookSubscriptionRecord> {
		return toSubscriptionRecord(await this.getEntity(identifier))
	}

	async remove(identifier: string): Promise<void> {
		const entity = await this.getEntity(identifier)
		entity.active = false
		entity.updatedAt = nowISO()
		await updateEntity(this.repository, entity)
		this.logger.log(LOG_MESSAGES.WEBHOOKS.SUBSCRIPTION_REMOVED, {
			subscriptionIdentifier: identifier,
		})
	}

	async findActiveForEventType(
		eventType: string,
	): Promise<ReadonlyArray<WebhookSubscriptionEntity>> {
		const entities = await this.repository.find({ where: { active: true } })
		return entities.filter((entity) =>
			matchesEventType(entity.eventTypes, eventType),
		)
	}
}

export function toSubscriptionRecord(
	entity: WebhookSubscriptionEntity,
): WebhookSubscriptionRecord {
	return {
		active: entity.active,
		createdAt: entity.createdAt,
		description: entity.description,
		eventTypes: entity.eventTypes,
		identifier: entity.identifier,
		name: entity.name,
		targetURL: entity.targetURL,
		updatedAt: entity.updatedAt,
	}
}
