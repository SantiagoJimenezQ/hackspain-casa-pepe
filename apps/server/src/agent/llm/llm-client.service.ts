import {
	LlmCompletionOverrides,
	LlmMessage,
	LlmToolCall,
	LlmToolDefinition,
} from "@agent/llm/llm.types"
import { readCompletionStream } from "@agent/llm/llm-stream"
import { isAllowedLlmBaseURL } from "@common/configuration/configuration.factory"
import { ConfigurationService } from "@common/services/configuration.service"
import { LlmConfiguration } from "@common/types/configuration.type"
import { HttpService } from "@nestjs/axios"
import { Injectable } from "@nestjs/common"
import { isAxiosError } from "axios"
import { firstValueFrom } from "rxjs"

const MAXIMUM_REQUEST_BYTES = 1024 * 1024
const MAXIMUM_RESPONSE_BYTES = 1024 * 1024

export class LlmClientError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "LlmClientError"
	}
}

@Injectable()
export class LlmClientService {
	constructor(
		private readonly configuration: ConfigurationService,
		private readonly httpService: HttpService,
	) {}

	async complete(
		messages: LlmMessage[],
		tools: LlmToolDefinition[],
		onTextOrOverrides?:
			| ((text: string) => Promise<void>)
			| LlmCompletionOverrides,
	): Promise<{ message: LlmMessage; usage: unknown; model: string }> {
		const configuration = this.providerConfiguration(onTextOrOverrides)
		const onText =
			typeof onTextOrOverrides === "function"
				? onTextOrOverrides
				: undefined
		const responseData = await this.request(
			configuration,
			messages,
			tools,
			onText,
		)
		return parseCompletionResponse(
			responseData,
			configuration.maximumOutputTokens,
		)
	}

	private providerConfiguration(
		onTextOrOverrides?:
			| ((text: string) => Promise<void>)
			| LlmCompletionOverrides,
	): LlmConfiguration {
		const configured = this.configuration.llm
		if (!configured || typeof configured !== "object") {
			throw new LlmClientError(
				"LLM provider is not configured; set LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL",
			)
		}

		const baseURL =
			typeof configured.baseURL === "string"
				? configured.baseURL.trim()
				: ""
		const apiKey =
			typeof configured.apiKey === "string"
				? configured.apiKey.trim()
				: ""
		const model =
			typeof configured.model === "string" ? configured.model.trim() : ""
		if (!baseURL || !apiKey || !model) {
			throw new LlmClientError(
				"LLM provider is not configured; set LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL",
			)
		}
		if (!isAllowedLlmBaseURL(baseURL)) {
			throw new LlmClientError(
				"LLM provider URL is invalid; use HTTPS, or HTTP on a loopback test host",
			)
		}
		if (
			!Number.isInteger(configured.timeoutMilliseconds) ||
			configured.timeoutMilliseconds < 100 ||
			configured.timeoutMilliseconds > 120000 ||
			!Number.isInteger(configured.maximumTurns) ||
			configured.maximumTurns < 1 ||
			configured.maximumTurns > 32 ||
			!Number.isInteger(configured.maximumOutputTokens) ||
			configured.maximumOutputTokens < 1 ||
			configured.maximumOutputTokens > 32768
		) {
			throw new LlmClientError("LLM provider configuration is invalid")
		}

		return mergeCompletionOverrides(
			{
				apiKey,
				baseURL,
				fastModel:
					typeof configured.fastModel === "string"
						? configured.fastModel.trim()
						: "",
				fastTimeoutMilliseconds:
					Number.isInteger(configured.fastTimeoutMilliseconds) &&
					configured.fastTimeoutMilliseconds >= 100 &&
					configured.fastTimeoutMilliseconds <= 120000
						? configured.fastTimeoutMilliseconds
						: configured.timeoutMilliseconds,
				maximumOutputTokens: configured.maximumOutputTokens,
				maximumTurns: configured.maximumTurns,
				model,
				reasoningEffort: configured.reasoningEffort,
				streamOutput: configured.streamOutput === true,
				timeoutMilliseconds: configured.timeoutMilliseconds,
			},
			typeof onTextOrOverrides === "object"
				? onTextOrOverrides
				: undefined,
		)
	}

