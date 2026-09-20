import { InsightData, InsightKind } from "@learning/types/learning.type"
import { Column, Entity, Index, PrimaryColumn } from "typeorm"

@Entity({ name: "learning_insights" })
@Index(
	"learning_browser_subject",
	["browserSessionId", "scenarioIdentifier", "kind", "subject"],
	{
		unique: true,
	},
)
export class LearningInsightEntity {
	@Column({ default: "legacy", type: "text" })
	browserSessionId: string

	@PrimaryColumn({ type: "text" })
	identifier: string

	@Column({ type: "text" })
	scenarioIdentifier: string

	@Column({ type: "text" })
	kind: InsightKind

	@Column({ type: "text" })
	subject: string

	@Column({ type: "integer" })
	observations: number

	@Column({ type: "text" })
	lastRunIdentifier: string

	@Column({ type: "jsonb" })
	data: InsightData

	@Column({ type: "text" })
	summary: string

	@Column({ type: "text" })
	createdAt: string

	@Column({ type: "text" })
	updatedAt: string
}
