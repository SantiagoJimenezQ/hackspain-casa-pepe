import { randomUUID } from "node:crypto"

export function createIdentifier(): string {
	return randomUUID()
}

export function createPrefixedIdentifier(prefix: string): string {
	return `${prefix}_${randomUUID()}`
}
