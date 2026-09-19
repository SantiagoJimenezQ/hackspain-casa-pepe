/** LLM decisions are surfaced through the existing authenticated activity stream. */
export type LlmActivityType =
  | 'agent.llm-output'
  | 'agent.llm-decision'
  | 'agent.llm-failed'
  | 'agent.llm-stale'
  | 'agent.llm-rejected'

/** Legacy metadata remains additive alongside LlmPublicTurn; no private reasoning. */
export interface LlmDecisionMetadata {
  readonly outputIdentifier?: string
  readonly turn: number
  readonly model: string
  readonly usage: unknown
  readonly fingerprint: string
  readonly tools?: readonly string[]
}

/** Payload for agent.llm-output activity events. Only public assistant content. */
export interface LlmOutputPayload {
  outputIdentifier: string;
  turn: number;
  text: string;
  provisional: true;
  redacted?: boolean;
}
// Append text in activity sequence order, deduplicating by sequence.
// Terminal agent.llm-decision/failed/stale events carry the same outputIdentifier.
// Complete turn text replaces drafts. Retain stale/failed drafts with their disposition.

/** Legacy rejection diagnostics omit values; LlmPublicTurn.toolCalls contains redacted arguments. */
export interface LlmRejectionMetadata {
  readonly tool: string
  readonly result: {
    readonly error: string
    readonly correction: string
    readonly argumentDiagnostics: {
      readonly bytes: number
      readonly validJson: boolean
      /** Bounded field names/types; unknown names are redacted and all values omitted. */
      readonly shape?: unknown
    }
  }
}

/** Complete public model output. Accepted means validated, not executed successfully. */
export interface LlmPublicTurn {
  readonly outputIdentifier: string
  readonly turn: number
  readonly text: string | null
  readonly toolCalls: readonly { id: string; name: string; arguments: unknown }[]
  readonly model: string
  readonly finishReason: string | null
  readonly usage?: unknown
  readonly disposition: 'pending' | 'accepted' | 'rejected' | 'stale' | 'incomplete'
  readonly dispositionReason?: string
  readonly redacted: boolean
  readonly actionResult?: CombinedPlanActionResult
}

/** One terminal sample per commander model request; never includes prompts or credentials. */
export interface DecisionTiming {
  readonly cycleIdentifier: string
  readonly outputIdentifier: string
  readonly turn: number
  readonly outcome: string
  readonly startedAt: string
  readonly elapsedMilliseconds: number
  readonly modelMilliseconds: number
  readonly loopObservationMilliseconds: number
  readonly loopObservationCount: number
  readonly actionMilliseconds: number
}

/** Result of the guarded combined action. Acceptance is not external completion. */
export interface CombinedPlanActionResult {
  readonly planIdentifier: string
  readonly planVersion: number
  readonly selectedStepIdentifier: string
  readonly dispatchStatus: 'awaiting-approval' | 'dispatched' | 'blocked' | 'failed'
  readonly approvalIdentifier?: string
  readonly toolCallIdentifier?: string
  readonly reason?: string
}
