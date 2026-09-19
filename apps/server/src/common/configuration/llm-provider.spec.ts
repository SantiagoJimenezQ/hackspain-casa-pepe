import { resolveLlmProvider } from "@common/configuration/configuration.factory"
import { EnvironmentVariables } from "@common/configuration/environment-variables.class"

function variables(
	overrides: Partial<EnvironmentVariables>,
): EnvironmentVariables {
	return {
		...new EnvironmentVariables(),
		...overrides,
	} as EnvironmentVariables
}

describe("resolveLlmProvider", () => {
	it("uses the plain variables when no preset is selected", () => {
		const resolved = resolveLlmProvider(
			variables({
				LLM_API_KEY: "plain-key",
				LLM_BASE_URL: "https://plain.example.test/v1",
				LLM_FAST_MODEL: "plain-fast",
				LLM_MODEL: "plain-model",
				LLM_REASONING_EFFORT: "low",
			}),
		)

		expect(resolved).toEqual({
			apiKey: "plain-key",
			baseURL: "https://plain.example.test/v1",
			fastModel: "plain-fast",
			model: "plain-model",
			reasoningEffort: "low",
		})
	})

	it("switches to the OpenAI preset with a single variable", () => {
		const resolved = resolveLlmProvider(
			variables({
				LLM_API_KEY: "plain-key",
				LLM_BASE_URL: "https://plain.example.test/v1",
				LLM_MODEL: "plain-model",
				LLM_OPENAI_API_KEY: "openai-key",
				LLM_OPENAI_FAST_MODEL: "gpt-5.4-nano",
				LLM_OPENAI_MODEL: "gpt-5.6-luna",
				LLM_OPENAI_REASONING_EFFORT: "none",
				LLM_PROVIDER: "openai",
			}),
		)

		expect(resolved).toEqual({
			apiKey: "openai-key",
			baseURL: "https://api.openai.com/v1",
			fastModel: "gpt-5.4-nano",
			model: "gpt-5.6-luna",
			reasoningEffort: "none",
		})
	})

	it("switches to the DeepSeek preset without touching the OpenAI credentials", () => {
		const resolved = resolveLlmProvider(
			variables({
				LLM_DEEPSEEK_API_KEY: "deepseek-key",
				LLM_DEEPSEEK_MODEL: "deepseek-v4-flash",
				LLM_DEEPSEEK_REASONING_EFFORT: "low",
				LLM_OPENAI_API_KEY: "openai-key",
				LLM_OPENAI_MODEL: "gpt-5.6-luna",
				LLM_PROVIDER: "deepseek",
			}),
		)

		expect(resolved.apiKey).toBe("deepseek-key")
		expect(resolved.baseURL).toBe("https://api.helmcode.com/v1")
		expect(resolved.model).toBe("deepseek-v4-flash")
		expect(resolved.reasoningEffort).toBe("low")
	})

	it("falls back to the plain values for the fields a preset leaves empty", () => {
		const resolved = resolveLlmProvider(
			variables({
				LLM_API_KEY: "shared-key",
				LLM_FAST_MODEL: "shared-fast",
				LLM_OPENAI_MODEL: "gpt-5.6-luna",
				LLM_PROVIDER: "openai",
				LLM_REASONING_EFFORT: "high",
			}),
		)

		expect(resolved.apiKey).toBe("shared-key")
		expect(resolved.fastModel).toBe("shared-fast")
		expect(resolved.model).toBe("gpt-5.6-luna")
		expect(resolved.reasoningEffort).toBe("high")
	})

	it("keeps an explicit preset base URL over the provider default", () => {
		const resolved = resolveLlmProvider(
			variables({
				LLM_OPENAI_BASE_URL: "https://gateway.example.test/v1",
				LLM_PROVIDER: "openai",
			}),
		)

		expect(resolved.baseURL).toBe("https://gateway.example.test/v1")
	})
})
