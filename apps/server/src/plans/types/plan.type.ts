import { Actor } from "@common/types/identity.type"
import {
	PLAN_CHANGE_KINDS,
	PLAN_STATUSES,
	PLAN_STEP_STATUSES,
	SERVICE_DECISIONS,
} from "@plans/constants/plan.constant"
import { BusinessImpactLevel } from "@scenarios/types/scenario.type"
import { ToolInvocation } from "@tools/types/tool.type"

export type PlanStatus = (typeof PLAN_STATUSES)[number]

export type PlanStepStatus = (typeof PLAN_STEP_STATUSES)[number]

export type ServiceDecisionKind = (typeof SERVICE_DECISIONS)[number]

export type PlanChangeKind = (typeof PLAN_CHANGE_KINDS)[number]

export interface ServicePriority {
	readonly serviceIdentifier: string
	readonly serviceName: string
	readonly rank: number
	readonly score: number
	readonly businessImpact: BusinessImpactLevel
	readonly capacityUnits: number
	readonly decision: ServiceDecisionKind
	readonly reason: string
	readonly blockedBy: ReadonlyArray<string>
}

export interface CapacityAllocationPlan {
	readonly resourceIdentifier: string
	readonly totalCapacity: number
	readonly assumedCapacity: number
	readonly plannedUnits: number
	readonly remainingUnits: number
	readonly confirmed: boolean
	readonly postponedUnits: number
}

export interface PlanStep {
	readonly identifier: string
	readonly order: number
	readonly title: string
	readonly reason: string
	readonly invocation: ToolInvocation
	readonly owner: Actor
	readonly serviceIdentifier: string
	readonly capacityUnits: number
	readonly requiresApproval: boolean
	readonly dependsOn: ReadonlyArray<string>
	readonly status: PlanStepStatus
	readonly statusReason: string
	readonly toolCallIdentifier: string
	readonly approvalIdentifier: string
	readonly attempts: number
	readonly resultSummary: string
	readonly updatedAt: string
}

export interface PlanChange {
	readonly kind: PlanChangeKind
	readonly description: string
	readonly serviceIdentifier: string
	readonly stepIdentifier: string
}

export interface PlanRecord {
	readonly identifier: string
	readonly runIdentifier: string
	readonly incidentIdentifier: string
	readonly version: number
	readonly status: PlanStatus
	readonly decisionIdentifier: string
	readonly reason: string
	readonly summary: string
	readonly triggeredBy: string
	readonly priorities: ReadonlyArray<ServicePriority>
	readonly capacity: CapacityAllocationPlan
	readonly steps: ReadonlyArray<PlanStep>
	readonly changesFromPrevious: ReadonlyArray<PlanChange>
	readonly assumptions: ReadonlyArray<string>
	readonly previousPlanIdentifier: string
	readonly createdAt: string
	readonly updatedAt: string
}

export interface StepUpdate {
	readonly status: PlanStepStatus
	readonly statusReason: string
	readonly toolCallIdentifier?: string
	readonly approvalIdentifier?: string
	readonly resultSummary?: string
	readonly attempts?: number
}

export interface CreatePlanInput {
	readonly runIdentifier: string
	readonly incidentIdentifier: string
	readonly decisionIdentifier: string
	readonly reason: string
	readonly summary: string
	readonly triggeredBy: string
	readonly priorities: ReadonlyArray<ServicePriority>
	readonly capacity: CapacityAllocationPlan
	readonly steps: ReadonlyArray<PlanStep>
	readonly changesFromPrevious: ReadonlyArray<PlanChange>
	readonly assumptions: ReadonlyArray<string>
	readonly previous: PlanRecord | null
}

export type CurrentPlanResponse =
	| { readonly kind: "none"; readonly runIdentifier: string }
	| { readonly kind: "plan"; readonly plan: PlanRecord }
