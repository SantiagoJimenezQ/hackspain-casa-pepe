import { requiresTLS } from "@common/helpers/database-url.helper"

describe("requiresTLS", () => {
	it("enables TLS for Supabase poolers and explicit sslmode", () => {
		expect(
			requiresTLS(
				"postgresql://postgres.abc:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
			),
		).toBe(true)
		expect(
			requiresTLS(
				"postgresql://postgres:secret@db.abc.supabase.co:5432/postgres",
			),
		).toBe(true)
		expect(
			requiresTLS(
				"postgresql://user:secret@example.com:5432/db?sslmode=require",
			),
		).toBe(true)
	})

	it("keeps plain connections for local databases", () => {
		expect(
			requiresTLS(
				"postgresql://postgres:postgres@localhost:5432/casa_pepe",
			),
		).toBe(false)
	})
})
