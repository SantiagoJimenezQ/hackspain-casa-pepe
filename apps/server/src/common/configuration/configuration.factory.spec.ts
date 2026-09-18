import "reflect-metadata"
import { validateEnvironmentVariables } from "@common/configuration/configuration.factory"

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
})
