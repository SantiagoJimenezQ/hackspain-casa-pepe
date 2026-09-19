import {
	EngineerCallMode,
	EngineerCallProvider,
} from "@common/types/configuration.type"
import {
	EngineerCallResult,
	EngineerCallStatus,
	EngineerContact,
	EngineerQuestion,
} from "@engineers/types/engineer.type"
import { Column, Entity, Index, PrimaryColumn } from "typeorm"
import { EngineerCallIncidentContext } from "../../../../../packages/contracts/outbound-calls"

@Entity({ name: "engineer_calls" })
export class EngineerCallEntity {
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

	@Column({ type: "jsonb" })
	engineer: EngineerContact

	@Column({ type: "text" })
	purpose: string

	@Column({ type: "jsonb" })
	questions: EngineerQuestion[]

	@Column({ type: "text" })
	mode: EngineerCallMode

	@Column({ nullable: true, type: "text" })
	provider: EngineerCallProvider | null

	@Column({ type: "text" })
	status: EngineerCallStatus

	@Column({ type: "text" })
	providerReference: string

	@Column({ nullable: true, type: "text" })
	providerCallSid: string | null

	@Column({ nullable: true, type: "jsonb" })
	incidentContext: EngineerCallIncidentContext | null

	@Column({ nullable: true, type: "jsonb" })
	result: EngineerCallResult | null

	@Column({ type: "text" })
	failureReason: string

	@Column({ type: "text" })
	startedAt: string

	@Column({ type: "text" })
	finishedAt: string
}
