import {
	FACT_STATUSES,
	HARNESS_EVENT_TYPES,
	INCIDENT_STATUSES,
	RUN_KINDS,
} from "@incidents/constants/incident.constant"
import {
	BusinessImpactLevel,
	RecoveryActionKind,
	ScenarioCustomer,
	ScenarioTopologyLink,
	ScenarioTopologyNode,
	ServiceHealthStatus,
	SimulatedOutcome,
} from "@scenarios/types/scenario.type"
import { SimulationState } from "@scenarios/types/simulation.type"

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number]

export type RunKind = (typeof RUN_KINDS)[number]

export type HarnessEventType = (typeof HARNESS_EVENT_TYPES)[number]

export type FactStatus = (typeof FACT_STATUSES)[number]

export interface ServiceState {
	readonly identifier: string
	readonly name: string
	readonly description: string
	readonly status: ServiceHealthStatus
	readonly statusReason: string
	readonly businessImpact: BusinessImpactLevel
	readonly impactDescription: string
	readonly dependencies: ReadonlyArray<string>
	readonly recoveryCapacityUnits: number
	readonly recoveryActionKind: RecoveryActionKind
	readonly recoveryActionDescription: string
	readonly recoveryRequiresApproval: boolean
	readonly recoveryConsequences: ReadonlyArray<string>
	readonly simulatedOutcome: SimulatedOutcome
	readonly simulatedOutcomeDetail: string
	readonly lastChangedAt: string
}

export interface ResourceState {
	readonly identifier: string
	readonly name: string
	readonly region: string
	readonly unit: string
	readonly totalCapacity: number
	readonly allocatedCapacity: number
	readonly confirmed: boolean
	readonly note: string
	readonly lastChangedAt: string
}

export interface Fact {
	readonly identifier: string
	readonly statement: string
	readonly status: FactStatus
	readonly source: string
	readonly recordedAt: string
}

export type HarnessEvent =
	| { readonly type: "meteorite-impact" }
	| {
			readonly type: "capacity-limited"
			readonly availableCapacity: number
			readonly reason: string
	  }
	| {
			readonly type: "service-health-changed"
			readonly serviceIdentifier: string
			readonly status: ServiceHealthStatus
			readonly reason: string
	  }
	| {
			readonly type: "fact-reported"
			readonly statement: string
			readonly status: FactStatus
			readonly source: string
	  }

export interface AppliedHarnessEvent {
	readonly identifier: string
	readonly appliedAt: string
	readonly event: HarnessEvent
	readonly source: string
}

export interface IncidentSnapshot {
	readonly identifier: string
	readonly runIdentifier: string
	readonly runKind: RunKind
	readonly sourceRunIdentifier: string
	readonly scenarioIdentifier: string
	readonly title: string
	readonly company: string
	readonly narrative: string
	readonly region: string
	readonly backupRegion: string
	readonly status: IncidentStatus
	readonly active: boolean
	readonly startedAt: string
	readonly impactedAt: string
	readonly resolvedAt: string
	readonly businessImpactSummary: string
	readonly services: ReadonlyArray<ServiceState>
	readonly topology: {
		readonly nodes: ReadonlyArray<ScenarioTopologyNode>
		readonly links: ReadonlyArray<ScenarioTopologyLink>
	}
	readonly customers: ReadonlyArray<ScenarioCustomer>
	readonly simulation: SimulationState
	readonly resources: ReadonlyArray<ResourceState>
	readonly facts: ReadonlyArray<Fact>
	readonly harnessEvents: ReadonlyArray<AppliedHarnessEvent>
	readonly agentCycles: number
	readonly createdAt: string
	readonly updatedAt: string
}

export interface CapacityAllocationRequest {
	readonly runIdentifier: string
	readonly resourceIdentifier: string
	readonly units: number
	readonly serviceIdentifier: string
}

export type CapacityAllocationResult =
	| { readonly kind: "allocated"; readonly remainingCapacity: number }
	| {
			readonly kind: "insufficient"
			readonly requestedUnits: number
			readonly remainingCapacity: number
	  }

export interface IncidentRunStartedEvent {
	readonly incident: IncidentSnapshot
}

export interface IncidentEventAppliedEvent {
	readonly incident: IncidentSnapshot
	readonly applied: AppliedHarnessEvent
}

export interface RunSummary {
	readonly runIdentifier: string
	readonly incidentIdentifier: string
	readonly runKind: RunKind
	readonly sourceRunIdentifier: string
	readonly status: IncidentStatus
	readonly active: boolean
	readonly startedAt: string
	readonly agentCycles: number
}
