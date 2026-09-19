import { CUSTOMER_STATUSES } from "@customers/constants/customer-priority.constant"
import { RecoveryActionStatus } from "@recovery/types/recovery.type"
import {
	BusinessImpactLevel,
	ServiceHealthStatus,
} from "@scenarios/types/scenario.type"

export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number]

export interface CustomerServiceStatus {
	readonly identifier: string
	readonly name: string
	readonly status: ServiceHealthStatus
	readonly statusReason: string
	readonly businessImpact: BusinessImpactLevel
	readonly recoveryActionDescription: string
	readonly recoveryCapacityUnits: number
	readonly recoveryRequiresApproval: boolean
	readonly recoveryStatus: RecoveryActionStatus | "not-started"
	readonly recoveryDetail: string
	readonly lastChangedAt: string
}

export interface CustomerPriorityBreakdown {
	readonly businessImpact: number
	readonly blockedDependents: number
	readonly unhealthyServices: number
	readonly affectedUsers: number
	readonly timeDown: number
	readonly recoveryInProgress: number
}

export interface CustomerPriority {
	readonly rank: number
	readonly identifier: string
	readonly name: string
	readonly shortName: string
	readonly sector: string
	readonly users: number
	readonly status: CustomerStatus
	readonly score: number
	readonly breakdown: CustomerPriorityBreakdown
	readonly highestImpact: BusinessImpactLevel | "none"
	readonly servicesDown: number
	readonly servicesDegraded: number
	readonly servicesRecovering: number
	readonly servicesHealthy: number
	readonly blockedDependentServices: ReadonlyArray<string>
	readonly minutesDown: number
	readonly recoveryInProgress: number
	readonly recoveryCompleted: number
	readonly recoveryFailed: number
	readonly capacityUnitsToRecover: number
	readonly nextAction: string
	readonly reason: string
	readonly services: ReadonlyArray<CustomerServiceStatus>
}

export interface CustomerPriorityCriterion {
	readonly key: string
	readonly description: string
}

export interface CustomerPriorityReport {
	readonly runIdentifier: string
	readonly incidentIdentifier: string
	readonly generatedAt: string
	readonly criteria: ReadonlyArray<CustomerPriorityCriterion>
	readonly customers: ReadonlyArray<CustomerPriority>
}
