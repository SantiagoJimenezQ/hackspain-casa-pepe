import { createHash } from "node:crypto"
import { LlmLoopState } from "@agent/types/llm-loop.type"

/** Excludes bookkeeping counters; includes all decision-relevant durable state. */
export function stateFingerprint(state: LlmLoopState): string {
	const {
		agentCycles: _cycles,
		updatedAt: _time,
		simulation: _simulation,
		...incident
	} = state.input.incident
	return createHash("sha256")
		.update(
			JSON.stringify({
				blocked: state.blocked,
				evidence: state.evidence,
				input: { ...state.input, incident },
			}),
		)
		.digest("hex")
}

/** Simulation scripts are the environment's hidden future, not evidence available to the agent. */
export function modelVisible(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(modelVisible)
	if (!value || typeof value !== "object") return value
	return Object.fromEntries(
		Object.entries(value)
			.filter(
				([key]) => key !== "simulation" && !key.startsWith("simulated"),
			)
			.map(([key, item]) => [key, modelVisible(item)]),
	)
}
