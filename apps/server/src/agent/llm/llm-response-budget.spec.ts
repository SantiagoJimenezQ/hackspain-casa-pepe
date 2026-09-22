import { createServer } from "node:http"
import { AddressInfo } from "node:net"
import { Readable } from "node:stream"
import { LlmClientService } from "@agent/llm/llm-client.service"
import { ConfigurationService } from "@common/services/configuration.service"
import { HttpService } from "@nestjs/axios"
import { Logger } from "@nestjs/common"
import { of, throwError } from "rxjs"

const MIB = 1024 * 1024
const event = (delta: unknown, finish_reason: string | null = null) =>
	`data: ${JSON.stringify({ choices: [{ delta, finish_reason, index: 0 }], model: "deepseek-v4-flash" })}\n\n`
const end = `${event({}, "stop")}data: [DONE]\n\n`

function setup(
	streamOutput = true,
	http?: HttpService,
	baseURL = "https://provider.example.test/v1",
) {
	const post = jest.fn()
	const client = new LlmClientService(
		{
			llm: {
				apiKey: "fixture-key",
				baseURL,
				fastModel: "",
				maximumOutputTokens: 4096,
				maximumTurns: 24,
				model: "deepseek-v4-flash",
				reasoningEffort: "low",
				streamOutput,
				timeoutMilliseconds: 5000,
			},
		} as ConfigurationService,
		http ?? ({ post } as unknown as HttpService),
	)
	return { client, post }
}

describe("LLM response byte budgets", () => {
	beforeEach(() =>
		jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {}),
	)
	afterEach(() => jest.restoreAllMocks())

	it("accepts a large SSE envelope through the actual Axios HTTP transport", async () => {
		const frames = event({
			reasoning_content: "PRIVATE".repeat(30),
		}).repeat(4096)
		const server = createServer((request, response) => {
			request.resume()
			response.writeHead(200, { "Content-Type": "text/event-stream" })
			response.end(frames + event({ content: "Ready" }) + end)
		})
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject)
			server.listen(0, "127.0.0.1", resolve)
		})
		try {
			const { port } = server.address() as AddressInfo
			const { client } = setup(
				true,
				new HttpService(),
				`http://127.0.0.1:${port}/v1`,
			)
			const result = await client.complete([], [])
			expect(result.message.content).toBe("Ready")
			expect(JSON.stringify(result)).not.toContain("PRIVATE")
		} finally {
			server.closeAllConnections()
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			)
		}
	})

	it("accepts framing and private reasoning over 1 MiB without exposing it", async () => {
		const { client, post } = setup()
		const chunks = Array.from({ length: 4096 }, () =>
			event({ reasoning_content: "PRIVATE".repeat(30) }),
		)
		chunks.push(event({ content: "Ready" }), end)
		expect(Buffer.byteLength(chunks.join(""))).toBeGreaterThan(MIB)
		post.mockReturnValue(of({ data: Readable.from(chunks), status: 200 }))
		const onText = jest.fn()
		const result = await client.complete([], [], onText)
		expect(result.message.content).toBe("Ready")
		expect(JSON.stringify(result)).not.toContain("PRIVATE")
		expect(onText.mock.calls).toEqual([["Ready"]])
		expect(post.mock.calls[0][2].maxContentLength).toBe(16 * MIB)
	})

	it.each([
		["unterminated frame", ["x".repeat(MIB + 1)]],
		[
			"complete frame",
			[event({ reasoning_content: "x".repeat(MIB) }), end],
		],
		["wire budget", Array(257).fill(`: ${"x".repeat(65536)}\n\n`)],
		[
			"public content",
			Array(257)
				.fill(event({ content: "á".repeat(2048) }))
				.concat(end),
		],
		[
			"tool arguments",
			Array(257)
				.fill(
					event({
						tool_calls: [
							{
								function: { arguments: "á".repeat(2048) },
								index: 0,
							},
						],
					}),
				)
				.concat(end),
		],
	] as Array<[string, string[]]>)(
		"bounds %s and destroys the stream",
		async (_label, chunks) => {
			const { client, post } = setup()
			const stream = Readable.from(chunks)
			post.mockReturnValue(of({ data: stream, status: 200 }))
			await expect(client.complete([], [])).rejects.toThrow(/byte budget/)
			expect(stream.destroyed).toBe(true)
		},
	)

	it("retains the 1 MiB cap for non-streamed responses", async () => {
		const { client, post } = setup(false)
		post.mockReturnValue(
			of({ data: { content: "x".repeat(MIB) }, status: 200 }),
		)
		await expect(client.complete([], [])).rejects.toThrow(/byte budget/)
		expect(post.mock.calls[0][2].maxContentLength).toBe(MIB)
	})

	it.each([
		["maxContentLength size of 1048576 exceeded", undefined, "byte budget"],
		["stream has been aborted", undefined, "interrupted"],
		["stream has been aborted", 200, "interrupted"],
		["private prompt fixture-key", undefined, "malformed response"],
		["private prompt fixture-key", 400, "HTTP 400"],
	] as Array<[string, number | undefined, string]>)(
		"classifies transport failure %s (HTTP %s) without leaking it",
		async (message, status, expected) => {
			const { client, post } = setup(false)
			post.mockReturnValue(
				throwError(() => ({
					code: "ERR_BAD_RESPONSE",
					isAxiosError: true,
					message,
					...(status ? { response: { status } } : {}),
				})),
			)
			await expect(client.complete([], [])).rejects.toThrow(expected)
			expect(
				JSON.stringify(jest.mocked(Logger.prototype.warn).mock.calls),
			).not.toMatch(/private prompt|fixture-key/)
		},
	)
})