	private async request(
		configuration: LlmConfiguration,
		messages: LlmMessage[],
		tools: LlmToolDefinition[],
		onText?: (text: string) => Promise<void>,
	): Promise<unknown> {
		const endpoint = `${configuration.baseURL.replace(/\/+$/, "")}/chat/completions`
		const requestBody = {
			...(configuration.streamOutput ? { stream: true } : {}),
			max_tokens: configuration.maximumOutputTokens,
			messages,
			model: configuration.model,
			...(configuration.reasoningEffort === ""
				? {}
				: { reasoning_effort: configuration.reasoningEffort }),
			tools,
			...(tools.length > 0
				? { parallel_tool_calls: false, tool_choice: "required" }
				: {}),
		}
		let serializedRequest: string
		try {
			serializedRequest = JSON.stringify(requestBody)
		} catch {
			throw new LlmClientError("LLM request could not be serialized")
		}
		if (
			!serializedRequest ||
			Buffer.byteLength(serializedRequest, "utf8") > MAXIMUM_REQUEST_BYTES
		) {
			throw new LlmClientError(
				"LLM request exceeds the configured context byte budget",
			)
		}
		try {
			const response = await firstValueFrom(
				this.httpService.post<unknown>(endpoint, requestBody, {
					headers: {
						Authorization: `Bearer ${configuration.apiKey}`,
						"Content-Type": "application/json",
					},
					maxBodyLength: MAXIMUM_REQUEST_BYTES,
					maxContentLength: MAXIMUM_RESPONSE_BYTES,
					maxRedirects: 0,
					responseType: configuration.streamOutput
						? "stream"
						: "json",
					timeout: configuration.timeoutMilliseconds,
					validateStatus: (status) => status >= 200 && status < 300,
				}),
			)
			if (
				typeof response.status === "number" &&
				(response.status < 200 || response.status >= 300)
			) {
				throw response.status >= 300 && response.status < 400
					? new LlmClientError("LLM provider redirect is not allowed")
					: new LlmClientError(
							`LLM provider returned HTTP ${response.status}`,
						)
			}
			if (configuration.streamOutput) {
				return await readCompletionStream(
					response.data,
					configuration.timeoutMilliseconds,
					onText,
				)
			}
			let serializedResponse: string
			try {
				serializedResponse = JSON.stringify(response.data)
			} catch {
				throw malformedResponse()
			}
			if (!serializedResponse) throw malformedResponse()
			if (
				Buffer.byteLength(serializedResponse, "utf8") >
				MAXIMUM_RESPONSE_BYTES
			) {
				throw new LlmClientError(
					"LLM provider response exceeds the configured byte budget",
				)
			}
			return response.data
		} catch (error) {
			if (error instanceof LlmClientError) throw error
			throw safeRequestError(error)
		}
	}
}

function mergeCompletionOverrides(
	configuration: LlmConfiguration,
	overrides?: LlmCompletionOverrides,
): LlmConfiguration {
	if (!overrides) {
		return configuration
	}
	const model =
		typeof overrides.model === "string" && overrides.model.trim().length
			? overrides.model.trim()
			: configuration.model
	const timeoutMilliseconds =
		typeof overrides.timeoutMilliseconds === "number" &&
		Number.isInteger(overrides.timeoutMilliseconds) &&
		overrides.timeoutMilliseconds >= 100 &&
		overrides.timeoutMilliseconds <= 120000
			? overrides.timeoutMilliseconds
			: configuration.timeoutMilliseconds
	const maximumOutputTokens =
		typeof overrides.maximumOutputTokens === "number" &&
		Number.isInteger(overrides.maximumOutputTokens) &&
		overrides.maximumOutputTokens >= 1 &&
		overrides.maximumOutputTokens <= 32768
			? overrides.maximumOutputTokens
			: configuration.maximumOutputTokens
	const reasoningEffort =
		typeof overrides.reasoningEffort === "string"
			? (overrides.reasoningEffort as LlmConfiguration["reasoningEffort"])
			: configuration.reasoningEffort
	return {
		...configuration,
		maximumOutputTokens,
		model,
		reasoningEffort,
		timeoutMilliseconds,
	}
}

function parseCompletionResponse(
	value: unknown,
	maximumOutputTokens: number,
): { message: LlmMessage; usage: unknown; model: string } {
	if (!isRecord(value)) throw malformedResponse()
	if (typeof value.model !== "string" || !value.model.trim()) {
		throw malformedResponse()
	}
	if (!Array.isArray(value.choices) || value.choices.length === 0) {
		throw malformedResponse()
	}
	const firstChoice = value.choices[0]
	if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
		throw malformedResponse()
	}
	if (firstChoice.finish_reason === "length") {
		throw new LlmClientError("LLM provider response was truncated")
	}
	if (
		hasOwn(firstChoice, "finish_reason") &&
		firstChoice.finish_reason !== null &&
		typeof firstChoice.finish_reason !== "string"
	) {
		throw malformedResponse()
	}
	const usage = hasOwn(value, "usage")
		? validateUsage(value.usage, maximumOutputTokens)
		: undefined
	return {
		message: parseAssistantMessage(firstChoice.message),
		model: value.model,
		usage,
	}
}

