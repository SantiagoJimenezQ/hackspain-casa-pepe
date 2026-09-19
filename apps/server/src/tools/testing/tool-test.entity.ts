import { Column, Entity, Index, PrimaryColumn } from "typeorm"
import { EngineerCallProvider } from "../../../../../packages/contracts/outbound-calls"
import type {
	ToolTestEngineer,
	ToolTestError,
	ToolTestMode,
	ToolTestName,
	ToolTestStatus,
} from "../../../../../packages/contracts/tool-tests"

export type PersistedToolTestEngineer = ToolTestEngineer & {
	readonly role: string
}

/**
 * A durable record for an integration check that is deliberately independent
 * from an incident, plan, activity stream, or agent tool call.
 */
@Entity({ name: "tool_tests" })
@Index(["idempotencyKey"], { unique: true })
export class ToolTestEntity {
	@PrimaryColumn({ type: "text" })
	identifier: string

	@Column({ type: "text" })
	tool: ToolTestName

	@Column({ type: "text" })
	mode: ToolTestMode

	@Column({ type: "text" })
	idempotencyKey: string

	@Column({ type: "text" })
	requestFingerprint: string

	@Column({ type: "text" })
	status: ToolTestStatus

	@Column({ nullable: true, type: "text" })
	provider: EngineerCallProvider | null

	@Column({ default: "", type: "text" })
	providerCallSid: string

	@Column({ type: "text" })
	providerReference: string

	@Column({ type: "text" })
	detail: string

	@Column({ nullable: true, type: "jsonb" })
	error: ToolTestError | null

	@Column({ nullable: true, type: "jsonb" })
	result: Record<string, unknown> | null

	@Column({ nullable: true, type: "jsonb" })
	engineer: PersistedToolTestEngineer | null

	@Column({ type: "text" })
	createdAt: string

	@Column({ type: "text" })
	finishedAt: string

	@Column({ nullable: true, type: "text" })
	timeoutAt: string | null
}
