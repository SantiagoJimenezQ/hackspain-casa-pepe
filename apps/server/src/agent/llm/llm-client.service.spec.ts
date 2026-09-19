import { PassThrough, Readable } from "node:stream"
import { LlmMessage, LlmToolDefinition } from "@agent/llm/llm.types"
import { LlmClientService } from "@agent/llm/llm-client.service"
import { ConfigurationService } from "@common/services/configuration.service"
import { LlmConfiguration } from "@common/types/configuration.type"
import { HttpService } from "@nestjs/axios"
import { Logger } from "@nestjs/common"
import { of, throwError } from "rxjs"

const CONFIGURATION: LlmConfiguration = {
	apiKey: "test-provider-key",
	baseURL: "https://provider.example.test/v1",
	fallback: null,
	fastModel: "",
	fastTimeoutMilliseconds: 5000,
	maximumOutputTokens: 128,
	maximumTurns: 24,
	model: "test-model",
	reasoningEffort: "",
	timeoutMilliseconds: 5000,
}

const TOOL: LlmToolDefinition = {
	function: {
		description: "Select the next action",
		name: "execute_step",
		parameters: {
			additionalProperties: false,
			properties: { stepIdentifier: { type: "string" } },
			required: ["stepIdentifier"],
			type: "object",
		},
	},
	type: "function",
}

function completion(
	data: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		choices: [
			{
				finish_reason: "stop",
				message: { content: "Ready", role: "assistant" },
			},
		],
		model: "provider-model",
		usage: {
			completion_tokens: 4,
			prompt_tokens: 12,
			total_tokens: 16,
		},
		...data,
	}
}

function setup(configuration: Partial<LlmConfiguration> = {}) {
	const post = jest
		.fn()
		.mockReturnValue(of({ data: completion(), status: 200 }))
	const httpService = { post } as unknown as HttpService
	const configService = {
		llm: { ...CONFIGURATION, ...configuration },
	} as ConfigurationService
	return {
		client: new LlmClientService(configService, httpService),
		post,
	}
}

