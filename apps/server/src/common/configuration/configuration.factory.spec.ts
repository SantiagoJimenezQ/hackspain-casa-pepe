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
			mode: "live",
			provider: "elevenlabs",
		})
	})
})

it("validates independently switchable speed flags, off by default", () => {
	const defaults = createApplicationConfiguration(
		validateEnvironmentVariables(VALID),
	)
	expect(defaults.agent.combinedPlanActionEnabled).toBe(false)
	expect(defaults.agent.compactPlanEnabled).toBe(false)
	const enabled = createApplicationConfiguration(
		validateEnvironmentVariables({
			...VALID,
			AGENT_COMBINED_PLAN_ACTION_ENABLED: "true",
			AGENT_COMPACT_PLAN_ENABLED: "true",
		}),
	)
	expect(enabled.agent.combinedPlanActionEnabled).toBe(true)
	expect(enabled.agent.compactPlanEnabled).toBe(true)
	expect(() =>
		validateEnvironmentVariables({
			...VALID,
			AGENT_COMBINED_PLAN_ACTION_ENABLED: "yes",
		}),
	).toThrow()
})
