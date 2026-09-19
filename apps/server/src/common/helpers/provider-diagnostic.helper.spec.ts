import { sanitizeProviderDiagnostic } from "./provider-diagnostic.helper"

describe("sanitizeProviderDiagnostic", () => {
	it("redacts sensitive nested keys while retaining useful diagnostics", () => {
		const result = sanitizeProviderDiagnostic({
			code: "PROVIDER_HTTP_ERROR",
			headers: {
				authorization: "Bearer bearer-secret",
				"content-type": "application/json",
				"xi-api-key": "provider-secret",
			},
			message: "ElevenLabs rejected the request",
			request: {
				cookies: { session: "cookie-secret" },
				dynamic_variables: { contact_name: "Ada Lovelace" },
				email: "person@example.com",
				name: "Ada Lovelace",
				password: "password-secret",
				phoneNumber: "+34600111222",
				prompt: "a private prompt",
				transcript: "a private call transcript",
			},
			status: 502,
		}) as Record<string, unknown>

		expect(result.code).toBe("PROVIDER_HTTP_ERROR")
		expect(result.status).toBe(502)
		expect(result.message).toBe("ElevenLabs rejected the request")
		expect(result.headers).toEqual({
			authorization: "[REDACTED]",
			"content-type": "application/json",
			"xi-api-key": "[REDACTED]",
		})
		expect(result.request).toEqual({
			cookies: "[REDACTED]",
			dynamic_variables: "[REDACTED]",
			email: "[REDACTED]",
			name: "[REDACTED]",
			password: "[REDACTED]",
			phoneNumber: "[REDACTED]",
			prompt: "[REDACTED]",
			transcript: "[REDACTED]",
		})
	})

	it("scrubs credentials in free text and query strings", () => {
		const result = sanitizeProviderDiagnostic({
			message:
				"request failed: Authorization: Bearer auth-value; GET https://provider.test/call?api_key=query-key&token=query-token",
			url: "https://user:password@provider.test/call?secret=url-secret",
		}) as Record<string, string>

		expect(result.message).toContain("Authorization: Bearer [REDACTED]")
		expect(result.message).toContain("api_key=[REDACTED]")
		expect(result.message).toContain("token=[REDACTED]")
		expect(result.url).toBe(
			"https://[REDACTED]:[REDACTED]@provider.test/call?secret=[REDACTED]",
		)
		expect(JSON.stringify(result)).not.toContain("auth-value")
		expect(JSON.stringify(result)).not.toContain("query-key")
		expect(JSON.stringify(result)).not.toContain("query-token")
		expect(JSON.stringify(result)).not.toContain("password")
	})

	it("redacts supplied secrets, names, and phone numbers everywhere", () => {
		const secret = "sk-live-provider-123"
		const name = "Grace Hopper"
		const phone = "+34910001122"
		const error = new Error(
			`provider ${secret} failed for ${name} at ${phone}`,
		)
		error.stack = `Error: ${secret}\n    at ${name} (${phone})`
		Object.defineProperty(error, "cause", {
			enumerable: false,
			value: {
				context: `${name} / ${phone}`,
				message: `retry with ${secret}`,
			},
		})

		const result = sanitizeProviderDiagnostic(
			{ error, nested: [name, phone], note: `credential=${secret}` },
			[secret, name, phone],
		)
		const serialized = JSON.stringify(result)

		expect(serialized).not.toContain(secret)
		expect(serialized).not.toContain(name)
		expect(serialized).not.toContain(phone)
		expect(serialized).toContain("[REDACTED]")
	})

	it("sanitizes Error message, stack, cause, and custom fields", () => {
		const cause = new Error("root cause with secret-value")
		const error = new Error("request failed with secret-value")
		Object.defineProperty(error, "cause", {
			enumerable: false,
			value: cause,
		})
		Object.assign(error, {
			authorization: "secret-value",
			code: "ETIMEDOUT",
			status: 504,
		})

		const result = sanitizeProviderDiagnostic(error, [
			"secret-value",
		]) as Record<string, unknown>

		expect(result.name).toBe("Error")
		expect(result.code).toBe("ETIMEDOUT")
		expect(result.status).toBe(504)
		expect(result.message).toBe("request failed with [REDACTED]")
		expect(result.cause).toMatchObject({
			message: "root cause with [REDACTED]",
		})
		expect(result.authorization).toBe("[REDACTED]")
		expect(JSON.stringify(result)).not.toContain("secret-value")
	})

	it("handles cycles and stays bounded after scrubbing", () => {
		const cyclic: Record<string, unknown> = {
			body: "x".repeat(100_000),
			code: "CYCLE",
			message: "diagnostic message",
			secret: "long-secret-value",
		}
		cyclic.self = cyclic
		const result = sanitizeProviderDiagnostic(cyclic, ["long-secret-value"])
		const serialized = JSON.stringify(result)

		expect(serialized).not.toContain("long-secret-value")
		expect(serialized).not.toContain("x".repeat(10_000))
		expect(serialized.length).toBeLessThan(70_000)
		expect(result).toMatchObject({
			code: "CYCLE",
			message: "diagnostic message",
			secret: "[REDACTED]",
			self: "[Circular]",
		})
		JSON.stringify(result)
	})

	it("returns JSON-safe values for non-JSON primitives", () => {
		const result = sanitizeProviderDiagnostic({
			bigint: BigInt(42),
			functionValue: () => "secret",
			infinity: Number.POSITIVE_INFINITY,
			undefinedValue: undefined,
		})

		expect(() => JSON.stringify(result)).not.toThrow()
		expect(result).toEqual({
			bigint: "42",
			functionValue: "[Function]",
			infinity: null,
			undefinedValue: null,
		})
	})
})

it("redacts quoted credentials, cookie strings, map values and sensitive property names", () => {
	const result = sanitizeProviderDiagnostic(
		{
			"echo-known-value": "ok",
			metadata: new Map([["apiKey", "map-value"]]),
			nested: { to_number: "+34611222333" },
			text: JSON.stringify({
				authorization: "Bearer header-value",
				cookie: "session=cookie-value; other=x",
			}),
		},
		["known-value"],
	)
	const logged = JSON.stringify(result)
	for (const secret of [
		"header-value",
		"cookie-value",
		"map-value",
		"known-value",
		"+34611222333",
	]) {
		expect(logged).not.toContain(secret)
	}
})

it("redacts a supplied secret crossing the text truncation boundary", () => {
	const result = sanitizeProviderDiagnostic(
		`${"x".repeat(8190)}boundary-secret`,
		["boundary-secret"],
	)
	expect(String(result)).not.toContain("bo")
})
