import { createHmac, timingSafeEqual } from "node:crypto"

export function signPayload(
	secret: string,
	timestamp: string,
	body: string,
): string {
	const digest = createHmac("sha256", secret)
		.update(`${timestamp}.${body}`)
		.digest("hex")
	return `sha256=${digest}`
}

export function isSignatureValid(
	secret: string,
	timestamp: string,
	body: string,
	providedSignature: string,
): boolean {
	const expected = Buffer.from(signPayload(secret, timestamp, body))
	const provided = Buffer.from(providedSignature)
	if (expected.length !== provided.length) {
		return false
	}
	return timingSafeEqual(expected, provided)
}

export function isSharedSecretValid(
	secret: string,
	providedSecret: string,
): boolean {
	const expected = Buffer.from(secret)
	const provided = Buffer.from(providedSecret)
	if (expected.length !== provided.length) {
		return false
	}
	return timingSafeEqual(expected, provided)
}
