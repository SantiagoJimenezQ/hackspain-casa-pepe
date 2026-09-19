import { LlmClientError, LlmClientService } from "@agent/llm/llm-client.service"
import { ModelTestsService } from "@agent/llm/model-tests.service"
import { ConfigurationService } from "@common/services/configuration.service"

const configuration = {
	llm: {
		fastModel: "",
		fastTimeoutMilliseconds: 5000,
		maximumOutputTokens: 8192,
		model: "gpt-5.6-luna",
		reasoningEffort: "medium",
		streamOutput: true,
		timeoutMilliseconds: 60000,
	},
} as ConfigurationService
const completion = {
	message: {
		tool_calls: [
			{
				function: {
					arguments: '{"ok":true}',
					name: "model_health_check",
				},
			},
		],
	},
}

function setup() {
	const complete = jest.fn().mockResolvedValue(completion)
	return {
		complete,
		service: new ModelTestsService(configuration, {
			complete,
		} as unknown as LlmClientService),
	}
}

describe("model diagnostics", () => {
	it("tests both actual profiles even when they share a model", async () => {
		const { complete, service } = setup()
		const result = await service.execute()
		expect(result.ok).toBe(true)
		expect(result.results).toHaveLength(2)
		expect(complete.mock.calls[0][3]).toMatchObject({
			model: "gpt-5.6-luna",
			reasoningEffort: "medium",
			timeoutMilliseconds: 60000,
		})
		expect(complete.mock.calls[1][3]).toMatchObject({
			maximumOutputTokens: 1500,
			model: "gpt-5.6-luna",
			reasoningEffort: "none",
			streamOutput: false,
			timeoutMilliseconds: 5000,
		})
		expect(complete.mock.calls[0][1][0].function.name).toBe(
			"model_health_check",
		)
	})
	it("reports each failure independently and hides unexpected exception details", async () => {
		const { complete, service } = setup()
		complete.mockRejectedValueOnce(new Error("secret-provider-key"))
		const result = await service.execute()
		expect(result.ok).toBe(false)
		expect(result.results[0].error).toBe("Model diagnostic failed")
		expect(result.results[1].status).toBe("succeeded")
		expect(JSON.stringify(result)).not.toContain("secret-provider-key")
	})
	it("preserves sanitized client failures", async () => {
		const { complete, service } = setup()
		complete.mockRejectedValueOnce(
			new LlmClientError("LLM provider returned HTTP 401"),
		)
		expect((await service.execute()).results[0].error).toBe(
			"LLM provider returned HTTP 401",
		)
	})
	it.each([
		{ content: "OK" },
		{
			tool_calls: [
				{
					function: {
						arguments: '{"ok":true}',
						name: "execute_recovery",
					},
				},
			],
		},
		{
			tool_calls: [
				{
					function: {
						arguments: '{"ok":false}',
						name: "model_health_check",
					},
				},
			],
		},
	])("rejects an unexpected diagnostic response", async (message) => {
		const { complete, service } = setup()
		complete.mockResolvedValueOnce({ message })
		expect((await service.execute()).results[0].status).toBe("failed")
	})
})
