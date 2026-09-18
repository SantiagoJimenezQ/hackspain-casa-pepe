import { RecoveryMode } from "@common/types/configuration.type"
import {
	RecoveryActionStatus,
	RecoveryResult,
} from "@recovery/types/recovery.type"
import { RecoveryActionKind } from "@scenarios/types/scenario.type"
import { Column, Entity, Index, PrimaryColumn } from "typeorm"

@Entity({ name: "recovery_actions" })
export class RecoveryActionEntity {
	@PrimaryColumn({ type: "text" })
	identifier: string

	@Index()
	@Column({ type: "text" })
	runIdentifier: string

	@Column({ type: "text" })
	incidentIdentifier: string

	@Column({ type: "text" })
	toolCallIdentifier: string

	@Column({ type: "text" })
	planStepIdentifier: string

	@Column({ type: "text" })
	approvalIdentifier: string

	@Column({ type: "text" })
	serviceIdentifier: string

	@Column({ type: "text" })
	actionKind: RecoveryActionKind

	@Column({ type: "text" })
	actionDescription: string

	@Column({ type: "integer" })
	capacityUnits: number

	@Column({ type: "text" })
	resourceIdentifier: string

	@Column({ type: "text" })
	mode: RecoveryMode

	@Column({ type: "text" })
	status: RecoveryActionStatus

	@Column({ type: "text" })
	providerReference: string

	@Column({ nullable: true, type: "jsonb" })
	result: RecoveryResult | null

	@Column({ type: "text" })
	startedAt: string

	@Column({ type: "text" })
	finishedAt: string
}
