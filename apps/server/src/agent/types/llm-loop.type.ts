import { PlanBuildInput, PlanDraft } from "@agent/types/agent.type"
import { PlanRecord } from "@plans/types/plan.type"
import { ToolInvocation } from "@tools/types/tool.type"

export interface LlmLoopState {
	input: PlanBuildInput
	/** Durable evidence: calls, approvals, tool results, previous decisions and learning. */
	evidence: Record<string, unknown>
	blocked: boolean
}

export interface LlmLoopActions {
	saveAndExecute?(
		draft: PlanDraft,
		identifier: string,
		expected: LlmLoopState,
	): Promise<unknown>
	observe(): Promise<LlmLoopState>
	save(draft: PlanDraft, expected: LlmLoopState): Promise<PlanRecord>
	execute(stepIdentifier: string, expected: LlmLoopState): Promise<unknown>
	investigate(invocation: ToolInvocation): Promise<unknown>
}
