import "reflect-metadata"
import { AgentTrigger } from "@agent/types/agent.type"
import { AgentService } from "./agent.service"
import { AgentCycleStateService } from "./agent-cycle-state.service"

describe("agent replanning during execution", () => {
	it.each([false, true])(
		"handles queued work when reset is %s",
		async (reset) => {
			const cycleState = new AgentCycleStateService()
			const service = new AgentService(
				{} as never,
				{} as never,
				{} as never,
				{} as never,
				{} as never,
				{} as never,
				{} as never,
				{} as never,
				{} as never,
				{} as never,
				cycleState,
				{} as never,
				{} as never,
				{} as never,
			)
			let release: () => void
			const blocked = new Promise<void>((resolve) => {
				release = resolve
			})
			const triggers: AgentTrigger[] = []
			const execute = jest
				.spyOn(
					service as unknown as {
						executeCycle: (
							run: string,
							trigger: AgentTrigger,
						) => Promise<unknown>
					},
					"executeCycle",
				)
				.mockImplementation(async (_run, trigger) => {
					triggers.push(trigger)
					if (triggers.length === 1) await blocked
					return {
						executedSteps: 1,
						kind: "completed",
						planVersion: 1,
						waitingFor: [],
					}
				})
			const first = service.requestCycle("run", { kind: "follow-up" })
			await service.requestCycle("run", {
				description: "Only seven units remain",
				harnessEventIdentifier: "incoming-call",
				kind: "conditions-changed",
			})
			await service.requestCycle("run", { kind: "follow-up" })
			if (reset) service.onRunDeactivated({ runIdentifier: "run" })
			release()
			await first
			await new Promise((resolve) => setImmediate(resolve))
			if (reset) {
				expect(execute).toHaveBeenCalledTimes(1)
				expect(cycleState.get("run")).toMatchObject({
					inProgress: false,
					lastOutcome: null,
					rerunRequested: false,
				})
				await service.requestCycle("new-run", { kind: "follow-up" })
				expect(execute).toHaveBeenCalledTimes(2)
				return
			}
			expect(execute).toHaveBeenCalledTimes(2)
			expect(triggers[1]).toMatchObject({
				description: "Only seven units remain",
				kind: "conditions-changed",
			})
		},
	)
})

describe("human task follow-up", () => {
	function setup() {
		const tasks = { list: jest.fn().mockResolvedValue([]) }
		const plans = { findLatestPlan: jest.fn().mockResolvedValue(null) }
		const incident = {
			runIdentifier: "run",
			scenarioIdentifier: "scenario",
		}
		const service = new AgentService(
			{
				getByRunIdentifier: jest.fn().mockResolvedValue(incident),
			} as never,
			{
				getScenario: () => ({ family: "meteorite", language: "en" }),
			} as never,
			plans as never,
			{ list: jest.fn().mockResolvedValue([]) } as never,
			{ list: jest.fn().mockResolvedValue([]) } as never,
			{
				list: jest.fn().mockResolvedValue([]),
				mode: "live",
				provider: "elevenlabs",
			} as never,
			{} as never,
			{} as never,
			{ list: jest.fn().mockResolvedValue([]) } as never,
			{} as never,
			new AgentCycleStateService(),
			{ list: jest.fn().mockResolvedValue([]) } as never,
			{} as never,
			tasks as never,
		)
		return { service, tasks }
	}

	it("resumes the owning run when a human updates a task", async () => {
		const { service } = setup()
		const request = jest
			.spyOn(service, "requestCycle")
			.mockResolvedValue({ kind: "skipped", reason: "test" })
		await service.onTaskUpdated({
			task: {
				identifier: "task_review",
				runIdentifier: "run",
				status: "done",
			},
		} as never)
		expect(request).toHaveBeenCalledWith(
			"run",
			expect.objectContaining({
				harnessEventIdentifier: "task_review",
				kind: "conditions-changed",
			}),
		)
	})

	it("provides current task notes and voice capabilities on every observation", async () => {
		const { service, tasks } = setup()
		const internals = service as unknown as {
			buildLlmInput: () => Promise<unknown>
			observeForLlm: (
				run: string,
				trigger: AgentTrigger,
			) => Promise<{ evidence: Record<string, unknown> }>
		}
		jest.spyOn(internals, "buildLlmInput").mockResolvedValue({})
		const task = {
			identifier: "task_review",
			status: "open",
			statusNote: "",
		}
		tasks.list.mockResolvedValue([task])
		const before = await internals.observeForLlm("run", {
			kind: "follow-up",
		})
		expect(before.evidence.tasks).toEqual([task])
		expect(before.evidence.engineerCall).toEqual({
			mode: "live",
			provider: "elevenlabs",
			technicalQuestionsSupported: false,
		})
		const updated = {
			...task,
			status: "done",
			statusNote: "Platform reports capacity; needs confirmation",
		}
		tasks.list.mockResolvedValue([updated])
		const after = await internals.observeForLlm("run", {
			kind: "follow-up",
		})
		expect(after.evidence.tasks).toEqual([updated])
		expect(tasks.list).toHaveBeenCalledWith("run")
	})
})
