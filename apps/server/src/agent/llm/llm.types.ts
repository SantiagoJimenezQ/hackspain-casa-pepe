export type LlmMessageRole = "system" | "user" | "assistant" | "tool"

export interface LlmToolCall {
	id: string
	type: "function"
	function: {
		name: string
		arguments: string
	}
}

export interface LlmMessage {
	role: LlmMessageRole
	content: string | null
	tool_calls?: LlmToolCall[]
	tool_call_id?: string
}

export interface LlmCompletionOverrides {
	readonly model?: string
	readonly timeoutMilliseconds?: number
	readonly reasoningEffort?: import("@common/types/configuration.type").LlmReasoningEffort
	readonly maximumOutputTokens?: number
}

export interface LlmToolDefinition {
	type: "function"
	function: {
		name: string
		description?: string
		parameters: Record<string, unknown>
	}
}
