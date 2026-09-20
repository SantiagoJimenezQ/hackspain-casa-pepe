import { Column, Entity, Index, PrimaryColumn } from "typeorm"
import { CompanyPriorityRequest } from "../../../../packages/contracts/call-outcomes"

/** Server-only schema: never expose session references via the Supabase Data API. */
@Entity({ name: "company_call_sessions", schema: "casa_pepe_private" })
export class CompanyCallEntity {
	@PrimaryColumn({ type: "text" }) identifier: string
	@Index({ unique: true }) @Column({ type: "text" }) sessionReference: string
	@Index() @Column({ type: "text" }) runIdentifier: string
	@Column({ type: "text" }) createdAt: string
	@Column({ default: "", type: "text" }) receivedAt: string
	@Column({ default: "", type: "text" }) payloadHash: string
	@Column({ nullable: true, type: "jsonb" })
	outcome: CompanyPriorityRequest | null
	@Column({ nullable: true, type: "text" }) customerIdentifier: string | null
	@Column({ default: () => "'[]'", type: "jsonb" })
	serviceIdentifiers: string[]
	@Column({ default: "needs-clarification", type: "text" }) resolution:
		| "matched"
		| "needs-clarification"
	@Index() @Column({ default: "idle", type: "text" }) processingState:
		| "idle"
		| "pending"
		| "observed"
		| "stale"
	@Column({ default: "", type: "text" }) nextDispatchAt: string
}