describe("LlmClientService", () => {
	it("preserves finish reason and allowlisted numeric usage details only", async () => {
		const { client, post } = setup()
		post.mockReturnValue(
			of({
				data: completion({
					usage: {
						completion_tokens_details: {
							reasoning_tokens: 5,
							secret: "hidden",
						},
						prompt_tokens_details: { cached_tokens: 3 },
						provider_secret: "hidden",
						total_tokens: 12,
					},
				}),
				status: 200,
			}),
		)
		const result = await client.complete([], [])
		expect(result.finishReason).toBe("stop")
		expect(result.usage).toEqual({
			completion_tokens_details: { reasoning_tokens: 5 },
			prompt_tokens_details: { cached_tokens: 3 },
			total_tokens: 12,
		})
	})

	it("logs request context and safe provider metadata without exposing content or keys", async () => {
		const warn = jest
			.spyOn(Logger.prototype, "warn")
			.mockImplementation(() => {})
		try {
			const { client, post } = setup({
				baseURL: "https://api.openai.com/v1",
				reasoningEffort: "medium",
			})
			post.mockReturnValue(
				throwError(() => ({
					code: "ERR_BAD_REQUEST",
					config: {
						headers: { Authorization: "Bearer test-provider-key" },
					},
					isAxiosError: true,
					response: {
						data: {
							error: {
								code: "unsupported_parameter",
								message:
									"private-incident max_tokens use max_completion_tokens test-provider-key",
								param: "max_tokens",
							},
						},
						headers: { "x-request-id": "req-test" },
						status: 400,
					},
				})),
			)
			await expect(
				client.complete(
					[{ content: "private-incident", role: "user" }],
					[TOOL],
				),
			).rejects.toThrow("HTTP 400")
			expect(warn).toHaveBeenCalledWith(
				"LLM provider request failed",
				expect.objectContaining({
					elapsedMilliseconds: expect.any(Number),
					httpStatus: 400,
					model: "test-model",
					providerCode: "unsupported_parameter",
					providerHost: "api.openai.com",
					providerRequestId: "req-test",
					requestIdentifier: expect.any(String),
				}),
			)
			expect(JSON.stringify(warn.mock.calls)).not.toMatch(
				/private-incident|test-provider-key|Bearer/,
			)
		} finally {
			warn.mockRestore()
		}
	})

	it("uses the reasoning-inclusive token parameter for OpenAI", async () => {
		const { client, post } = setup({
			baseURL: "https://api.openai.com/v1",
			reasoningEffort: "medium",
		})
		await client.complete([{ content: "Test", role: "user" }], [TOOL])
		expect(post.mock.calls[0][1]).toMatchObject({
			max_completion_tokens: 128,
			reasoning_effort: "medium",
		})
		expect(post.mock.calls[0][1]).not.toHaveProperty("max_tokens")
	})

	it("sends the bounded OpenAI-compatible chat request", async () => {
		const { client, post } = setup()
		const messages: LlmMessage[] = [
			{ content: "Investigate", role: "user" },
		]

		const result = await client.complete(messages, [TOOL])

		expect(post).toHaveBeenCalledWith(
			"https://provider.example.test/v1/chat/completions",
			expect.objectContaining({
				max_tokens: 128,
				messages,
				model: "test-model",
				parallel_tool_calls: false,
				tool_choice: "required",
				tools: [TOOL],
			}),
			expect.objectContaining({
				headers: {
					Authorization: "Bearer test-provider-key",
					"Content-Type": "application/json",
					"X-Client-Request-Id": expect.any(String),
				},
				maxBodyLength: 1024 * 1024,
				maxContentLength: 1024 * 1024,
				maxRedirects: 0,
				timeout: 5000,
			}),
		)
		expect(result.model).toBe("provider-model")
	})

	it("returns validated assistant tool calls and sanitized usage", async () => {
		const { client, post } = setup()
		post.mockReturnValue(
			of({
				data: completion({
					choices: [
						{
							finish_reason: "tool_calls",
							message: {
								content: null,
								role: "assistant",
								tool_calls: [
									{
										function: {
											arguments:
												'{"stepIdentifier":"step_orders"}',
											name: "execute_step",
										},
										id: "call_1",
										type: "function",
									},
								],
							},
						},
					],
					usage: {
						completion_tokens: 20,
						prompt_tokens: 50,
						provider_secret: "must-not-be-persisted",
						total_tokens: 70,
					},
				}),
				status: 200,
			}),
		)

		const result = await client.complete(
			[{ content: "Choose", role: "user" }],
			[TOOL],
		)

		expect(result.message.tool_calls).toEqual([
			{
				function: {
					arguments: '{"stepIdentifier":"step_orders"}',
					name: "execute_step",
				},
				id: "call_1",
				type: "function",
			},
		])
		expect(result.usage).toEqual({
			completion_tokens: 20,
			prompt_tokens: 50,
			total_tokens: 70,
		})
	})

	it("does not require tool controls when no tools are supplied", async () => {
		const { client, post } = setup()

		await client.complete([{ content: "Answer", role: "user" }], [])

		expect(post.mock.calls[0][1]).not.toHaveProperty("tool_choice")
		expect(post.mock.calls[0][1]).not.toHaveProperty("parallel_tool_calls")
	})

	it("fails at call time when provider configuration is missing", async () => {
		const { client, post } = setup({
			apiKey: "secret-that-must-not-escape",
			model: "",
		})

		const error = await client
			.complete([{ content: "Answer", role: "user" }], [])
			.catch((value: unknown) => value as Error)

		expect(error).toBeInstanceOf(Error)
		expect(error.message).toMatch(/LLM provider is not configured/)
		expect(error.message).not.toContain("secret-that-must-not-escape")
		expect(post).not.toHaveBeenCalled()
	})

	it("allows HTTP only for loopback test providers", async () => {
		const loopback = setup({ baseURL: "http://127.0.0.1:4100" })
		await loopback.client.complete(
			[{ content: "Answer", role: "user" }],
			[],
		)
		expect(loopback.post).toHaveBeenCalled()

		const publicHTTP = setup({ baseURL: "http://provider.example.test" })
		await expect(
			publicHTTP.client.complete(
				[{ content: "Answer", role: "user" }],
				[],
			),
		).rejects.toThrow(/HTTPS|loopback/)
		expect(publicHTTP.post).not.toHaveBeenCalled()
	})

	it("rejects redirects without following them", async () => {
		const { client, post } = setup()
		post.mockReturnValue(of({ data: {}, status: 307 }))

		await expect(
			client.complete([{ content: "Answer", role: "user" }], []),
		).rejects.toThrow(/redirect/i)
	})

	it("waits the pause a rate limit asks for and then completes", async () => {
		jest.useFakeTimers()
		const { client, post } = setup()
		const limited = Object.assign(new Error("rate limited"), {
			isAxiosError: true,
			response: { headers: { "retry-after": "2" }, status: 429 },
		})
		post.mockReturnValueOnce(throwError(() => limited)).mockReturnValue(
			of({ data: completion(), status: 200 }),
		)

		const pending = client.complete([{ content: "Go", role: "user" }], [])
		await jest.advanceTimersByTimeAsync(2000)
		const result = await pending

		expect(result.message.content).toBe("Ready")
		expect(post).toHaveBeenCalledTimes(2)
		jest.useRealTimers()
	})

	it("gives up on a rate limit that outlives the allowed attempts", async () => {
		jest.useFakeTimers()
		const { client, post } = setup()
		post.mockReturnValue(
			throwError(() =>
				Object.assign(new Error("rate limited"), {
					isAxiosError: true,
					response: { headers: {}, status: 429 },
				}),
			),
		)

		const pending = client
			.complete([{ content: "Go", role: "user" }], [])
			.catch((value: unknown) => value as Error)
		await jest.advanceTimersByTimeAsync(10000)
		const failure = await pending

		expect(failure.message).toBe("LLM provider returned HTTP 429")
		expect(post).toHaveBeenCalledTimes(3)
		jest.useRealTimers()
	})

	it("surfaces a client error without retrying", async () => {
		const { client, post } = setup()
		post.mockReturnValue(
			throwError(() =>
				Object.assign(new Error("bad request"), {
					isAxiosError: true,
					response: { headers: {}, status: 400 },
				}),
			),
		)

		await expect(
			client.complete([{ content: "Go", role: "user" }], []),
		).rejects.toThrow("LLM provider returned HTTP 400")
		expect(post).toHaveBeenCalledTimes(1)
	})

	it("sanitizes network and timeout errors", async () => {
		const network = setup()
		network.post.mockReturnValue(
			throwError(
				() =>
					new Error(
						"request https://provider.test with secret-provider-key failed",
					),
			),
		)
		const networkError = await network.client
			.complete([{ content: "Answer", role: "user" }], [])
			.catch((value: unknown) => value as Error)
		expect(networkError.message).toBe("LLM provider request failed")
		expect(networkError.message).not.toContain("secret-provider-key")

		const timeout = setup()
		timeout.post.mockReturnValue(
			throwError(() => ({
				code: "ECONNABORTED",
				message: "secret timeout",
			})),
		)
		await expect(
			timeout.client.complete([{ content: "Answer", role: "user" }], []),
		).rejects.toThrow(/timed out/)
	})

	it.each([
		["missing choices", { choices: [], model: "provider-model" }],
		[
			"message content of the wrong type",
			{
				choices: [{ message: { content: 12, role: "assistant" } }],
				model: "provider-model",
			},
		],
		[
			"invalid tool arguments",
			{
				choices: [
					{
						message: {
							content: null,
							role: "assistant",
							tool_calls: [
								{
									function: {
										arguments: "{",
										name: "execute_step",
									},
									id: "call_1",
									type: "function",
								},
							],
						},
					},
				],
				model: "provider-model",
			},
		],
	] as Array<[string, Record<string, unknown>]>)(
		"rejects malformed responses: %s",
		async (_caseName, data) => {
			const { client, post } = setup()
			post.mockReturnValue(of({ data, status: 200 }))

			await expect(
				client.complete([{ content: "Answer", role: "user" }], [TOOL]),
			).rejects.toThrow(/malformed/)
		},
	)

	it("rejects truncated completions and output usage over the configured limit", async () => {
		const truncated = setup()
		truncated.post.mockReturnValue(
			of({
				data: completion({
					choices: [
						{
							finish_reason: "length",
							message: { content: "partial", role: "assistant" },
						},
					],
				}),
				status: 200,
			}),
		)
		await expect(
			truncated.client.complete(
				[{ content: "Answer", role: "user" }],
				[],
			),
		).rejects.toThrow(/truncated/)

		const overLimit = setup()
		overLimit.post.mockReturnValue(
			of({
				data: completion({ usage: { completion_tokens: 129 } }),
				status: 200,
			}),
		)
		await expect(
			overLimit.client.complete(
				[{ content: "Answer", role: "user" }],
				[],
			),
		).rejects.toThrow(/output token limit/)
	})

	it("rejects an oversized context without truncating it", async () => {
		const { client, post } = setup()

		await expect(
			client.complete(
				[{ content: "x".repeat(1024 * 1024), role: "user" }],
				[],
			),
		).rejects.toThrow(/context byte budget/)
		expect(post).not.toHaveBeenCalled()
	})
})

