import { Column, Entity, Index, PrimaryColumn } from "typeorm"

@Entity({ name: "inbound_emails" })
@Index(["runIdentifier", "receivedAt"])
@Index(["emailId"], { unique: true })
export class InboundEmailEntity {
	@PrimaryColumn({ type: "text" }) identifier: string
	@Column({ type: "text" }) emailId: string
	@Column({ type: "text" }) runIdentifier: string
	@Column({ type: "text" }) from: string
	@Column({ type: "jsonb" }) to: string[]
	@Column({ type: "text" }) subject: string
	@Column({ type: "text" }) messageId: string
	@Column({ type: "text" }) receivedAt: string
	@Column({ type: "jsonb" }) event: Record<string, unknown>
}
