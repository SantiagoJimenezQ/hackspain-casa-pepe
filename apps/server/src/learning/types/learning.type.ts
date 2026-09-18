import { IncidentStatus } from "@incidents/types/incident.type"
import { INSIGHT_KINDS } from "@learning/constants/learning.constant"

export type InsightKind = (typeof INSIGHT_KINDS)[number]

export type InsightData =
	| {
			readonly kind: "capacity-overstated"
			readonly reportedCapacity: number
			readonly confirmedCapacity: number
	  }
	| {
			readonly kind: "recovery-outcome"
			readonly outcomes: Record<string, number>
			readonly lastDetail: string
	  }

export interface LearningInsightRecord {
	readonly identifier: string
	readonly scenarioIdentifier: string
	readonly kind: InsightKind
	readonly subject: string
	readonly observations: number
	readonly lastRunIdentifier: string
	readonly data: InsightData
	readonly summary: string
	readonly createdAt: string
	readonly updatedAt: string
}

export interface CapacityInsight {
	readonly reportedCapacity: number
	readonly confirmedCapacity: number
	readonly observations: number
}

export interface ReportDurations {
	readonly impactToFirstPlanMilliseconds: number | null
	readonly impactToFirstApprovalRequestMilliseconds: number | null
	readonly approvalWaitMilliseconds: number
	readonly impactToFirstRecoveryMilliseconds: number | null
	readonly impactToResolutionMilliseconds: number | null
}

export interface ReportPlanVersion {
	readonly version: number
	readonly triggeredBy: string
	readonly summary: string
	readonly createdAt: string
	readonly changeCount: number
	readonly assumptions: ReadonlyArray<string>
}

export interface ReportApproval {
	readonly identifier: string
	readonly actionSummary: string
	readonly status: string
	readonly decidedBy: string
	readonly waitMilliseconds: number | null
}

export interface ReportTimelineEntry {
	readonly occurredAt: string
	readonly type: string
	readonly title: string
	readonly summary: string
	readonly simulated: boolean
}

export interface RunReport {
	readonly runIdentifier: string
	readonly scenarioIdentifier: string
	readonly status: IncidentStatus
	readonly startedAt: string
	readonly impactedAt: string
	readonly resolvedAt: string
	readonly durations: ReportDurations
	readonly planVersions: ReadonlyArray<ReportPlanVersion>
	readonly approvals: ReadonlyArray<ReportApproval>
	readonly services: {
		readonly recovered: ReadonlyArray<string>
		readonly degraded: ReadonlyArray<string>
		readonly down: ReadonlyArray<string>
	}
	readonly toolCalls: {
		readonly total: number
		readonly succeeded: number
		readonly failed: number
		readonly simulated: number
	}
	readonly eventCount: number
	readonly timeline: ReadonlyArray<ReportTimelineEntry>
	readonly lessons: ReadonlyArray<string>
}
