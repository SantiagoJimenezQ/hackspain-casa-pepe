import type { PlanDraft } from "@agent/types/agent.type"
import type { LlmLoopState } from "@agent/types/llm-loop.type"
import type { ApprovalRecord } from "@approvals/types/approval.type"
import type { PlanRecord } from "@plans/types/plan.type"
import type { ToolCallRecord } from "@tools/types/tool.type"
import type { CombinedPlanActionResult } from "../../../../../packages/contracts/agent"
import { stateFingerprint } from "./llm-state"

export function assertSelectedStep(draft: PlanDraft, identifier: string) {
	const step = draft.steps.find((item) => item.identifier === identifier)
	if (
		!step ||
		!["proposed", "approved"].includes(step.status) ||
		!step.dependsOn.every((id) =>
			draft.steps.some(
				(item) => item.identifier === id && item.status === "completed",
			),
		)
	) {
		throw new Error("Selected step is not runnable")
	}
	return step
}

/** Allow only the effects owned by this exact save; new evidence must still invalidate dispatch. */
export function stateAfterOwnSave(
	before: LlmLoopState,
	fresh: LlmLoopState,
	plan: PlanRecord,
): boolean {
	const expected = structuredClone(before)
	const actual = structuredClone(fresh)
	expected.input = {
		...expected.input,
		incident: {
			...expected.input.incident,
			backupRegion:
				before.input.incident.resources.find(
					(r) => r.identifier === plan.capacity.resourceIdentifier,
				)?.region ?? before.input.incident.backupRegion,
			status:
				!before.input.previousPlan &&
				before.input.incident.status === "detected"
					? "responding"
					: before.input.incident.status,
		},
		previousPlan: plan,
	}
	const approvals = (before.evidence.approvals ?? []) as ApprovalRecord[]
	actual.evidence.approvals = (
		(actual.evidence.approvals ?? []) as ApprovalRecord[]
	).map((approval) => {
		const prior = approvals.find(
			(item) => item.identifier === approval.identifier,
		)
		if (
			before.input.previousPlan &&
			prior?.status === "pending" &&
			approval.status === "superseded" &&
			approval.invalidationReason ===
				`Plan revised: ${before.input.triggeredBy}`
		) {
			return {
				...approval,
				decidedAt: prior.decidedAt,
				invalidationReason: prior.invalidationReason,
				status: prior.status,
			}
		}
		return approval
	})
	expected.evidence.approvals ??= []
	// Evidence is bounded to 30 calls. The own save may displace exactly one oldest entry.
	const calls = (actual.evidence.toolCalls ?? []) as ToolCallRecord[]
	const own = calls.filter(
		(call) =>
			call.name === "save_recovery_plan" &&
			call.decisionIdentifier === plan.decisionIdentifier &&
			call.status === "succeeded",
	)
	if (own.length !== 1) return false
	actual.evidence.toolCalls = calls.filter((call) => !own.includes(call))
	const previousCalls = (expected.evidence.toolCalls ??
		[]) as ToolCallRecord[]
	expected.evidence.toolCalls = previousCalls.slice(-(30 - own.length))
	return (
		!fresh.blocked &&
		fresh.input.incident.active &&
		fresh.input.incident.runKind !== "replay" &&
		stateFingerprint(expected) === stateFingerprint(actual)
	)
}

export async function saveAndStart(
	draft: PlanDraft,
	identifier: string,
	expected: LlmLoopState,
	operations: {
		save(draft: PlanDraft, expected: LlmLoopState): Promise<PlanRecord>
		observe(): Promise<LlmLoopState>
		execute(identifier: string, expected: LlmLoopState): Promise<unknown>
		latest(): Promise<PlanRecord | null>
	},
): Promise<CombinedPlanActionResult> {
	assertSelectedStep(draft, identifier)
	const saved = await operations.save(draft, expected)
	const fresh = await operations.observe()
	if (!stateAfterOwnSave(expected, fresh, saved)) {
		// Keep the saved plan auditable, but do not act on newly arrived evidence.
		return {
			dispatchStatus: "blocked",
			planIdentifier: saved.identifier,
			planVersion: saved.version,
			reason: "Evidence changed after saving; reassess before dispatch",
			selectedStepIdentifier: identifier,
		}
	}
	await operations.execute(identifier, fresh)
	const updated = await operations.latest()
	const step = updated?.steps.find((item) => item.identifier === identifier)
	return {
		approvalIdentifier: step?.approvalIdentifier,
		dispatchStatus:
			step?.status === "awaiting-approval"
				? "awaiting-approval"
				: step?.status === "failed"
					? "failed"
					: step && ["running", "completed"].includes(step.status)
						? "dispatched"
						: "blocked",
		planIdentifier: saved.identifier,
		planVersion: saved.version,
		selectedStepIdentifier: identifier,
		toolCallIdentifier: step?.toolCallIdentifier,
	}
}
