import { randomUUID } from "node:crypto"
import {
	LlmCompletionOverrides,
	LlmMessage,
	LlmToolCall,
	LlmToolDefinition,
} from "@agent/llm/llm.types"
import { failureDetails } from "@agent/llm/llm-failure-details"
import {
	MAXIMUM_RESPONSE_BYTES,
	MAXIMUM_STREAM_BYTES,
} from "@agent/llm/llm-response-limits"
import { readCompletionStream } from "@agent/llm/llm-stream"
import { isAllowedLlmBaseURL } from "@common/configuration/configuration.factory"
import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import { ConfigurationService } from "@common/services/configuration.service"
import { LlmConfiguration } from "@common/types/configuration.type"
import { HttpService } from "@nestjs/axios"
import { Injectable, Logger } from "@nestjs/common"
import { isAxiosError } from "axios"
import { firstValueFrom } from "rxjs"

const MAXIMUM_REQUEST_BYTES = 1024 * 1024

/** A rate limit or an overloaded provider clears on its own; anything else is the caller's. */
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 500, 502, 503])
const MAXIMUM_ATTEMPTS = 5
const DEFAULT_RETRY_MILLISECONDS = 1000
const MAXIMUM_RETRY_MILLISECONDS = 30000
/** How long the relief provider keeps the traffic after the primary one turned it away. */
const RELIEF_WINDOW_MILLISECONDS = 60000

export class LlmClientError extends Error {
	/** How long the provider asked the caller to wait; zero when the failure is the caller's. */
	readonly retryAfterMilliseconds: number
	constructor(message: string, retryAfterMilliseconds = 0) {
		super(message)
		this.name = "LlmClientError"
		this.retryAfterMilliseconds = retryAfterMilliseconds
	}
}

@Injectable()
export class LlmClientService {
	private readonly logger = new Logger(LlmClientService.name)
	/** When the primary provider becomes worth trying again. */
	private reliefUntil = 0
	/** One in-flight provider request at a time; a 429 must cool down the whole process. */
	private chain: Promise<void> = Promise.resolve()
	private cooldownUntil = 0

	constructor(
		private readonly configuration: ConfigurationService,
		private readonly httpService: HttpService,
	) {}

	async complete(
		messages: LlmMessage[],
		tools: LlmToolDefinition[],
		onText?: (text: string) => Promise<void>,
		overrides: LlmCompletionOverrides = {},
	): Promise<{
		message: LlmMessage
		usage: unknown
		model: string
		finishReason?: string | null
	}> {
		return this.enqueue(() =>
			this.completeExclusive(messages, tools, onText, overrides),
		)
	}

	private enqueue<T>(work: () => Promise<T>): Promise<T> {
		const run = this.chain.then(async () => {
			await this.waitForCooldown()
			return work()
		})
		this.chain = run.then(
			() => undefined,
			() => undefined,
		)
		return run
	}

	private async waitForCooldown(): Promise<void> {
		const wait = this.cooldownUntil - Date.now()
		if (wait > 0) {
			await sleep(wait)
		}
	}

	private noteRateLimit(waitMilliseconds: number): void {
		this.cooldownUntil = Math.max(
			this.cooldownUntil,
			Date.now() + waitMilliseconds,
		)
	}

	private async completeExclusive(
		messages: LlmMessage[],
		tools: LlmToolDefinition[],
		onText: ((text: string) => Promise<void>) | undefined,
		overrides: LlmCompletionOverrides,
	): Promise<{
		message: LlmMessage
		usage: unknown
		model: string
		finishReason?: string | null
	}> {
		const configuration = mergeCompletionOverrides(
			this.providerConfiguration(),
			overrides,
		)
		const responseData = await this.attemptWithRelief(
			configuration,
			messages,
			tools,
			onText,
		)
		try {
			return parseCompletionResponse(
				responseData,
				configuration.maximumOutputTokens,
			)
		} catch (error) {
			this.logger.warn("LLM response validation failed", {
				model: configuration.model,
				providerHost: new URL(configuration.baseURL).hostname,
				reason:
					error instanceof LlmClientError
						? error.message
						: "Malformed completion",
				streamOutput: configuration.streamOutput,
			})
			throw error
		}
	}

	private providerConfiguration(): LlmConfiguration {
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

		return {
			apiKey,
			baseURL,
			fallback: configured.fallback,
			fastModel: configured.fastModel.trim(),
			fastTimeoutMilliseconds: configured.fastTimeoutMilliseconds,
			maximumOutputTokens: configured.maximumOutputTokens,
			maximumTurns: configured.maximumTurns,
			model,
			reasoningEffort: configured.reasoningEffort,
			streamOutput: configured.streamOutput === true,
			timeoutMilliseconds: configured.timeoutMilliseconds,
		}
	}

