/** LLM decisions are surfaced through the existing authenticated activity stream. */
export type LlmActivityType =
  | 'agent.llm-decision'
  | 'agent.llm-failed'
  | 'agent.llm-stale'
  | 'agent.llm-rejected'

/** Public summaries only; no provider credentials or private chain-of-thought. */
export interface LlmDecisionMetadata {
  readonly turn: number
  readonly model: string
  readonly usage: unknown
  readonly fingerprint: string
  readonly tools?: readonly string[]
}
