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

export interface LlmToolDefinition {
	type: "function"
	function: {
		name: string
		description?: string
		parameters: Record<string, unknown>
	}
}
