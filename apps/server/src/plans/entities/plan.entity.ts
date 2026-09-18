import {
	CapacityAllocationPlan,
	PlanChange,
	PlanStatus,
	PlanStep,
	ServicePriority,
} from "@plans/types/plan.type"
import { Column, Entity, Index, PrimaryColumn } from "typeorm"

@Entity({ name: "plans" })
@Index(["runIdentifier", "version"], { unique: true })
export class PlanEntity {
	@PrimaryColumn({ type: "text" })
	identifier: string

	@Index()
	@Column({ type: "text" })
	runIdentifier: string

	@Column({ type: "text" })
	incidentIdentifier: string

	@Column({ type: "integer" })
	version: number

	@Column({ type: "text" })
	status: PlanStatus

	@Column({ type: "text" })
	decisionIdentifier: string

	@Column({ type: "text" })
	reason: string

	@Column({ type: "text" })
	summary: string

	@Column({ type: "text" })
	triggeredBy: string

	@Column({ type: "jsonb" })
	priorities: ServicePriority[]

	@Column({ type: "jsonb" })
	capacity: CapacityAllocationPlan

	@Column({ type: "jsonb" })
	steps: PlanStep[]

	@Column({ type: "jsonb" })
	changesFromPrevious: PlanChange[]

	@Column({ default: () => "'[]'", type: "jsonb" })
	assumptions: string[]

	@Column({ type: "text" })
	previousPlanIdentifier: string

	@Column({ type: "text" })
	createdAt: string

	@Column({ type: "text" })
	updatedAt: string
}
