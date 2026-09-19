const REDACTED = "[REDACTED]"
const CIRCULAR = "[Circular]"
const MAX_DEPTH = 8
const MAX_NODES = 1_000
const MAX_STRING_LENGTH = 8_192
const MAX_OUTPUT_CHARACTERS = 65_536

type DiagnosticRecord = Record<string, unknown>

interface SanitizerState {
	readonly active: WeakSet<object>
	readonly sensitiveValues: readonly string[]
	nodes: number
}

/**
 * Convert provider diagnostics into bounded JSON-safe data before logging them.
 *
 * Provider responses and errors are intentionally treated as untrusted input:
 * credentials can appear in headers, URLs, error messages, or nested causes,
 * while provider failures can also contain cycles and arbitrarily large bodies.
 */
export function sanitizeProviderDiagnostic(
	value: unknown,
	sensitiveValues: readonly string[] = [],
): unknown {
	const state: SanitizerState = {
		active: new WeakSet<object>(),
		nodes: 0,
		sensitiveValues: [
			...new Set(sensitiveValues.filter(isNonEmptyString)),
		].sort((left, right) => right.length - left.length),
	}

	return boundOutput(sanitizeValue(value, state, 0))
}

function sanitizeValue(
	value: unknown,
	state: SanitizerState,
	depth: number,
	key?: string,
): unknown {
	if (isSensitiveKey(key)) {
		return REDACTED
	}

	if (depth > MAX_DEPTH) {
		return "[MaxDepth]"
	}
	if (state.nodes >= MAX_NODES) {
		return "[MaxItems]"
	}
	state.nodes += 1

	if (value === null) {
		return null
	}

	switch (typeof value) {
		case "string":
			return sanitizeText(value, state)
		case "boolean":
			return value
		case "number":
			return Number.isFinite(value) ? value : null
		case "bigint":
			return sanitizeText(value.toString(), state)
		case "symbol":
			return sanitizeText(String(value), state)
		case "function":
			return "[Function]"
		case "undefined":
			return null
		case "object":
			return sanitizeObject(value, state, depth)
		default:
			return null
	}
}

function sanitizeObject(
	value: object,
	state: SanitizerState,
	depth: number,
): unknown {
	if (state.active.has(value)) {
		return CIRCULAR
	}

	if (value instanceof Date) {
		return sanitizeText(
			Number.isNaN(value.getTime())
				? "Invalid Date"
				: value.toISOString(),
			state,
		)
	}

	if (isBinaryValue(value)) {
		return "[Binary data]"
	}

	state.active.add(value)
	try {
		if (value instanceof Error) {
			return sanitizeError(value, state, depth)
		}

		if (value instanceof Map) {
			return sanitizeMap(value, state, depth)
		}

		if (value instanceof Set) {
			return sanitizeSet(value, state, depth)
		}

		if (Array.isArray(value)) {
			return sanitizeArray(value, state, depth)
		}

		return sanitizeRecord(value, state, depth)
	} finally {
		state.active.delete(value)
	}
}

function sanitizeError(
	error: Error,
	state: SanitizerState,
	depth: number,
): DiagnosticRecord {
	const output: DiagnosticRecord = {
		message: sanitizeText(error.message, state),
		name: sanitizeText(error.name, state),
	}

	if (typeof error.stack === "string") {
		output.stack = sanitizeText(error.stack, state)
	}

	let cause: unknown
	try {
		cause = (error as Error & { readonly cause?: unknown }).cause
	} catch {
		cause = "[Unreadable]"
	}
	if (cause !== undefined) {
		output.cause = sanitizeValue(cause, state, depth + 1, "cause")
	}

	for (const property of safePropertyNames(error)) {
		if (
			property === "name" ||
			property === "message" ||
			property === "stack" ||
			property === "cause"
		) {
			continue
		}
		setRecordProperty(
			output,
			sanitizePropertyName(property, state),
			readAndSanitizeProperty(error, property, state, depth),
		)
	}

	return output
}

function sanitizeArray(
	value: readonly unknown[],
	state: SanitizerState,
	depth: number,
): unknown[] {
	const output: unknown[] = []
	for (let index = 0; index < value.length; index += 1) {
		if (state.nodes >= MAX_NODES) {
			output.push("[MaxItems]")
			break
		}
		output.push(
			sanitizeValue(readArrayValue(value, index), state, depth + 1),
		)
	}
	return output
}

