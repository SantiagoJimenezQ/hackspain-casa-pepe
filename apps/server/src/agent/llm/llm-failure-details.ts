import { Readable } from "node:stream"

const CODES = new Set([
	"invalid_api_key",
	"invalid_request_error",
	"authentication_error",
	"permission_denied",
	"model_not_found",
	"unsupported_parameter",
	"unsupported_value",
	"context_length_exceeded",
	"rate_limit_exceeded",
	"insufficient_quota",
	"server_error",
	"invalid_request",
	"overloaded_error",
	"tokens",
	"requests",
	"billing_hard_limit_reached",
])
const PARAMS = new Set([
	"model",
	"max_tokens",
	"max_completion_tokens",
	"reasoning_effort",
	"temperature",
	"tools",
	"tool_choice",
	"parallel_tool_calls",
	"messages",
	"stream",
])
const NETWORK_CODES = new Set([
	"ECONNABORTED",
	"ETIMEDOUT",
	"ERR_CANCELED",
	"ENOTFOUND",
	"EAI_AGAIN",
	"ECONNREFUSED",
	"ECONNRESET",
	"CERT_HAS_EXPIRED",
	"UNABLE_TO_VERIFY_LEAF_SIGNATURE",
	"ERR_BAD_RESPONSE",
	"ERR_BAD_REQUEST",
	"ERR_FR_TOO_MANY_REDIRECTS",
])

/** Provider messages can echo prompts or credentials: extract categories, never log raw text. */
export async function failureDetails(error: unknown, apiKey: string) {
	const record = asRecord(error)
	const response = asRecord(record.response)
	const headers = asRecord(response.headers)
	const data = await errorBody(response.data)
	const providerError = asRecord(asRecord(data).error)
	const message =
		typeof providerError.message === "string" ? providerError.message : ""
	const safeToken = (value: unknown) =>
		typeof value === "string" &&
		/^[a-zA-Z0-9_.:-]{1,128}$/.test(value) &&
		!value.includes(apiKey) &&
		!/^sk[-_]/.test(value)
			? value
			: undefined
	return {
		hint: /max_tokens.*max_completion_tokens/i.test(message)
			? "Use max_completion_tokens for this model"
			: /reasoning_effort/i.test(message)
				? "Check the model's supported reasoning effort values"
				: /quota|billing|credit/i.test(message)
					? "Check provider billing and available quota"
					: /model.*(not found|does not exist|access)/i.test(message)
						? "Check model ID and project access"
						: /rate limit/i.test(message)
							? "Provider rate limit reached"
							: undefined,
		httpStatus:
			typeof response.status === "number" ? response.status : undefined,
		networkCode: NETWORK_CODES.has(String(record.code))
			? record.code
			: undefined,
		parameter: PARAMS.has(String(providerError.param))
			? providerError.param
			: undefined,
		providerCode: CODES.has(String(providerError.code))
			? providerError.code
			: undefined,
		providerRequestId: safeToken(
			headers["x-request-id"] ?? headers["request-id"],
		),
		providerType: CODES.has(String(providerError.type))
			? providerError.type
			: undefined,
		retryAfterSeconds:
			typeof headers["retry-after"] === "string" &&
			/^\d{1,6}$/.test(headers["retry-after"])
				? Number(headers["retry-after"])
				: undefined,
	}
}

function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {}
}

async function errorBody(value: unknown): Promise<unknown> {
	if (value instanceof Readable) {
		const timer = setTimeout(() => value.destroy(), 250)
		const chunks: Buffer[] = []
		let bytes = 0
		try {
			for await (const chunk of value) {
				const buffer = Buffer.isBuffer(chunk)
					? chunk
					: Buffer.from(chunk)
				bytes += buffer.length
				if (bytes > 8192) return undefined
				chunks.push(buffer)
			}
			return JSON.parse(Buffer.concat(chunks).toString("utf8"))
		} catch {
			return undefined
		} finally {
			clearTimeout(timer)
			value.destroy()
		}
	}
	if (typeof value === "string") {
		if (Buffer.byteLength(value) > 8192) return undefined
		try {
			return JSON.parse(value)
		} catch {
			return undefined
		}
	}
	return value
}
