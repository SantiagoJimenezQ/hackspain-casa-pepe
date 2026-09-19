import { speedFixture } from "@root/testing/speed.fixture"
import {
	assertSelectedStep,
	saveAndStart,
	stateAfterOwnSave,
} from "./combined-plan"
import { LlmLoopState } from "./llm-loop.service"

function pair() {
	const { input, plan } = speedFixture()
	const before: LlmLoopState = {
		blocked: false,
		evidence: { approvals: [], toolCalls: [] },
		input,
	}
	const fresh = structuredClone(before)
	fresh.input = {
		...fresh.input,
		incident: { ...fresh.input.incident, status: "responding" },
		previousPlan: plan,
	}
	fresh.evidence.toolCalls = [
		{
			decisionIdentifier: plan.decisionIdentifier,
			name: "save_recovery_plan",
			status: "succeeded",
		},
	]
	return { before, fresh, plan }
}
describe("save-to-dispatch guard", () => {
	it("C06 permits only own save effects", () => {
		const { before, fresh, plan } = pair()
		expect(stateAfterOwnSave(before, fresh, plan)).toBe(true)
	})
	it.each([
		"capacity",
		"reset",
		"report",
		"plan",
		"dependency",
		"tool-result",
	])("C05/C07 blocks %s after persistence", (kind) => {
		const { before, fresh, plan } = pair()
		if (kind === "capacity")
			fresh.input = {
				...fresh.input,
				incident: {
					...fresh.input.incident,
					resources: fresh.input.incident.resources.map((r, i) =>
						i === 0 ? { ...r, totalCapacity: 7 } : r,
					),
				},
			}
		if (kind === "reset")
			fresh.input = {
				...fresh.input,
				incident: { ...fresh.input.incident, active: false },
			}
		if (kind === "report") fresh.blocked = true
		if (kind === "plan")
			fresh.input = {
				...fresh.input,
				previousPlan: { ...plan, version: 3 },
			}
		if (kind === "dependency")
			fresh.input = {
				...fresh.input,
				incident: {
					...fresh.input.incident,
					services: fresh.input.incident.services.map((s, i) =>
						i === 0 ? { ...s, status: "healthy" } : s,
					),
				},
			}
		if (kind === "tool-result")
			fresh.evidence.toolCalls = [
				...(fresh.evidence.toolCalls as unknown[]),
				{ name: "execute_recovery", status: "succeeded" },
			]
		expect(stateAfterOwnSave(before, fresh, plan)).toBe(false)
	})
	it("C08 rejects unknown or dependency-blocked selections", () => {
		const { draft } = speedFixture()
		expect(() => assertSelectedStep(draft, "missing")).toThrow()
		const blocked = draft.steps.find((s) => s.dependsOn.length)
		expect(blocked).toBeDefined()
		if (!blocked) throw new Error("Missing dependent test step")
		expect(() => assertSelectedStep(draft, blocked.identifier)).toThrow()
	})
	it("C11 does not normalize operator decisions into a save effect", () => {
		const { before, fresh, plan } = pair()
		before.evidence.approvals = [{ identifier: "A", status: "pending" }]
		fresh.evidence.approvals = [{ identifier: "A", status: "rejected" }]
		expect(stateAfterOwnSave(before, fresh, plan)).toBe(false)
	})
})

describe("combined persistence and dispatch", () => {
	function operations() {
		const { before, fresh, plan } = pair()
		const selected = plan.steps.find(
			(s) => s.status === "proposed" && s.dependsOn.length === 0,
		)
		if (!selected) throw new Error("Missing fixture action")
		return {
			before,
			fresh,
			ops: {
				execute: jest.fn().mockResolvedValue(undefined),
				latest: jest.fn().mockResolvedValue(plan),
				observe: jest.fn().mockResolvedValue(fresh),
				save: jest.fn().mockResolvedValue(plan),
			},
			plan,
			selected,
		}
	}
	it("C03 returns awaiting approval without claiming dispatch", async () => {
		const h = operations()
		h.ops.latest.mockResolvedValue({
			...h.plan,
			steps: h.plan.steps.map((s) =>
				s.identifier === h.selected.identifier
					? {
							...s,
							approvalIdentifier: "A",
							status: "awaiting-approval",
						}
					: s,
			),
		})
		expect(
			await saveAndStart(h.plan, h.selected.identifier, h.before, h.ops),
		).toMatchObject({
			approvalIdentifier: "A",
			dispatchStatus: "awaiting-approval",
		})
	})
	it("C05 retains a saved plan but blocks execution after new evidence", async () => {
		const h = operations()
		h.fresh.blocked = true
		expect(
			await saveAndStart(h.plan, h.selected.identifier, h.before, h.ops),
		).toMatchObject({
			dispatchStatus: "blocked",
			planIdentifier: h.plan.identifier,
		})
		expect(h.ops.save).toHaveBeenCalledTimes(1)
		expect(h.ops.execute).not.toHaveBeenCalled()
	})
	it("C10 never dispatches after persistence fails", async () => {
		const h = operations()
		h.ops.save.mockRejectedValue(new Error("write failed"))
		await expect(
			saveAndStart(h.plan, h.selected.identifier, h.before, h.ops),
		).rejects.toThrow("write failed")
		expect(h.ops.execute).not.toHaveBeenCalled()
	})
	it("C10 does not retry an uncertain external action", async () => {
		const h = operations()
		h.ops.execute.mockRejectedValue(new Error("adapter unavailable"))
		await expect(
			saveAndStart(h.plan, h.selected.identifier, h.before, h.ops),
		).rejects.toThrow("adapter unavailable")
		expect(h.ops.save).toHaveBeenCalledTimes(1)
		expect(h.ops.execute).toHaveBeenCalledTimes(1)
	})
})