function sanitizeMap(
	value: Map<unknown, unknown>,
	state: SanitizerState,
	depth: number,
): unknown[] {
	const output: unknown[] = []
	for (const [mapKey, mapValue] of value) {
		if (state.nodes >= MAX_NODES) {
			output.push("[MaxItems]")
			break
		}
		output.push([
			sanitizeValue(mapKey, state, depth + 1),
			typeof mapKey === "string" && isSensitiveKey(mapKey)
				? REDACTED
				: sanitizeValue(
						mapValue,
						state,
						depth + 1,
						typeof mapKey === "string" ? mapKey : undefined,
					),
		])
	}
	return output
}

function sanitizeSet(
	value: Set<unknown>,
	state: SanitizerState,
	depth: number,
): unknown[] {
	const output: unknown[] = []
	for (const entry of value) {
		if (state.nodes >= MAX_NODES) {
			output.push("[MaxItems]")
			break
		}
		output.push(sanitizeValue(entry, state, depth + 1))
	}
	return output
}

function sanitizeRecord(
	value: object,
	state: SanitizerState,
	depth: number,
): DiagnosticRecord {
	const output: DiagnosticRecord = {}
	for (const property of safePropertyNames(value)) {
		if (state.nodes >= MAX_NODES) {
			setRecordProperty(output, "_truncated", true)
			break
		}
		setRecordProperty(
			output,
			sanitizePropertyName(property, state),
			readAndSanitizeProperty(value, property, state, depth),
		)
	}
	return output
}

function readAndSanitizeProperty(
	value: object,
	property: string,
	state: SanitizerState,
	depth: number,
): unknown {
	if (isSensitiveKey(property)) {
		return REDACTED
	}

	try {
		return sanitizeValue(
			(value as DiagnosticRecord)[property],
			state,
			depth + 1,
			property,
		)
	} catch {
		return "[Unreadable]"
	}
}

function sanitizeText(value: string, state: SanitizerState): string {
	let sanitized = value
	for (const sensitiveValue of state.sensitiveValues) {
		sanitized = replaceAllLiteral(sanitized, sensitiveValue, REDACTED)
		const encoded = safelyEncodeURIComponent(sensitiveValue)
		if (encoded && encoded !== sensitiveValue) {
			sanitized = replaceAllLiteral(sanitized, encoded, REDACTED)
		}
		const escaped = safelyJsonEscape(sensitiveValue)
		if (escaped && escaped !== sensitiveValue) {
			sanitized = replaceAllLiteral(sanitized, escaped, REDACTED)
		}
	}

	// Scrub credentials from free-form provider messages and URLs as well as
	// from structured objects. This runs before truncation so a secret cannot be
	// split at a bound and leave a recoverable fragment in the log.
	sanitized = sanitizeAuthorization(sanitized)
	sanitized = sanitizeCredentialParameters(sanitized)
	sanitized = sanitizeURLUserInfo(sanitized)

	if (sanitized.length > MAX_STRING_LENGTH) {
		const suffix = "...[Truncated]"
		sanitized = `${sanitized.slice(0, MAX_STRING_LENGTH - suffix.length)}${suffix}`
	}
	return sanitized
}

