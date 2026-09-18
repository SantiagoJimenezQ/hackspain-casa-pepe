import {
	ActivityCorrelation,
	ActivityEventType,
	ActivitySource,
} from "@activity/types/activity.type"
import { Column, Entity, Index, PrimaryColumn } from "typeorm"

@Entity({ name: "activity_events" })
@Index(["runIdentifier", "sequence"])
export class ActivityEventEntity {
	@PrimaryColumn({ type: "text" })
	identifier: string

	@Index()
	@Column({ type: "text" })
	runIdentifier: string

	@Column({ type: "text" })
	incidentIdentifier: string

	@Column({ type: "integer" })
	sequence: number

	@Column({ type: "text" })
	occurredAt: string

	@Index()
	@Column({ type: "text" })
	type: ActivityEventType

	@Column({ type: "text" })
	source: ActivitySource

	@Column({ type: "text" })
	title: string

	@Column({ type: "text" })
	summary: string

	@Column({ type: "jsonb" })
	payload: Record<string, unknown>

	@Column({ type: "jsonb" })
	correlation: ActivityCorrelation

	@Column({ type: "boolean" })
	simulated: boolean

	@Column({ type: "boolean" })
	replayed: boolean

	@Column({ type: "text" })
	replayOfEventIdentifier: string
}