	/**
	 * A provider that keeps asking for a pause has nothing left to give this cycle, and the
	 * incident cannot wait for its quota to reset. The same request goes to the relief provider,
	 * so a rate limit on one account costs a few seconds instead of the run. A quota rarely
	 * clears between two turns, so the relief keeps the traffic for a short window instead of
	 * paying the same retries again on every turn; after it, the primary gets another chance.
	 * Any other failure is the caller's and surfaces unchanged.
	 */
	private async attemptWithRelief(
		configuration: LlmConfiguration,
		messages: LlmMessage[],
		tools: LlmToolDefinition[],
		onText?: (text: string) => Promise<void>,
	): Promise<unknown> {
		const relief = reliefConfiguration(configuration)
		if (relief && Date.now() < this.reliefUntil) {
			return await this.attempt(relief, messages, tools, onText)
		}
		try {
			return await this.attempt(configuration, messages, tools, onText)
		} catch (error) {
			const pause =
				error instanceof LlmClientError
					? error.retryAfterMilliseconds
					: 0
			if (pause === 0 || !relief) {
				throw error
			}
			this.reliefUntil = Date.now() + RELIEF_WINDOW_MILLISECONDS
			this.logger.warn(LOG_MESSAGES.AGENT.LLM_PROVIDER_RELIEVED, {
				model: relief.model,
				providerHost: new URL(relief.baseURL).hostname,
				reason:
					error instanceof LlmClientError
						? error.message
						: "LLM provider unavailable",
			})
			return await this.attempt(relief, messages, tools, onText)
		}
	}

