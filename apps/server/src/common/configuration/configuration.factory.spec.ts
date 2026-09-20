import "reflect-metadata"
import {
	createApplicationConfiguration,
	validateEnvironmentVariables,
} from "@common/configuration/configuration.factory"
import { EnvironmentVariables } from "@common/configuration/environment-variables.class"
import { ConfigurationService } from "@common/services/configuration.service"
import { ConfigService } from "@nestjs/config"

const VALID = {
	API_KEY: "key",
	HAPPYROBOT_WEBHOOK_SECRET: "secret",
	RECOVERY_WEBHOOK_SECRET: "secret",
	SUPABASE_DATABASE_URL:
		"postgresql://postgres.abc:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
}

describe("validateEnvironmentVariables", () => {
	it.each([
		[
			"https://workflows.platform.eu.happyrobot.ai/hooks/test",
			"webhook-key",
		],
		[
			"https://platform.eu.happyrobot.ai/api/v2/workflows/test/runs",
			"workspace-key",
		],
	])("selects the correct credential for %s", (triggerURL, expected) => {
		const variables = validateEnvironmentVariables({
			...VALID,
			HAPPY_ROBOT_API_KEY_WEBHOOK: "webhook-key",
			HAPPYROBOT_API_KEY: "workspace-key",
			HAPPYROBOT_TRIGGER_URL: triggerURL,
		})
		expect(
			createApplicationConfiguration(variables).happyRobot.apiKey,
		).toBe(expected)
	})
	it("accepts a Postgres connection string", () => {
		expect(validateEnvironmentVariables(VALID).SUPABASE_DATABASE_URL).toBe(
			VALID.SUPABASE_DATABASE_URL,
		)
	})

	it("rejects the Supabase Project URL with a helpful message", () => {
		expect(() =>
			validateEnvironmentVariables({
				...VALID,
				SUPABASE_DATABASE_URL: "https://abc.supabase.co",
			}),
		).toThrow(/not the https Project URL/)
	})

	it("uses the provider-independent call mode and provider settings", () => {
		const variables = validateEnvironmentVariables({
			...VALID,
			ELEVENLABS_AGENT_ID: "agent_test",
			ELEVENLABS_API_KEY: "key_test",
			ELEVENLABS_PHONE_NUMBER_ID: "phone_test",
			ELEVENLABS_POLL_INTERVAL_MILLISECONDS: 2500,
			ENGINEER_CALL_MODE: "live",
			ENGINEER_CALL_PROVIDER: "elevenlabs",
		})
		const configuration = createApplicationConfiguration(variables)

		expect(configuration.engineerCall).toEqual({
			fallbackToSimulated: true,
			mode: "live",
			provider: "elevenlabs",
		})
		expect(configuration.elevenLabs).toEqual({
			agentId: "agent_test",
			apiKey: "key_test",
			phoneNumberId: "phone_test",
			pollIntervalMilliseconds: 2500,
		})
	})

	it("keeps HAPPYROBOT_MODE as the compatibility fallback", () => {
		const variables = validateEnvironmentVariables({
			...VALID,
			HAPPYROBOT_MODE: "live",
		})
		expect(createApplicationConfiguration(variables).engineerCall).toEqual({
			fallbackToSimulated: true,
			mode: "live",
			provider: "happyrobot",
		})
	})

	it("loads ENGINEER_CALL_MODE through ConfigurationService", () => {
		const defaults = new EnvironmentVariables()
		const configService = new ConfigService({
			...defaults,
			ENGINEER_CALL_MODE: "live",
			ENGINEER_CALL_PROVIDER: "elevenlabs",
		})
		const configuration = new ConfigurationService(
			configService as unknown as ConfigService<
				EnvironmentVariables,
				true
			>,
		)

		expect(configuration.engineerCall).toEqual({
			fallbackToSimulated: true,
			mode: "live",
			provider: "elevenlabs",
		})
	})

	it("relieves the active provider with the other configured preset", () => {
		const variables = validateEnvironmentVariables({
			...VALID,
			LLM_DEEPSEEK_API_KEY: "deepseek-key",
			LLM_DEEPSEEK_BASE_URL: "https://api.helmcode.com/v1",
			LLM_DEEPSEEK_MODEL: "deepseek-v4-flash",
			LLM_OPENAI_API_KEY: "openai-key",
			LLM_OPENAI_BASE_URL: "https://api.openai.com/v1",
			LLM_OPENAI_MODEL: "gpt-test",
			LLM_PROVIDER: "openai",
		})
		const { llm } = createApplicationConfiguration(variables)

		expect(llm.model).toBe("gpt-test")
		expect(llm.fallback?.baseURL).toBe("https://api.helmcode.com/v1")
		expect(llm.fallback?.model).toBe("deepseek-v4-flash")
		expect(llm.fallback?.apiKey).toBe("deepseek-key")
	})

	it("leaves the run on a single provider when the relief is turned off", () => {
		const variables = validateEnvironmentVariables({
			...VALID,
			LLM_DEEPSEEK_API_KEY: "deepseek-key",
			LLM_DEEPSEEK_BASE_URL: "https://api.helmcode.com/v1",
			LLM_DEEPSEEK_MODEL: "deepseek-v4-flash",
			LLM_FALLBACK_PROVIDER: "none",
			LLM_OPENAI_API_KEY: "openai-key",
			LLM_OPENAI_BASE_URL: "https://api.openai.com/v1",
			LLM_OPENAI_MODEL: "gpt-test",
			LLM_PROVIDER: "openai",
		})

		expect(createApplicationConfiguration(variables).llm.fallback).toBe(
			null,
		)
	})

	it("offers no relief when the other preset has no credentials", () => {
		const variables = validateEnvironmentVariables({
			...VALID,
			LLM_OPENAI_API_KEY: "openai-key",
			LLM_OPENAI_BASE_URL: "https://api.openai.com/v1",
			LLM_OPENAI_MODEL: "gpt-test",
			LLM_PROVIDER: "openai",
		})

		expect(createApplicationConfiguration(variables).llm.fallback).toBe(
			null,
		)
	})
})

describe("browser schema upgrade opt-in", () => {
	it.each([
		[undefined, false],
		["false", false],
		["true", true],
	])(
		"enables schema changes only for explicit true (%s)",
		(flag, expected) => {
			const variables = validateEnvironmentVariables({
				...VALID,
				...(flag === undefined
					? {}
					: { BROWSER_SESSION_SCHEMA_UPGRADE: flag }),
			})
			expect(
				createApplicationConfiguration(variables).database
					.sessionSchemaUpgrade,
			).toBe(expected)
		},
	)
})
