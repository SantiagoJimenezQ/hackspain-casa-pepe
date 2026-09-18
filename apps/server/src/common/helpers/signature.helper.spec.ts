import {
	isSharedSecretValid,
	isSignatureValid,
	signPayload,
} from "@common/helpers/signature.helper"

describe("signature helper", () => {
	const secret = "a-very-long-shared-secret"
	const timestamp = "2026-09-18T10:00:00.000Z"
	const body = JSON.stringify({ event: "test" })

	it("produces a verifiable HMAC signature bound to the timestamp and the body", () => {
		const signature = signPayload(secret, timestamp, body)
		expect(signature.startsWith("sha256=")).toBe(true)
		expect(isSignatureValid(secret, timestamp, body, signature)).toBe(true)
		expect(
			isSignatureValid(
				secret,
				"2026-09-18T10:00:01.000Z",
				body,
				signature,
			),
		).toBe(false)
		expect(
			isSignatureValid("other-secret", timestamp, body, signature),
		).toBe(false)
		expect(isSignatureValid(secret, timestamp, body, "sha256=short")).toBe(
			false,
		)
	})

	it("compares shared secrets without leaking length information through exceptions", () => {
		expect(isSharedSecretValid(secret, secret)).toBe(true)
		expect(isSharedSecretValid(secret, "")).toBe(false)
		expect(isSharedSecretValid(secret, `${secret}x`)).toBe(false)
	})
})