	/**
	 * A rate limit is the provider asking for a pause, not a failed decision: pausing the whole
	 * incident over it would strand the run. The wait the provider asks for is honoured, capped,
	 * and the request is repeated a bounded number of times; every other failure surfaces at once.
	 */
	private async attempt(
		configuration: LlmConfiguration,
		messages: LlmMessage[],
		tools: LlmToolDefinition[],
		onText?: (text: string) => Promise<void>,
	): Promise<unknown> {
		for (let attempt = 1; ; attempt++) {
			try {
				return await this.request(
					configuration,
					messages,
					tools,
					onText,
				)
			} catch (error) {
				const pause =
					error instanceof LlmClientError
						? error.retryAfterMilliseconds
						: 0
				if (pause === 0 || attempt >= MAXIMUM_ATTEMPTS) {
					if (pause > 0) {
						this.noteRateLimit(pause)
					}
					throw error
				}
				const wait = Math.min(
					MAXIMUM_RETRY_MILLISECONDS,
					pause * 2 ** (attempt - 1),
				)
				this.noteRateLimit(wait)
				this.logger.warn(LOG_MESSAGES.AGENT.LLM_RETRYING, {
					attempt,
					model: configuration.model,
					waitMilliseconds: wait,
				})
				await sleep(wait)
			}
		}
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
			...(new URL(configuration.baseURL).hostname === "api.openai.com"
				? { max_completion_tokens: configuration.maximumOutputTokens }
				: { max_tokens: configuration.maximumOutputTokens }),
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
		const started = Date.now()
		const requestIdentifier = randomUUID()
		try {
			const response = await firstValueFrom(
				this.httpService.post<unknown>(endpoint, requestBody, {
					headers: {
						Authorization: `Bearer ${configuration.apiKey}`,
						"Content-Type": "application/json",
						"X-Client-Request-Id": requestIdentifier,
					},
					maxBodyLength: MAXIMUM_REQUEST_BYTES,
					maxContentLength: configuration.streamOutput
						? MAXIMUM_STREAM_BYTES
						: MAXIMUM_RESPONSE_BYTES,
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
			const data = configuration.streamOutput
				? await readCompletionStream(
						response.data,
						configuration.timeoutMilliseconds,
						onText,
					)
				: response.data
			let serializedResponse: string
			try {
				serializedResponse = JSON.stringify(data)
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
			return data
		} catch (error) {
			const safeError =
				error instanceof LlmClientError
					? error
					: safeRequestError(error)

			this.logger.warn("LLM provider request failed", {
				elapsedMilliseconds: Date.now() - started,
				maximumOutputTokens: configuration.maximumOutputTokens,
				model: configuration.model,
				providerHost: new URL(configuration.baseURL).hostname,
				reason: safeError.message,
				reasoningEffort:
					configuration.reasoningEffort || "provider-default",
				requestBytes: Buffer.byteLength(serializedRequest, "utf8"),
				requestIdentifier,
				streamOutput: configuration.streamOutput,
				timeoutMilliseconds: configuration.timeoutMilliseconds,
				toolCount: tools.length,
				...(await failureDetails(error, configuration.apiKey)),
			})
			throw safeError
		}
	}
}

/**
 * The pause the provider asked for, bounded, or zero when the status is the caller's to fix.
 * A missing or unusable Retry-After falls back to a short pause.
 */
function providerPauseMilliseconds(status: number, headers: unknown): number {
	if (!RETRYABLE_STATUSES.has(status)) {
		return 0
	}
	const header = isRecord(headers) ? headers["retry-after"] : undefined
	const requested =
		typeof header === "string" && /^\d{1,6}$/.test(header)
			? Number(header) * 1000
			: DEFAULT_RETRY_MILLISECONDS
	return Math.min(
		Math.max(requested, DEFAULT_RETRY_MILLISECONDS),
		MAXIMUM_RETRY_MILLISECONDS,
	)
}

/**
 * The same request aimed at the relief provider. A caller that asked for the fast model gets the
 * relief provider's fast model; anything else goes to its main model, because model names do not
 * carry across providers. The relief has no relief of its own, so the switch happens once.
 */
function reliefConfiguration(
	configuration: LlmConfiguration,
): LlmConfiguration | null {
	const { fallback } = configuration
	if (!fallback) {
		return null
	}
	const model =
		configuration.model === configuration.fastModel
			? fallback.fastModel
			: fallback.model
	return {
		...configuration,
		apiKey: fallback.apiKey,
		baseURL: fallback.baseURL,
		fallback: null,
		fastModel: fallback.fastModel,
		model: model.length ? model : fallback.model,
		reasoningEffort: fallback.reasoningEffort,
	}
}

function sleep(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds))
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
): {
	message: LlmMessage
	usage: unknown
	model: string
	finishReason?: string | null
} {
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
		finishReason:
			typeof firstChoice.finish_reason === "string"
				? firstChoice.finish_reason
				: null,
		message: parseAssistantMessage(firstChoice.message),
		model: value.model,
		usage,
	}
}

function parseAssistantMessage(value: Record<string, unknown>): LlmMessage {
	if (value.role !== "assistant") throw malformedResponse()
	// Providers that answer with tool calls alone may leave `content` out entirely instead of
	// sending null. That is an empty answer, not a malformed one, so only a present field of
	// the wrong shape is rejected.
	if (
		hasOwn(value, "content") &&
		value.content !== null &&
		typeof value.content !== "string"
	) {
		throw malformedResponse()
	}

	const message: LlmMessage = {
		content: typeof value.content === "string" ? value.content : null,
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
	const sanitized: Record<string, unknown> = {}
	for (const property of tokenMetrics) {
		if (typeof value[property] === "number") {
			sanitized[property] = value[property] as number
		}
	}
	for (const [group, fields] of Object.entries({
		completion_tokens_details: [
			"reasoning_tokens",
			"audio_tokens",
			"accepted_prediction_tokens",
			"rejected_prediction_tokens",
		],
		prompt_tokens_details: ["cached_tokens", "audio_tokens"],
	})) {
		if (!isRecord(value[group])) continue
		const details: Record<string, number> = {}
		for (const field of fields) {
			const metric = value[group][field]
			if (
				typeof metric === "number" &&
				Number.isSafeInteger(metric) &&
				metric >= 0
			)
				details[field] = metric
		}
		if (Object.keys(details).length) sanitized[group] = details
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
		if (typeof status === "number" && (status < 200 || status >= 300)) {
			if (status >= 300 && status < 400) {
				return new LlmClientError(
					"LLM provider redirect is not allowed",
				)
			}
			return new LlmClientError(
				`LLM provider returned HTTP ${status}`,
				providerPauseMilliseconds(status, error.response?.headers),
			)
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
			return badResponseError(error.message)
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
			return badResponseError(error.message)
		}
	}
	return new LlmClientError("LLM provider request failed")
}

function badResponseError(message: unknown): LlmClientError {
	if (
		typeof message === "string" &&
		/^maxContentLength size of \d+ exceeded$/.test(message)
	) {
		return new LlmClientError(
			"LLM provider response exceeds the configured byte budget",
		)
	}
	if (message === "stream has been aborted") {
		return new LlmClientError("LLM provider response was interrupted")
	}
	return malformedResponse()
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