describe("feature-flagged public output streaming", () => {
	const event = (delta: unknown, finish_reason: string | null = null) =>
		`data: ${JSON.stringify({ choices: [{ delta, finish_reason, index: 0 }], model: "provider-model" })}\r\n\r\n`
	const ending = `${event({}, "tool_calls")}data: [DONE]\r\n\r\n`
	const toolStart = {
		tool_calls: [
			{
				function: { arguments: '{"step', name: "execute_step" },
				id: "call-1",
				index: 0,
				type: "function",
			},
		],
	}
	const toolEnd = {
		tool_calls: [
			{ function: { arguments: 'Identifier":"abc"}' }, index: 0 },
		],
	}

	it("streams public text before completion, reassembles fragmented tools, and ignores private reasoning", async () => {
		const { client, post } = setup({ streamOutput: true })
		const stream = new PassThrough()
		post.mockReturnValue(of({ data: stream, status: 200 }))
		let announce!: () => void
		const emitted = new Promise<void>((resolve) => {
			announce = resolve
		})
		const onText = jest.fn(async () => {
			announce()
		})
		let settled = false
		const response = client.complete([], [TOOL], onText).then((result) => {
			settled = true
			return result
		})
		const first = Buffer.from(
			event({ content: "Verificación", reasoning_content: "PRIVATE" }),
		)
		for (const byte of first) stream.write(Buffer.from([byte]))
		await emitted
		expect(settled).toBe(false)
		expect(onText).toHaveBeenCalledWith("Verificación")
		stream.end(event(toolStart) + event(toolEnd) + ending)
		const result = await response
		expect(result.message.tool_calls?.[0].function.arguments).toBe(
			'{"stepIdentifier":"abc"}',
		)
		expect(JSON.stringify(result)).not.toContain("PRIVATE")
		expect(post.mock.calls[0][1].stream).toBe(true)
	})

	it("keeps the default JSON request and emits no fragments when disabled", async () => {
		const { client, post } = setup()
		const onText = jest.fn()
		await client.complete([], [], onText)
		expect(post.mock.calls[0][1].stream).toBeUndefined()
		expect(onText).not.toHaveBeenCalled()
	})

	it.each([
		["missing DONE", event({ content: "draft" }, "stop")],
		["invalid JSON", "data: {bad}\n\n"],
		[
			"truncated",
			`${event({ content: "draft" }, "length")}data: [DONE]\n\n`,
		],
		[
			"invalid tool arguments",
			event({
				tool_calls: [
					{
						function: { arguments: "{", name: "execute_step" },
						id: "call",
						index: 0,
						type: "function",
					},
				],
			}) + ending,
		],
		["oversized", "x".repeat(1024 * 1024 + 1)],
	])(
		"rejects %s without returning a usable completion",
		async (_label, input) => {
			const { client, post } = setup({ streamOutput: true })
			post.mockReturnValue(
				of({ data: Readable.from([input]), status: 200 }),
			)
			await expect(client.complete([], [TOOL])).rejects.toThrow()
		},
	)

	it("retains long public output and closes a stalled provider stream", async () => {
		const { client, post } = setup({
			streamOutput: true,
			timeoutMilliseconds: 100,
		})
		const stream = new PassThrough()
		post.mockReturnValue(of({ data: stream, status: 200 }))
		const onText = jest.fn(async (_text: string) => {})
		const response = client.complete([], [], onText)
		stream.write(event({ content: "a".repeat(4000) }))
		await expect(response).rejects.toThrow("timed out")
		expect(onText.mock.calls.map((call) => call[0]).join("")).toHaveLength(
			4000,
		)
		expect(stream.destroyed).toBe(true)
	})

	it("moves a rate limited request to the relief provider", async () => {
		jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {})
		const { client, post } = setup({
			fallback: {
				apiKey: "relief-key",
				baseURL: "https://relief.example.test/v1",
				fastModel: "relief-fast",
				model: "relief-model",
				reasoningEffort: "low",
			},
		})
		const rateLimited = {
			isAxiosError: true,
			response: { headers: { "retry-after": "1" }, status: 429 },
		}
		post.mockImplementation((endpoint: string) => {
			if (endpoint.startsWith("https://relief.example.test")) {
				return of({ data: completion(), status: 200 })
			}
			return throwError(() => rateLimited)
		})

		const result = await client.complete([], [])

		expect(result.message.content).toBe("Ready")
		const [reliefEndpoint, reliefBody, reliefOptions] =
			post.mock.calls[post.mock.calls.length - 1]
		expect(reliefEndpoint).toBe(
			"https://relief.example.test/v1/chat/completions",
		)
		expect(reliefBody.model).toBe("relief-model")
		expect(reliefBody.reasoning_effort).toBe("low")
		expect(reliefOptions.headers.Authorization).toBe("Bearer relief-key")
	})

	it("surfaces a rate limit when no relief provider is configured", async () => {
		jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {})
		const { client, post } = setup()
		post.mockReturnValue(
			throwError(() => ({
				isAxiosError: true,
				response: { headers: {}, status: 429 },
			})),
		)

		await expect(client.complete([], [])).rejects.toThrow(
			"LLM provider returned HTTP 429",
		)
	})

	it("accepts a tool call answered without a content field", async () => {
		const { client, post } = setup()
		post.mockReturnValue(
			of({
				data: {
					choices: [
						{
							finish_reason: "tool_calls",
							message: {
								role: "assistant",
								tool_calls: [
									{
										function: {
											arguments:
												'{"stepIdentifier":"stp_1"}',
											name: "execute_step",
										},
										id: "call_1",
										type: "function",
									},
								],
							},
						},
					],
					model: "relief-model",
				},
				status: 200,
			}),
		)

		const result = await client.complete([], [TOOL])

		expect(result.message.content).toBe(null)
		expect(result.message.tool_calls?.[0].function.name).toBe(
			"execute_step",
		)
	})

	it("keeps the next request on the relief provider instead of paying the retries again", async () => {
		jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {})
		const { client, post } = setup({
			fallback: {
				apiKey: "relief-key",
				baseURL: "https://relief.example.test/v1",
				fastModel: "relief-fast",
				model: "relief-model",
				reasoningEffort: "low",
			},
		})
		post.mockImplementation((endpoint: string) => {
			if (endpoint.startsWith("https://relief.example.test")) {
				return of({ data: completion(), status: 200 })
			}
			return throwError(() => ({
				isAxiosError: true,
				response: { headers: { "retry-after": "1" }, status: 429 },
			}))
		})

		await client.complete([], [])
		const callsAfterFirst = post.mock.calls.length
		await client.complete([], [])

		expect(post.mock.calls.length).toBe(callsAfterFirst + 1)
		expect(post.mock.calls[callsAfterFirst][0]).toBe(
			"https://relief.example.test/v1/chat/completions",
		)
	})
})
