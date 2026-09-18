import { RecoveryMode } from "@common/types/configuration.type"
import {
	RECOVERY_ACTION_STATUSES,
	RECOVERY_OUTCOMES,
} from "@recovery/constants/recovery.constant"
import {
	RecoveryActionKind,
	ServiceHealthStatus,
} from "@scenarios/types/scenario.type"

export type RecoveryActionStatus = (typeof RECOVERY_ACTION_STATUSES)[number]

export type RecoveryOutcome = (typeof RECOVERY_OUTCOMES)[number]

export interface RecoveryResult {
	readonly outcome: RecoveryOutcome
	readonly detail: string
}

export interface RecoveryActionRecord {
	readonly identifier: string
	readonly runIdentifier: string
	readonly incidentIdentifier: string
	readonly toolCallIdentifier: string
	readonly planStepIdentifier: string
	readonly approvalIdentifier: string
	readonly serviceIdentifier: string
	readonly actionKind: RecoveryActionKind
	readonly actionDescription: string
	readonly capacityUnits: number
	readonly resourceIdentifier: string
	readonly mode: RecoveryMode
	readonly status: RecoveryActionStatus
	readonly providerReference: string
	readonly result: RecoveryResult | null
	readonly startedAt: string
	readonly finishedAt: string
}

export interface ExecuteRecoveryCommand {
	readonly runIdentifier: string
	readonly incidentIdentifier: string
	readonly toolCallIdentifier: string
	readonly planStepIdentifier: string
	readonly approvalIdentifier: string
	readonly serviceIdentifier: string
	readonly actionKind: RecoveryActionKind
	readonly actionDescription: string
	readonly capacityUnits: number
	readonly resourceIdentifier: string
}

export type ExecuteRecoveryOutcome =
	| { readonly kind: "in-progress"; readonly action: RecoveryActionRecord }
	| { readonly kind: "finished"; readonly action: RecoveryActionRecord }
	| {
			readonly kind: "rejected"
			readonly code: string
			readonly message: string
	  }

export interface SimulatedRecoveryScript {
	readonly outcome: RecoveryOutcome
	readonly detail: string
}

export interface AdapterExecuteRequest {
	readonly action: RecoveryActionRecord
	readonly callbackURL: string
	readonly simulatedScript: SimulatedRecoveryScript
}

export type AdapterExecuteOutcome =
	| { readonly kind: "accepted"; readonly providerReference: string }
	| { readonly kind: "completed"; readonly result: RecoveryResult }
	| { readonly kind: "failed"; readonly reason: string }

export interface VerificationResult {
	readonly serviceIdentifier: string
	readonly status: ServiceHealthStatus
	readonly verified: boolean
	readonly detail: string
	readonly mode: RecoveryMode
}

export type DeliverRecoveryResult = (
	actionIdentifier: string,
	result: RecoveryResult,
) => Promise<void>

export interface RecoveryAdapter {
	readonly mode: RecoveryMode
	execute(
		request: AdapterExecuteRequest,
		deliverResult: DeliverRecoveryResult,
	): Promise<AdapterExecuteOutcome>
	verify(
		runIdentifier: string,
		serviceIdentifier: string,
	): Promise<VerificationResult>
}

export interface RecoveryActionFinishedEvent {
	readonly action: RecoveryActionRecord
}
