import { ApprovalStatus } from "@approvals/types/approval.type"
import { Column, Entity, Index, PrimaryColumn } from "typeorm"

@Entity({ name: "approvals" })
export class ApprovalEntity {
	@PrimaryColumn({ type: "text" })
	identifier: string

	@Index()
	@Column({ type: "text" })
	runIdentifier: string

	@Column({ type: "text" })
	incidentIdentifier: string

	@Column({ type: "text" })
	planIdentifier: string

	@Column({ type: "integer" })
	planVersion: number

	@Column({ type: "text" })
	planStepIdentifier: string

	@Column({ type: "text" })
	toolCallIdentifier: string

	@Column({ type: "text" })
	decisionIdentifier: string

	@Column({ type: "text" })
	serviceIdentifier: string

	@Column({ type: "text" })
	actionSummary: string

	@Column({ type: "text" })
	reason: string

	@Column({ type: "jsonb" })
	consequences: string[]

	@Column({ type: "integer" })
	capacityUnits: number

	@Index()
	@Column({ type: "text" })
	status: ApprovalStatus

	@Column({ type: "text" })
	requestedAt: string

	@Column({ type: "text" })
	expiresAt: string

	@Column({ type: "text" })
	decidedAt: string

	@Column({ type: "text" })
	decidedBy: string

	@Column({ type: "text" })
	comment: string

	@Column({ type: "text" })
	invalidationReason: string
}
