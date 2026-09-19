/** POST /api/agent/models/test; operator authentication; no request body. */
export interface ModelTestsResult {
 readonly ok: boolean
 readonly streamOutput: boolean
 readonly maximumOutputTokens: number
 readonly results: readonly {
  readonly profile: "agent" | "customer-ranking"
  readonly model: string
  readonly reasoningEffort: string
  readonly maximumOutputTokens: number
  readonly streamOutput: boolean
  readonly timeoutMilliseconds: number
  readonly status: "succeeded" | "failed"
  readonly latencyMilliseconds: number
  readonly error: string | null
 }[]
}
