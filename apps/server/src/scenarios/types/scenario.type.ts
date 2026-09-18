import {
	BUSINESS_IMPACT_LEVELS,
	RECOVERY_ACTION_KINDS,
	SCENARIO_LANGUAGES,
	SERVICE_HEALTH_STATUSES,
	SIMULATED_OUTCOMES,
} from "@scenarios/constants/scenario.constant"

export type ServiceHealthStatus = (typeof SERVICE_HEALTH_STATUSES)[number]

export type BusinessImpactLevel = (typeof BUSINESS_IMPACT_LEVELS)[number]

export type RecoveryActionKind = (typeof RECOVERY_ACTION_KINDS)[number]

export type SimulatedOutcome = (typeof SIMULATED_OUTCOMES)[number]

export type ScenarioLanguage = (typeof SCENARIO_LANGUAGES)[number]

export interface ScenarioRecoveryAction {
	readonly kind: RecoveryActionKind
	readonly description: string
	readonly requiresApproval: boolean
	readonly consequences: ReadonlyArray<string>
}

export interface ScenarioSimulatedRecovery {
	readonly outcome: SimulatedOutcome
	readonly detail: string
}

export interface ScenarioService {
	readonly identifier: string
	readonly name: string
	readonly description: string
	readonly businessImpact: BusinessImpactLevel
	readonly impactDescription: string
	readonly dependencies: ReadonlyArray<string>
	readonly recoveryCapacityUnits: number
	readonly recoveryAction: ScenarioRecoveryAction
	readonly simulatedRecovery: ScenarioSimulatedRecovery
	readonly statusAfterImpact: ServiceHealthStatus
	readonly impactReason: string
}

export interface ScenarioResource {
	readonly identifier: string
	readonly name: string
	readonly region: string
	readonly unit: string
	readonly reportedCapacity: number
	readonly note: string
}

export interface ScenarioFact {
	readonly statement: string
	readonly confirmed: boolean
	readonly source: string
}

export interface ScenarioEngineerQuestion {
	readonly key: string
	readonly question: string
	readonly simulatedAnswer: string
	readonly simulatedConfirms: boolean
	readonly confirmsFact: string
}

export interface ScenarioEngineerBriefing {
	readonly purpose: string
	readonly questions: ReadonlyArray<ScenarioEngineerQuestion>
	readonly simulatedSummary: string
}

export interface ScenarioTwist {
	readonly identifier: string
	readonly title: string
	readonly description: string
	readonly capacityAfterTwist: number
}

export interface ScenarioSupportContact {
	readonly name: string
	readonly role: string
}

export interface ScenarioDefinition {
	readonly identifier: string
	readonly language: ScenarioLanguage
	readonly title: string
	readonly company: string
	readonly region: string
	readonly backupRegion: string
	readonly narrative: string
	readonly businessImpactSummary: string
	readonly services: ReadonlyArray<ScenarioService>
	readonly resource: ScenarioResource
	readonly initialFacts: ReadonlyArray<ScenarioFact>
	readonly engineerBriefing: ScenarioEngineerBriefing
	readonly twist: ScenarioTwist
	readonly supportContact: ScenarioSupportContact
}

export interface ScenarioSummary {
	readonly identifier: string
	readonly language: ScenarioLanguage
	readonly title: string
	readonly company: string
	readonly region: string
	readonly backupRegion: string
	readonly serviceCount: number
	readonly reportedCapacity: number
	readonly capacityAfterTwist: number
}
