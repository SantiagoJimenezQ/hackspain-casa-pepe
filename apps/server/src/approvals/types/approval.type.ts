import {
	APPROVAL_DECISIONS,
	APPROVAL_STATUSES,
} from "@approvals/constants/approval.constant"

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number]

export interface ApprovalRecord {
	readonly identifier: string
	readonly runIdentifier: string
	readonly incidentIdentifier: string
	readonly planIdentifier: string
	readonly planVersion: number
	readonly planStepIdentifier: string
	readonly toolCallIdentifier: string
	readonly decisionIdentifier: string
	readonly serviceIdentifier: string
	readonly actionSummary: string
	readonly reason: string
	readonly consequences: ReadonlyArray<string>
	readonly capacityUnits: number
	readonly status: ApprovalStatus
	readonly requestedAt: string
	readonly expiresAt: string
	readonly decidedAt: string
	readonly decidedBy: string
	readonly comment: string
	readonly invalidationReason: string
}

export interface RequestApprovalCommand {
	readonly runIdentifier: string
	readonly incidentIdentifier: string
	readonly planIdentifier: string
	readonly planVersion: number
	readonly planStepIdentifier: string
	readonly toolCallIdentifier: string
	readonly decisionIdentifier: string
	readonly serviceIdentifier: string
	readonly actionSummary: string
	readonly reason: string
	readonly consequences: ReadonlyArray<string>
	readonly capacityUnits: number
	readonly timeoutMilliseconds: number
}

export interface DecideApprovalCommand {
	readonly approvalIdentifier: string
	readonly decision: ApprovalDecision
	readonly operatorName: string
	readonly comment: string
}

export interface ApprovalDecidedEvent {
	readonly approval: ApprovalRecord
}
