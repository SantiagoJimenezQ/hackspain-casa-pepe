import { LlmToolCall, LlmToolDefinition } from "./llm.types"

const HIDDEN = "[redacted]"
const sensitive =
	/password|secret|token|credential|authorization|api.?key|phone|email|database.*url/i

/** Only this projection is persisted. Never mutate the model's executable arguments. */
export class PublicOutput {
	readonly secrets: string[]
	redacted = false
	private pending = ""

	constructor(configuration: unknown) {
		const values: string[] = []
		const visit = (value: unknown, key = "") => {
			if (
				typeof value === "string" &&
				(sensitive.test(key.split(".").pop() ?? "") ||
					/database.*url/i.test(key)) &&
				value
			)
				values.push(value)
			else if (value && typeof value === "object")
				for (const [name, child] of Object.entries(value))
					visit(child, `${key}.${name}`)
		}
		visit(configuration)
		this.secrets = values.sort((a, b) => b.length - a.length)
	}

	text(value: string): string {
		let result = value
		for (const secret of this.secrets)
			result = result.split(secret).join(HIDDEN)
		result = result
			.replace(/\bBearer\s+[^\s,;"']+/gi, `Bearer ${HIDDEN}`)
			.replace(/\b(?:sk|rk|pk)[-_][A-Za-z0-9_-]{12,}/g, HIDDEN)
			.replace(
				/((?:password|secret|token|credential|authorization|api[_ -]?key)\s*["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\n,;]+)/gi,
				`$1${HIDDEN}`,
			)
			.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, HIDDEN)
			.replace(/\+\d[\d ()-]{7,}\d/g, HIDDEN)
		if (result !== value) this.redacted = true
		return result
	}

	/** Buffer complete lines and enough lookahead for configured secrets spanning fragments. */
	fragment(value: string, final = false): string {
		this.pending += value
		const keep = Math.max(1, ...this.secrets.map((secret) => secret.length))
		const boundary = final
			? this.pending.length
			: this.pending.lastIndexOf(
					"\n",
					Math.max(-1, this.pending.length - keep),
				) + 1
		if (!boundary) return ""
		// Redact before slicing so a configured secret crossing the boundary cannot leak.
		let cut = boundary
		for (const secret of this.secrets) {
			const start = this.pending.lastIndexOf(secret, boundary - 1)
			if (start >= 0 && start + secret.length > cut) cut = start
		}
		const ready = this.pending.slice(0, cut)
		this.pending = this.pending.slice(cut)
		return this.text(ready)
	}

	calls(calls: LlmToolCall[], definitions: LlmToolDefinition[]) {
		return calls.map((call) => {
			const definition = definitions.find(
				(entry) => entry.function.name === call.function.name,
			)
			let args: unknown = HIDDEN
			if (definition) {
				try {
					args = this.project(
						JSON.parse(call.function.arguments),
						definition.function.parameters,
						definition.function.parameters,
					)
				} catch {
					this.redacted = true
				}
			} else this.redacted = true
			return {
				arguments: args,
				id: this.text(call.id),
				name: definition ? call.function.name : "[unknown-tool]",
			}
		})
	}

	private project(
		value: unknown,
		schema: Record<string, unknown>,
		root: Record<string, unknown>,
	): unknown {
		if (typeof schema.$ref === "string") {
			const resolved = schema.$ref
				.replace(/^#\//, "")
				.split("/")
				.reduce<unknown>(
					(node, key) =>
						node && typeof node === "object"
							? (node as Record<string, unknown>)[key]
							: undefined,
					root,
				)
			if (!resolved || typeof resolved !== "object") {
				this.redacted = true
				return HIDDEN
			}
			return this.project(
				value,
				resolved as Record<string, unknown>,
				root,
			)
		}
		if (Array.isArray(schema.oneOf)) {
			const branch = schema.oneOf.find((candidate) => {
				const properties = candidate.properties ?? {}
				return Object.entries(properties).every(
					([key, rule]) =>
						!(rule as Record<string, unknown>).const ||
						(value as Record<string, unknown>)?.[key] ===
							(rule as Record<string, unknown>).const,
				)
			})
			if (branch) return this.project(value, branch, root)
		}
		if (Array.isArray(value) && schema.items)
			return value.map((entry) =>
				this.project(
					entry,
					schema.items as Record<string, unknown>,
					root,
				),
			)
		if (value && typeof value === "object" && !Array.isArray(value)) {
			const properties = (schema.properties ?? {}) as Record<
				string,
				Record<string, unknown>
			>
			const result: Record<string, unknown> = {}
			for (const [key, child] of Object.entries(value)) {
				if (!Object.getOwnPropertyDescriptor(properties, key)) {
					result["[unknown-field]"] = HIDDEN
					this.redacted = true
				} else if (sensitive.test(key)) {
					result[key] = HIDDEN
					this.redacted = true
				} else result[key] = this.project(child, properties[key], root)
			}
			return result
		}
		if (typeof value === "string") return this.text(value)
		if (
			value === null ||
			typeof value === "number" ||
			typeof value === "boolean"
		)
			return value
		this.redacted = true
		return HIDDEN
	}
}
