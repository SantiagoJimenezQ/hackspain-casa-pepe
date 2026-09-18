import { Column, Entity, Index, PrimaryColumn } from "typeorm"
import { IncomingCallRecord } from "../../../../../packages/contracts/tools"
@Entity({ name: "incoming_calls" })
@Index(["runIdentifier", "providerCallIdentifier"], { unique: true })
export class IncomingCallEntity implements IncomingCallRecord {
	@PrimaryColumn({ type: "text" }) identifier: string
	@Column({ type: "text" }) runIdentifier: string
	@Column({ type: "text" }) providerCallIdentifier: string
	@Column({ type: "text" }) callerName: string
	@Column({ type: "text" }) summary: string
	@Column({ type: "integer" }) reportedCapacity: number
	@Column({ type: "text" }) mode: "simulated" | "live"
	@Column({ type: "text" }) status: "pending" | "confirmed"
	@Column({ type: "text" }) confirmedBy: string
	@Column({ nullable: true, type: "integer" }) confirmedCapacity:
		| number
		| null
	@Column({ type: "text" }) receivedAt: string
}
