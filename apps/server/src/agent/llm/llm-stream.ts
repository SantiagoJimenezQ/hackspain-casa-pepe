import { Readable } from "node:stream"
import { LlmToolCall } from "@agent/llm/llm.types"
import { LlmClientError } from "@agent/llm/llm-client.service"
import {
	MAXIMUM_RESPONSE_BYTES,
	MAXIMUM_STREAM_BYTES,
} from "@agent/llm/llm-response-limits"

/** Only public content leaves this parser; reasoning fields and partial tools stay private. */
export async function readCompletionStream(
	value: unknown,
	timeout: number,
	onText?: (text: string) => Promise<void>,
): Promise<unknown> {
	if (!(value instanceof Readable))
		throw new LlmClientError("LLM provider did not return a stream")
	const timer = setTimeout(
		() =>
			value.destroy(new LlmClientError("LLM provider request timed out")),
		timeout,
	)
	const decoder = new TextDecoder("utf-8", { fatal: true })
	let buffer = "",
		content = "",
		pending = "",
		model = "",
		finish: string | null = null
	let bytes = 0,
		outputBytes = 0,
		published = 0,
		done = false
	let usage: unknown
	const calls = new Map<number, LlmToolCall>()
	const invalid = () =>
		new LlmClientError("LLM provider returned a malformed stream")
	const checkBudget = (bytes: number, limit: number) => {
		if (bytes > limit)
			throw new LlmClientError(
				"LLM provider response exceeds the configured byte budget",
			)
	}
	const retain = (fragment: string) => {
		outputBytes += Buffer.byteLength(fragment, "utf8")
		checkBudget(outputBytes, MAXIMUM_RESPONSE_BYTES)
	}
	const publish = async () => {
		if (!pending) return
		const text = pending
		pending = ""
		await onText?.(text)
	}
	const frame = async (raw: string) => {
		checkBudget(Buffer.byteLength(raw, "utf8"), MAXIMUM_RESPONSE_BYTES)
		const data = raw
			.split(/\r?\n/)
			.filter((line) => line.startsWith("data:"))
			.map((line) => line.slice(5).trimStart())
			.join("\n")
		if (!data) return
		if (data === "[DONE]") {
			done = true
			return
		}
		let chunk: unknown
		try {
			chunk = JSON.parse(data)
		} catch {
			throw invalid()
		}
		if (!isRecord(chunk) || !Array.isArray(chunk.choices)) throw invalid()
		if (typeof chunk.model === "string") model = chunk.model
		if (chunk.usage != null) usage = chunk.usage
		for (const choice of chunk.choices) {
			if (!isRecord(choice) || choice.index !== 0) throw invalid()
			if (choice.finish_reason != null) {
				if (typeof choice.finish_reason !== "string") throw invalid()
				finish = choice.finish_reason
			}
			const delta = choice.delta
			if (!isRecord(delta)) throw invalid()
			if (delta.content != null) {
				if (typeof delta.content !== "string") throw invalid()
				retain(delta.content)
				content += delta.content
				const visible = delta.content
				published += visible.length
				pending += visible
				// Publish the first fragment immediately, then bounded batches to avoid per-token DB writes.
				if (published === visible.length || pending.length >= 160)
					await publish()
			}
			if (delta.tool_calls != null) {
				if (!Array.isArray(delta.tool_calls)) throw invalid()
				for (const part of delta.tool_calls) {
					if (
						!isRecord(part) ||
						typeof part.index !== "number" ||
						!Number.isInteger(part.index) ||
						part.index < 0 ||
						part.index > 31
					)
						throw invalid()
					const call = calls.get(part.index) ?? {
						function: { arguments: "", name: "" },
						id: "",
						type: "function",
					}
					if (part.type != null && part.type !== "function")
						throw invalid()
					for (const [key, target] of [
						["id", call],
						["name", call.function],
						["arguments", call.function],
					] as const) {
						const fragment =
							key === "id"
								? part.id
								: isRecord(part.function)
									? part.function[key]
									: undefined
						if (fragment != null) {
							if (typeof fragment !== "string") throw invalid()
							retain(fragment)
							;(target as unknown as Record<string, string>)[
								key
							] += fragment
						}
					}
					calls.set(part.index, call)
				}
			}
		}
	}
	try {
		for await (const chunk of value) {
			const bytesChunk = Buffer.isBuffer(chunk)
				? chunk
				: Buffer.from(chunk)
			bytes += bytesChunk.length
			checkBudget(bytes, MAXIMUM_STREAM_BYTES)
			buffer += decoder.decode(bytesChunk, { stream: true })
			while (true) {
				const boundary = /\r?\n\r?\n/.exec(buffer)
				if (!boundary) break
				const raw = buffer.slice(0, boundary.index)
				buffer = buffer.slice(boundary.index + boundary[0].length)
				await frame(raw)
				if (done) break
			}
			if (done) break
			checkBudget(
				Buffer.byteLength(buffer, "utf8"),
				MAXIMUM_RESPONSE_BYTES,
			)
		}
		if (!done || !finish || !model) throw invalid()
		await publish()
		return {
			model,
			...(usage === undefined ? {} : { usage }),
			choices: [
				{
					finish_reason: finish,
					message: {
						content: content || null,
						role: "assistant",
						...(calls.size
							? {
									tool_calls: [...calls.entries()]
										.sort(([a], [b]) => a - b)
										.map(([, call]) => call),
								}
							: {}),
					},
				},
			],
		}
	} finally {
		clearTimeout(timer)
		value.destroy()
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}
