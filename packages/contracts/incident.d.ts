import type { SimulationConfigInput, SimulationState } from "./simulation"

export type IncidentStatus =
	| "normal"
	| "detected"
	| "responding"
	| "partially-recovered"
	| "recovered"
	| "reset"
export type RunKind = "live" | "replay"
export type ServiceHealthStatus =
	| "healthy"
	| "degraded"
	| "down"
	| "recovering"
export type BusinessImpactLevel = "critical" | "high" | "medium" | "low"
export type RecoveryActionKind =
	| "failover-database"
	| "redeploy-service"
	| "restart-stream"
	| "scale-service"
export type FactStatus = "confirmed" | "pending" | "refuted"

export type HarnessEvent =
	| { type: "meteorite-impact" }
	| {
			type: "capacity-limited"
			availableCapacity: number
			reason: string
	  }
	| {
			type: "service-health-changed"
			serviceIdentifier: string
			status: ServiceHealthStatus
			reason: string
	  }
	| {
			type: "fact-reported"
			statement: string
			status: FactStatus
			source: string
	  }

export interface DemoStartRequest extends SimulationConfigInput {
	scenarioIdentifier?: string
}

export interface ServiceState {
	identifier: string
	name: string
	description: string
	status: ServiceHealthStatus
	statusReason: string
	businessImpact: BusinessImpactLevel
	impactDescription: string
	dependencies: ReadonlyArray<string>
	recoveryCapacityUnits: number
	recoveryActionKind: RecoveryActionKind
	recoveryActionDescription: string
	recoveryRequiresApproval: boolean
	recoveryConsequences: ReadonlyArray<string>
	simulatedOutcome: "success" | "partial" | "failure"
	simulatedOutcomeDetail: string
	lastChangedAt: string
}

export interface ResourceState {
	identifier: string
	name: string
	region: string
	unit: string
	totalCapacity: number
	allocatedCapacity: number
	confirmed: boolean
	note: string
	lastChangedAt: string
}

export interface Fact {
	identifier: string
	statement: string
	status: FactStatus
	source: string
	recordedAt: string
}

export interface AppliedHarnessEvent {
	identifier: string
	appliedAt: string
	event: HarnessEvent
	source: string
}

export interface IncidentSnapshot {
	identifier: string
	runIdentifier: string
	runKind: RunKind
	sourceRunIdentifier: string
	scenarioIdentifier: string
	title: string
	company: string
	narrative: string
	region: string
	backupRegion: string
	status: IncidentStatus
	active: boolean
	startedAt: string
	impactedAt: string
	resolvedAt: string
	businessImpactSummary: string
	services: ReadonlyArray<ServiceState>
	simulation: SimulationState
	resources: ReadonlyArray<ResourceState>
	facts: ReadonlyArray<Fact>
	harnessEvents: ReadonlyArray<AppliedHarnessEvent>
	agentCycles: number
	createdAt: string
	updatedAt: string
}