function parseAssistantMessage(value: Record<string, unknown>): LlmMessage {
	if (value.role !== "assistant") throw malformedResponse()
	if (
		!hasOwn(value, "content") ||
		(value.content !== null && typeof value.content !== "string")
	) {
		throw malformedResponse()
	}

	const message: LlmMessage = {
		content: value.content as string | null,
		role: "assistant",
	}
	if (hasOwn(value, "tool_calls")) {
		if (!Array.isArray(value.tool_calls)) throw malformedResponse()
		message.tool_calls = value.tool_calls.map(parseToolCall)
	}
	if (hasOwn(value, "tool_call_id")) {
		if (
			typeof value.tool_call_id !== "string" ||
			!value.tool_call_id.trim()
		) {
			throw malformedResponse()
		}
		message.tool_call_id = value.tool_call_id
	}
	return message
}

function parseToolCall(value: unknown): LlmToolCall {
	if (!isRecord(value) || !isRecord(value.function)) {
		throw malformedResponse()
	}
	if (
		typeof value.id !== "string" ||
		!value.id.trim() ||
		value.type !== "function" ||
		typeof value.function.name !== "string" ||
		!value.function.name.trim() ||
		typeof value.function.arguments !== "string" ||
		!isJSONObject(value.function.arguments)
	) {
		throw malformedResponse()
	}
	return {
		function: {
			arguments: value.function.arguments,
			name: value.function.name,
		},
		id: value.id,
		type: "function",
	}
}

function validateUsage(value: unknown, maximumOutputTokens: number): unknown {
	if (!isRecord(value)) throw malformedResponse()
	const tokenMetrics = [
		"prompt_tokens",
		"completion_tokens",
		"total_tokens",
	] as const
	for (const property of tokenMetrics) {
		if (
			hasOwn(value, property) &&
			(!Number.isInteger(value[property]) ||
				(value[property] as number) < 0)
		) {
			throw malformedResponse()
		}
	}
	if (
		typeof value.completion_tokens === "number" &&
		value.completion_tokens > maximumOutputTokens
	) {
		throw new LlmClientError(
			"LLM provider response exceeded the configured output token limit",
		)
	}
	const sanitized: Record<string, number> = {}
	for (const property of tokenMetrics) {
		if (typeof value[property] === "number") {
			sanitized[property] = value[property] as number
		}
	}
	return sanitized
}

function isJSONObject(value: string): boolean {
	try {
		const parsed: unknown = JSON.parse(value)
		return isRecord(parsed)
	} catch {
		return false
	}
}

function safeRequestError(error: unknown): LlmClientError {
	if (isAxiosError(error)) {
		const status = error.response?.status
		if (typeof status === "number") {
			if (status >= 300 && status < 400) {
				return new LlmClientError(
					"LLM provider redirect is not allowed",
				)
			}
			return new LlmClientError(`LLM provider returned HTTP ${status}`)
		}
		if (
			error.code === "ECONNABORTED" ||
			error.code === "ETIMEDOUT" ||
			error.code === "ERR_CANCELED"
		) {
			return new LlmClientError("LLM provider request timed out")
		}
		if (error.code === "ERR_FR_TOO_MANY_REDIRECTS") {
			return new LlmClientError("LLM provider redirect is not allowed")
		}
		if (error.code === "ERR_BAD_RESPONSE") {
			return new LlmClientError(
				"LLM provider response exceeds the configured byte budget",
			)
		}
	}
	if (isRecord(error) && typeof error.code === "string") {
		if (
			error.code === "ECONNABORTED" ||
			error.code === "ETIMEDOUT" ||
			error.code === "ERR_CANCELED"
		) {
			return new LlmClientError("LLM provider request timed out")
		}
		if (error.code === "ERR_FR_TOO_MANY_REDIRECTS") {
			return new LlmClientError("LLM provider redirect is not allowed")
		}
		if (error.code === "ERR_BAD_RESPONSE") {
			return new LlmClientError(
				"LLM provider response exceeds the configured byte budget",
			)
		}
	}
	return new LlmClientError("LLM provider request failed")
}

function malformedResponse(): LlmClientError {
	return new LlmClientError("LLM provider returned a malformed response")
}

function hasOwn(value: Record<string, unknown>, property: string): boolean {
	return Object.getOwnPropertyDescriptor(value, property) !== undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}
