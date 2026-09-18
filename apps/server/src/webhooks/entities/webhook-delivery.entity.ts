import {
	WebhookDeliveryStatus,
	WebhookEnvelope,
} from "@webhooks/types/webhook.type"
import { Column, Entity, Index, PrimaryColumn } from "typeorm"

@Entity({ name: "webhook_deliveries" })
@Index(["status", "nextAttemptAt"])
export class WebhookDeliveryEntity {
	@PrimaryColumn({ type: "text" })
	identifier: string

	@Index()
	@Column({ type: "text" })
	subscriptionIdentifier: string

	@Column({ type: "text" })
	eventIdentifier: string

	@Column({ type: "text" })
	eventType: string

	@Column({ type: "text" })
	runIdentifier: string

	@Column({ type: "jsonb" })
	envelope: WebhookEnvelope

	@Column({ type: "text" })
	status: WebhookDeliveryStatus

	@Column({ type: "integer" })
	attempts: number

	@Column({ type: "text" })
	nextAttemptAt: string

	@Column({ type: "text" })
	lastAttemptAt: string

	@Column({ type: "integer" })
	lastStatusCode: number

	@Column({ type: "text" })
	lastError: string

	@Column({ type: "text" })
	createdAt: string

	@Column({ type: "text" })
	deliveredAt: string
}
