import { createHash } from "node:crypto"
import { LlmLoopState } from "@agent/types/llm-loop.type"

const IN_FLIGHT_STEP_STATUSES = new Set(["awaiting-approval", "running"])
const IN_FLIGHT_CALL_STATUSES = new Set(["dialing", "in-progress"])

/**
 * A running call, recovery, or pending approval will wake the loop when it
 * settles. Spending another model turn while that work is still open is what
 * turns a 13-second engineer call into a burst of 10k-token requests and a 429.
 */
export function hasInFlightWork(state: LlmLoopState): boolean {
	const plan = state.input.previousPlan
	if (plan?.steps.some((step) => IN_FLIGHT_STEP_STATUSES.has(step.status))) {
		return true
	}
	return (
		hasStatus(state.evidence.toolCalls, "running") ||
		hasStatus(state.evidence.calls, IN_FLIGHT_CALL_STATUSES)
	)
}

function hasStatus(
	value: unknown,
	expected: string | ReadonlySet<string>,
): boolean {
	if (!Array.isArray(value)) {
		return false
	}
	const allowed =
		typeof expected === "string" ? new Set([expected]) : expected
	return value.some(
		(item) =>
			isRecord(item) &&
			typeof item.status === "string" &&
			allowed.has(item.status),
	)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

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
