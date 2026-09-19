import { PassThrough, Readable } from "node:stream"
import { failureDetails } from "@agent/llm/llm-failure-details"

describe("safe LLM failure diagnostics", () => {
	const body = {
		error: {
			code: "unsupported_parameter",
			message:
				"secret prompt: max_tokens must be replaced with max_completion_tokens, Bearer sk-secret",
			param: "max_tokens",
			type: "invalid_request_error",
		},
	}
	it.each([body, JSON.stringify(body)])(
		"extracts useful categories without raw provider text",
		async (data) => {
			const result = await failureDetails(
				{
					response: {
						data,
						headers: { "x-request-id": "req-123" },
						status: 400,
					},
				},
				"sk-secret",
			)
			expect(result).toMatchObject({
				hint: "Use max_completion_tokens for this model",
				httpStatus: 400,
				parameter: "max_tokens",
				providerCode: "unsupported_parameter",
				providerRequestId: "req-123",
			})
			expect(JSON.stringify(result)).not.toMatch(
				/secret prompt|sk-secret|Bearer/,
			)
		},
	)
	it("reads JSON error bodies returned in streaming mode and closes them", async () => {
		const stream = Readable.from([JSON.stringify(body)])
		expect(
			await failureDetails({ response: { data: stream } }, "key"),
		).toMatchObject({ providerCode: "unsupported_parameter" })
		expect(stream.destroyed).toBe(true)
	})
	it("bounds oversized and stalled error streams", async () => {
		const large = Readable.from(["x".repeat(8193)])
		await failureDetails({ response: { data: large } }, "key")
		expect(large.destroyed).toBe(true)
		const stalled = new PassThrough()
		await failureDetails({ response: { data: stalled } }, "key")
		expect(stalled.destroyed).toBe(true)
	})
	it("omits unrecognized fields, echoed credentials, and invalid retry headers", async () => {
		const result = await failureDetails(
			{
				response: {
					data: {
						error: {
							code: "sk-secret",
							param: "authorization",
							type: "private-prompt",
						},
					},
					headers: {
						"retry-after": "sk-secret",
						"x-request-id": "req-sk-secret",
					},
				},
			},
			"sk-secret",
		)
		expect(JSON.stringify(result)).toBe("{}")
	})
	it("identifies DNS errors and rate limits", async () => {
		expect(
			await failureDetails({ code: "ENOTFOUND" }, "key"),
		).toMatchObject({ networkCode: "ENOTFOUND" })
		expect(
			await failureDetails(
				{
					response: {
						data: {
							error: {
								code: "insufficient_quota",
								message: "Billing quota exceeded",
							},
						},
						headers: { "retry-after": "30" },
						status: 429,
					},
				},
				"key",
			),
		).toMatchObject({
			hint: "Check provider billing and available quota",
			httpStatus: 429,
			providerCode: "insufficient_quota",
			retryAfterSeconds: 30,
		})
	})
})
