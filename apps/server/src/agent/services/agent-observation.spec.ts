import "reflect-metadata"
import { LlmLoopState } from "@agent/llm/llm-loop.service"
import { speedFixture } from "@root/testing/speed.fixture"
import { METEORITE_SCENARIO } from "@scenarios/constants/meteorite-scenario.constant"
import { AgentService } from "./agent.service"

function harness() {
	const { input } = speedFixture()
	const approvals = [
		{
			comment: "Wait",
			decidedBy: "Operator",
			identifier: "a",
			serviceIdentifier: "orders-database",
			status: "rejected",
		},
	]
	const runs = {
		getByRunIdentifier: jest.fn().mockResolvedValue(input.incident),
	}
	const plans = { findLatestPlan: jest.fn().mockResolvedValue(null) }
	const approvalsService = { list: jest.fn().mockResolvedValue(approvals) }
	const learning = {
		findCapacityInsight: jest.fn(),
		list: jest.fn().mockResolvedValue([]),
	}
	const service = Object.assign(Object.create(AgentService.prototype), {
		approvalsService,
		configuration: {
			agent: { maximumStepAttempts: 2 },
			demo: {
				engineerName: "Marta",
				engineerPhone: "+34600000000",
				engineerRole: "on-call",
			},
		},
		engineersService: { list: jest.fn().mockResolvedValue([]) },
		incidentsService: { getScenario: () => METEORITE_SCENARIO },
		incomingCalls: { list: jest.fn().mockResolvedValue([]) },
		learningService: learning,
		plansService: plans,
		recoveryService: { mode: "simulated" },
		runsService: runs,
		tasksService: { list: jest.fn().mockResolvedValue([]) },
		toolsService: { list: jest.fn().mockResolvedValue([]) },
	}) as {
		observeForLlm(
			run: string,
			trigger: { kind: "follow-up" },
		): Promise<LlmLoopState>
	}
	return {
		approvals,
		approvalsService,
		input,
		learning,
		plans,
		runs,
		service,
	}
}
describe("authoritative observation", () => {
	it("O01 reuses approval and learning reads", async () => {
		const h = harness()
		const result = await h.service.observeForLlm("run", {
			kind: "follow-up",
		})
		expect(h.approvalsService.list).toHaveBeenCalledTimes(1)
		expect(h.learning.list).toHaveBeenCalledTimes(1)
		expect(h.learning.findCapacityInsight).not.toHaveBeenCalled()
		expect(result.input.rejectedServices[0].serviceIdentifier).toBe(
			"orders-database",
		)
		expect(result.evidence.approvals).toEqual(h.approvals)
	})
	it("O02 starts independent reads before awaiting incident", async () => {
		const h = harness()
		let release!: (value: unknown) => void
		h.runs.getByRunIdentifier.mockReturnValue(
			new Promise((resolve) => {
				release = resolve
			}),
		)
		const pending = h.service.observeForLlm("run", { kind: "follow-up" })
		expect(h.plans.findLatestPlan).toHaveBeenCalledTimes(1)
		expect(h.approvalsService.list).toHaveBeenCalledTimes(1)
		release(h.input.incident)
		await pending
	})
	it("O03 detaches the model snapshot from repository objects", async () => {
		const h = harness()
		const result = await h.service.observeForLlm("run", {
			kind: "follow-up",
		})
		h.approvals[0].comment = "Changed"
		expect(
			(result.evidence.approvals as typeof h.approvals)[0].comment,
		).toBe("Wait")
		expect(
			(
				(await h.service.observeForLlm("run", { kind: "follow-up" }))
					.evidence.approvals as typeof h.approvals
			)[0].comment,
		).toBe("Changed")
	})
	it("O04 fails closed when required evidence cannot be read", async () => {
		const h = harness()
		h.approvalsService.list.mockRejectedValue(
			new Error("database unavailable"),
		)
		await expect(
			h.service.observeForLlm("run", { kind: "follow-up" }),
		).rejects.toThrow("database unavailable")
	})
})
