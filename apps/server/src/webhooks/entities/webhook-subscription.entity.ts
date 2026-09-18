import { Column, Entity, Index, PrimaryColumn } from "typeorm"

@Entity({ name: "webhook_subscriptions" })
export class WebhookSubscriptionEntity {
	@PrimaryColumn({ type: "text" })
	identifier: string

	@Column({ type: "text" })
	name: string

	@Column({ type: "text" })
	description: string

	@Column({ type: "text" })
	targetURL: string

	@Column({ type: "text" })
	secret: string

	@Column({ type: "jsonb" })
	eventTypes: string[]

	@Index()
	@Column({ type: "boolean" })
	active: boolean

	@Column({ type: "text" })
	createdAt: string

	@Column({ type: "text" })
	updatedAt: string
}
