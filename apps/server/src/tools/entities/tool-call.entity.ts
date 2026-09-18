import {
	ToolCallStatus,
	ToolError,
	ToolInteractionKind,
	ToolName,
	ToolOutput,
} from "@tools/types/tool.type"
import { Column, Entity, Index, PrimaryColumn } from "typeorm"

@Entity({ name: "tool_calls" })
@Index(["runIdentifier", "idempotencyKey"], { unique: true })
export class ToolCallEntity {
	@PrimaryColumn({ type: "text" })
	identifier: string

	@Index()
	@Column({ type: "text" })
	runIdentifier: string

	@Column({ type: "text" })
	incidentIdentifier: string

	@Column({ type: "text" })
	idempotencyKey: string

	@Column({ type: "text" })
	name: ToolName

	@Column({ type: "text" })
	interaction: ToolInteractionKind

	@Column({ type: "jsonb" })
	input: Record<string, unknown>

	@Index()
	@Column({ type: "text" })
	status: ToolCallStatus

	@Column({ nullable: true, type: "jsonb" })
	output: ToolOutput | null

	@Column({ nullable: true, type: "jsonb" })
	error: ToolError | null

	@Column({ type: "text" })
	externalReference: string

	@Column({ type: "boolean" })
	simulated: boolean

	@Column({ type: "integer" })
	attempt: number

	@Column({ type: "text" })
	planIdentifier: string

	@Column({ type: "integer" })
	planVersion: number

	@Column({ type: "text" })
	planStepIdentifier: string

	@Column({ type: "text" })
	decisionIdentifier: string

	@Column({ type: "text" })
	startedAt: string

	@Column({ type: "text" })
	finishedAt: string

	@Column({ type: "text" })
	createdAt: string

	@Column({ type: "text" })
	updatedAt: string
}
