import {
	AppliedHarnessEvent,
	Fact,
	IncidentStatus,
	ResourceState,
	RunKind,
	ServiceState,
	// Scenario visual data is persisted with the run for replay/audit fidelity.
} from "@incidents/types/incident.type"
import {
	ScenarioCustomer,
	ScenarioTopologyLink,
	ScenarioTopologyNode,
} from "@scenarios/types/scenario.type"
import { SimulationState } from "@scenarios/types/simulation.type"
import { Column, Entity, Index, PrimaryColumn } from "typeorm"

@Entity({ name: "incidents" })
export class IncidentEntity {
	@PrimaryColumn({ type: "text" })
	identifier: string

	@Index({ unique: true })
	@Column({ type: "text" })
	runIdentifier: string

	@Column({ type: "text" })
	runKind: RunKind

	@Column({ type: "text" })
	sourceRunIdentifier: string

	@Column({ type: "text" })
	scenarioIdentifier: string

	@Column({ type: "text" })
	title: string

	@Column({ type: "text" })
	company: string

	@Column({ type: "text" })
	narrative: string

	@Column({ type: "text" })
	region: string

	@Column({ type: "text" })
	backupRegion: string

	@Column({ type: "text" })
	status: IncidentStatus

	@Index()
	@Column({ type: "boolean" })
	active: boolean

	@Column({ type: "text" })
	startedAt: string

	@Column({ type: "text" })
	impactedAt: string

	@Column({ type: "text" })
	resolvedAt: string

	@Column({ type: "text" })
	businessImpactSummary: string

	@Column({ type: "jsonb" })
	services: ServiceState[]

	@Column({ default: () => "'[]'", type: "jsonb" })
	topologyNodes: ScenarioTopologyNode[]

	@Column({ default: () => "'[]'", type: "jsonb" })
	topologyLinks: ScenarioTopologyLink[]

	@Column({ default: () => "'[]'", type: "jsonb" })
	customers: ScenarioCustomer[]

	@Column({ type: "jsonb" })
	resources: ResourceState[]

	@Column({ type: "jsonb" })
	facts: Fact[]

	@Column({ type: "jsonb" })
	harnessEvents: AppliedHarnessEvent[]

	@Column({ nullable: true, type: "jsonb" })
	simulation: SimulationState | null

	@Column({ type: "integer" })
	agentCycles: number

	@Column({ type: "text" })
	createdAt: string

	@Column({ type: "text" })
	updatedAt: string
}
