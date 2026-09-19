import { LlmMessage, LlmToolDefinition } from "@agent/llm/llm.types"
import { LlmClientService } from "@agent/llm/llm-client.service"
import { ConfigurationService } from "@common/services/configuration.service"
import { LlmConfiguration } from "@common/types/configuration.type"
import { HttpService } from "@nestjs/axios"
import { of, throwError } from "rxjs"

const CONFIGURATION: LlmConfiguration = {
	apiKey: "test-provider-key",
	baseURL: "https://provider.example.test/v1",
	maximumOutputTokens: 128,
	maximumTurns: 24,
	model: "test-model",
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
			"missing message content",
			{
				choices: [{ message: { role: "assistant" } }],
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
