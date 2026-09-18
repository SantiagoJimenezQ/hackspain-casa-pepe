import {
	ACTIVITY_EVENT_TYPES,
	ACTIVITY_SOURCES,
} from "@activity/constants/activity.constant"

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number]

export type ActivitySource = (typeof ACTIVITY_SOURCES)[number]

export interface ActivityCorrelation {
	readonly harnessEventIdentifier?: string
	readonly decisionIdentifier?: string
	readonly planIdentifier?: string
	readonly planVersion?: number
	readonly planStepIdentifier?: string
	readonly toolCallIdentifier?: string
	readonly approvalIdentifier?: string
	readonly taskIdentifier?: string
	readonly engineerCallIdentifier?: string
	readonly recoveryActionIdentifier?: string
	readonly serviceIdentifier?: string
}

export interface RecordActivityInput {
	readonly runIdentifier: string
	readonly incidentIdentifier: string
	readonly type: ActivityEventType
	readonly source: ActivitySource
	readonly title: string
	readonly summary: string
	readonly payload: Record<string, unknown>
	readonly correlation: ActivityCorrelation
	readonly simulated: boolean
}

export interface ActivityRecord {
	readonly identifier: string
	readonly runIdentifier: string
	readonly incidentIdentifier: string
	readonly sequence: number
	readonly occurredAt: string
	readonly type: ActivityEventType
	readonly source: ActivitySource
	readonly title: string
	readonly summary: string
	readonly payload: Record<string, unknown>
	readonly correlation: ActivityCorrelation
	readonly simulated: boolean
	readonly replayed: boolean
	readonly replayOfEventIdentifier: string
}

export interface ActivityQuery {
	readonly runIdentifier: string
	readonly types: ReadonlyArray<ActivityEventType>
	readonly afterSequence: number
	readonly limit: number
	readonly offset: number
}

export interface ActivityRecordedEvent {
	readonly record: ActivityRecord
}
