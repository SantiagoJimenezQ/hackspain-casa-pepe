import { EngineerCallMode } from "@common/types/configuration.type"
import {
	ENGINEER_CALL_OUTCOMES,
	ENGINEER_CALL_STATUSES,
} from "@engineers/constants/engineer.constant"
import {
	EngineerCallAuthorizations,
	EngineerCallIncidentContext,
	EngineerCallProvider,
} from "../../../../../packages/contracts/outbound-calls"

export type EngineerCallStatus = (typeof ENGINEER_CALL_STATUSES)[number]

export type EngineerCallOutcome = (typeof ENGINEER_CALL_OUTCOMES)[number]

export interface EngineerContact {
	readonly name: string
	readonly phone: string
	readonly role: string
}

export interface EngineerQuestion {
	readonly key: string
	readonly question: string
}

export interface EngineerAnswer {
	readonly key: string
	readonly question: string
	readonly answer: string
	readonly confirmed?: boolean
}

export interface EngineerCallResult {
	readonly outcome: EngineerCallOutcome
	readonly summary: string
	readonly answers: ReadonlyArray<EngineerAnswer>
	readonly transcript: string
	/** Structured voice evidence; it never changes a plan approval or incident fact. */
	readonly authorizations?: EngineerCallAuthorizations
}

export interface SimulatedCallScript {
	readonly answersByKey: Record<string, string>
	readonly summary: string
}

export interface EngineerCallRecord {
	readonly identifier: string
	readonly runIdentifier: string
	readonly incidentIdentifier: string
	readonly toolCallIdentifier: string
	readonly planStepIdentifier: string
	readonly engineer: EngineerContact
	readonly purpose: string
	readonly questions: ReadonlyArray<EngineerQuestion>
	readonly mode: EngineerCallMode
	readonly status: EngineerCallStatus
	readonly provider?: EngineerCallProvider
	readonly providerReference: string
	readonly providerCallSid?: string
	readonly incidentContext: EngineerCallIncidentContext
	readonly result: EngineerCallResult | null
	/** Permissions the contact granted out loud, available before the call finishes. */
	readonly liveAuthorizations?: EngineerCallAuthorizations | null
	readonly failureReason: string
	readonly startedAt: string
	readonly finishedAt: string
}

export interface StartEngineerCallCommand {
	readonly runIdentifier: string
	readonly incidentIdentifier: string
	readonly toolCallIdentifier: string
	readonly planStepIdentifier: string
	readonly engineer: EngineerContact
	readonly purpose: string
	readonly questions: ReadonlyArray<EngineerQuestion>
	readonly incidentContext: EngineerCallIncidentContext
	readonly simulatedScript: SimulatedCallScript
}

export interface AdapterCallRequest {
	readonly call: EngineerCallRecord
	readonly callbackURL: string
	readonly incidentContext: EngineerCallIncidentContext
	readonly simulatedScript: SimulatedCallScript
}

export type AdapterCallOutcome =
	| {
			readonly kind: "accepted"
			readonly provider?: EngineerCallProvider
			readonly providerReference: string
			readonly providerCallSid?: string
	  }
	| { readonly kind: "failed"; readonly reason: string }

export type DeliverCallResult = (
	callIdentifier: string,
	result: EngineerCallResult,
) => Promise<void>

export interface EngineerCallAdapter {
	readonly mode: EngineerCallMode
	readonly provider?: EngineerCallProvider
	start(
		request: AdapterCallRequest,
		deliverResult: DeliverCallResult,
	): Promise<AdapterCallOutcome>
	getResult?(call: EngineerCallRecord): Promise<EngineerCallResult | null>
}

export interface EngineerCallFinishedEvent {
	readonly call: EngineerCallRecord
}
