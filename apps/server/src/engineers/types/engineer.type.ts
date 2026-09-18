import { EngineerCallMode } from "@common/types/configuration.type"
import {
	ENGINEER_CALL_OUTCOMES,
	ENGINEER_CALL_STATUSES,
} from "@engineers/constants/engineer.constant"

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
}

export interface EngineerCallResult {
	readonly outcome: EngineerCallOutcome
	readonly summary: string
	readonly answers: ReadonlyArray<EngineerAnswer>
	readonly transcript: string
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
	readonly providerReference: string
	readonly result: EngineerCallResult | null
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
	readonly simulatedScript: SimulatedCallScript
}

export interface AdapterCallRequest {
	readonly call: EngineerCallRecord
	readonly callbackURL: string
	readonly simulatedScript: SimulatedCallScript
}

export type AdapterCallOutcome =
	| { readonly kind: "accepted"; readonly providerReference: string }
	| { readonly kind: "failed"; readonly reason: string }

export type DeliverCallResult = (
	callIdentifier: string,
	result: EngineerCallResult,
) => Promise<void>

export interface EngineerCallAdapter {
	readonly mode: EngineerCallMode
	start(
		request: AdapterCallRequest,
		deliverResult: DeliverCallResult,
	): Promise<AdapterCallOutcome>
}

export interface EngineerCallFinishedEvent {
	readonly call: EngineerCallRecord
}
