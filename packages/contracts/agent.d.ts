/** LLM decisions are surfaced through the existing authenticated activity stream. */
export type LlmActivityType =
  | 'agent.llm-output'
  | 'agent.llm-decision'
  | 'agent.llm-failed'
  | 'agent.llm-stale'
  | 'agent.llm-rejected'

/** Public summaries only; no provider credentials or private chain-of-thought. */
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
}
// Append text in activity sequence order, deduplicating by sequence.
// Terminal agent.llm-decision/failed/stale events carry the same outputIdentifier.
// Discard drafts on stale or failed; decision is the final public summary.

/** Additive payload fields on agent.llm-rejected; argument values are never included. */
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
