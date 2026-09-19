import { SUBAGENT_KINDS } from "@agent/constants/subagent.constant"
import { LlmLoopState } from "@agent/types/llm-loop.type"

export type SubagentKind = (typeof SUBAGENT_KINDS)[number]

export interface SubagentReport {
	readonly summary: string
	readonly details: ReadonlyArray<string>
	readonly pending: ReadonlyArray<string>
}

export interface SubagentRequest {
	readonly kind: SubagentKind
	readonly objective: string
	readonly remainingActions: number
	readonly state: LlmLoopState
}

export interface SubagentAvailableStep {
	readonly identifier: string
	readonly title: string
	readonly reason: string
	readonly tool: string
	readonly requiresApproval: boolean
}

export type SubagentOutcome =
	| {
			readonly kind: "reported"
			readonly specialist: SubagentKind
			readonly executedSteps: number
			readonly report: SubagentReport
	  }
	| {
			readonly kind: "exhausted"
			readonly specialist: SubagentKind
			readonly executedSteps: number
			readonly reason: string
	  }
	| {
			readonly kind: "failed"
			readonly specialist: SubagentKind
			readonly executedSteps: number
			readonly reason: string
	  }