function sanitizeAuthorization(value: string): string {
	const quotedAuthorizationPattern =
		/(\b(?:authorization|proxy-authorization)\b["']?\s*[:=]\s*)(["'])(?:(bearer|basic|token)\s+)?[^"']*\2/gi
	const authorizationPattern =
		/(\b(?:authorization|proxy-authorization)\b["']?\s*[:=]\s*)(?:(bearer|basic|token)\s+)?([^\s,;&}"']+)/gi
	const quotedProviderKeyPattern =
		/(\b(?:xi?-?api-?key|x-api-key|api[_-]?key)\b["']?\s*[:=]\s*)(["'])[^"']*\2/gi
	const providerKeyPattern =
		/(\b(?:xi?-?api-?key|x-api-key|api[_-]?key)\b["']?\s*[:=]\s*)([^\s,;&}"']+)/gi
	const cookiePattern =
		/(\b(?:cookie|set-cookie)\b["']?\s*[:=]\s*)(["']?)[^\r\n"']*\2/gi
	let sanitized = value.replace(
		quotedAuthorizationPattern,
		(_match, prefix: string, quote: string, scheme?: string) =>
			`${prefix}${quote}${scheme ? `${scheme} ` : ""}${REDACTED}${quote}`,
	)
	sanitized = sanitized.replace(
		authorizationPattern,
		(_match, prefix: string, scheme?: string) =>
			`${prefix}${scheme ? `${scheme} ` : ""}${REDACTED}`,
	)
	sanitized = sanitized.replace(
		quotedProviderKeyPattern,
		(_match, prefix: string, quote: string) =>
			`${prefix}${quote}${REDACTED}${quote}`,
	)
	sanitized = sanitized.replace(
		providerKeyPattern,
		(_match, prefix: string) => `${prefix}${REDACTED}`,
	)
	sanitized = sanitized.replace(
		cookiePattern,
		(_match, prefix: string, quote: string) =>
			`${prefix}${quote}${REDACTED}${quote}`,
	)
	// A provider may put a bearer/basic value in a free-form error without
	// repeating the header name. Keep the scheme for diagnosis and remove the
	// credential itself.
	return sanitized.replace(
		/\b(bearer|basic)\s+([A-Za-z0-9._~+/=-]+)\b/gi,
		(_match, scheme: string) => `${scheme} ${REDACTED}`,
	)
}

function sanitizeCredentialParameters(value: string): string {
	const credentialPattern =
		/([?&\s[{(,;]|^)(?:["']?)(api[_-]?key|xi[_-]?api[_-]?key|x-api-key|access[_-]?token|refresh[_-]?token|id[_-]?token|token|password|passwd|secret|credential|credentials)(?:["']?)(\s*[=:]\s*["']?)([^&\s,;}'"]+)/gi
	return value.replace(credentialPattern, `$1$2$3${REDACTED}`)
}

function sanitizeURLUserInfo(value: string): string {
	return value.replace(
		/(https?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi,
		`$1${REDACTED}:${REDACTED}@`,
	)
}

function isSensitiveKey(key: string | undefined): boolean {
	if (!key) {
		return false
	}

	const normalized = normalizeKey(key)
	if (!normalized) {
		return false
	}

	if (
		normalized === "transcript" ||
		normalized === "prompt" ||
		normalized === "dynamic variables" ||
		normalized === "dynamic variable"
	) {
		return true
	}

	if (
		/(^| )(secret|secrets|password|passwords|passwd|credential|credentials|cookie|cookies|authorization|proxy authorization|auth)( |$)/.test(
			normalized,
		)
	) {
		return true
	}

	if (/(^| )(api key|api keys|xi api key|x api key)( |$)/.test(normalized)) {
		return true
	}

	const words = normalized.split(" ")
	const lastWord = words[words.length - 1]
	if (
		["token", "tokens"].includes(lastWord) &&
		!["count", "usage", "limit", "budget"].includes(
			words[words.length - 2] ?? "",
		)
	) {
		return true
	}

	if (
		words.some((word) =>
			[
				"phone",
				"phones",
				"email",
				"emails",
				"name",
				"names",
				"fullname",
				"firstname",
				"lastname",
			].includes(word),
		) ||
		normalized === "to number" ||
		normalized === "from number" ||
		normalized === "destination" ||
		normalized === "recipient"
	) {
		return true
	}

	return false
}

function normalizeKey(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
}

function safePropertyNames(value: object): string[] {
	try {
		return Object.getOwnPropertyNames(value)
	} catch {
		return []
	}
}

function readArrayValue(value: readonly unknown[], index: number): unknown {
	try {
		return value[index]
	} catch {
		return "[Unreadable]"
	}
}

function replaceAllLiteral(
	value: string,
	search: string,
	replacement: string,
): string {
	return value.split(search).join(replacement)
}

function safelyEncodeURIComponent(value: string): string {
	try {
		return encodeURIComponent(value)
	} catch {
		return ""
	}
}

function safelyJsonEscape(value: string): string {
	try {
		const encoded = JSON.stringify(value)
		return encoded ? encoded.slice(1, -1) : ""
	} catch {
		return ""
	}
}

function sanitizePropertyName(value: string, state: SanitizerState): string {
	let sanitized = value
	for (const sensitiveValue of state.sensitiveValues) {
		sanitized = replaceAllLiteral(sanitized, sensitiveValue, REDACTED)
		const encoded = safelyEncodeURIComponent(sensitiveValue)
		if (encoded && encoded !== sensitiveValue) {
			sanitized = replaceAllLiteral(sanitized, encoded, REDACTED)
		}
		const escaped = safelyJsonEscape(sensitiveValue)
		if (escaped && escaped !== sensitiveValue) {
			sanitized = replaceAllLiteral(sanitized, escaped, REDACTED)
		}
	}
	return sanitized.length > MAX_STRING_LENGTH
		? `${sanitized.slice(0, MAX_STRING_LENGTH - 14)}...[Truncated]`
		: sanitized
}

function setRecordProperty(
	record: DiagnosticRecord,
	property: string,
	value: unknown,
): void {
	Object.defineProperty(record, property, {
		configurable: true,
		enumerable: true,
		value,
		writable: true,
	})
}

function boundOutput(value: unknown): unknown {
	const serialized = JSON.stringify(value)
	if (serialized.length <= MAX_OUTPUT_CHARACTERS) {
		return value
	}
	return trimOutput(value, MAX_OUTPUT_CHARACTERS)
}

function trimOutput(value: unknown, limit: number): unknown {
	if (limit <= 0) {
		return null
	}

	if (typeof value === "string") {
		return fitString(value, limit)
	}

	if (
		value === null ||
		typeof value === "boolean" ||
		typeof value === "number"
	) {
		return fits(value, limit) ? value : null
	}

	if (Array.isArray(value)) {
		const output: unknown[] = []
		for (const entry of value) {
			const available = limit - JSON.stringify(output).length - 2
			if (available <= 0) {
				break
			}
			const candidate = trimOutput(entry, available)
			const next = [...output, candidate]
			if (JSON.stringify(next).length > limit) {
				break
			}
			output.push(candidate)
		}
		return output
	}

	if (isPlainRecord(value)) {
		const output: DiagnosticRecord = {}
		const properties = Object.keys(value).sort(
			(left, right) =>
				diagnosticPriority(right) - diagnosticPriority(left),
		)
		for (const property of properties) {
			const currentLength = JSON.stringify(output).length
			const keyLength = JSON.stringify(property).length + 1
			const available = limit - currentLength - keyLength - 2
			if (available <= 0) {
				break
			}
			const candidate = trimOutput(value[property], available)
			setRecordProperty(output, property, candidate)
			if (JSON.stringify(output).length > limit) {
				delete output[property]
				break
			}
		}
		return output
	}

	return null
}

function fitString(value: string, limit: number): string {
	if (JSON.stringify(value).length <= limit) {
		return value
	}

	const suffix = "...[Truncated]"
	let low = 0
	let high = value.length
	let best = ""
	while (low <= high) {
		const middle = Math.floor((low + high) / 2)
		const candidate = `${value.slice(0, middle)}${suffix}`
		if (JSON.stringify(candidate).length <= limit) {
			best = candidate
			low = middle + 1
		} else {
			high = middle - 1
		}
	}
	if (best) {
		return best
	}
	return JSON.stringify("[Truncated]").length <= limit ? "[Truncated]" : ""
}

function fits(value: unknown, limit: number): boolean {
	return JSON.stringify(value).length <= limit
}

function diagnosticPriority(property: string): number {
	const normalized = normalizeKey(property)
	const priorities: Record<string, number> = {
		cause: 10,
		code: 100,
		event: 92,
		"http status": 98,
		message: 96,
		name: 89,
		operation: 93,
		provider: 91,
		reason: 95,
		"request ids": 90,
		stack: 20,
		stage: 94,
		status: 99,
		"status code": 97,
	}
	return priorities[normalized] ?? 50
}

function isPlainRecord(value: unknown): value is DiagnosticRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: string): boolean {
	return typeof value === "string" && value.length > 0
}

function isBinaryValue(value: object): boolean {
	return (
		(typeof Buffer !== "undefined" && Buffer.isBuffer(value)) ||
		ArrayBuffer.isView(value)
	)
}
