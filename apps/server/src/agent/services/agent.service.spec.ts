import "reflect-metadata"
import { AGENT_MESSAGES } from "@agent/constants/agent-messages.constant"
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

	it("does not immediately rerun after a provider rate limit", async () => {
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
			.mockImplementation(async () => {
				await blocked
				return {
					kind: "failed",
					reason: "LLM provider returned HTTP 429; autonomous decisions paused",
				}
			})
		const first = service.requestCycle("run", { kind: "follow-up" })
		await service.requestCycle("run", {
			description: "Only seven units remain",
			harnessEventIdentifier: "incoming-call",
			kind: "conditions-changed",
		})
		release()
		await first
		await new Promise((resolve) => setImmediate(resolve))
		expect(execute).toHaveBeenCalledTimes(1)
		expect(cycleState.get("run")).toMatchObject({
			inProgress: false,
			lastOutcome: {
				kind: "failed",
				reason: "LLM provider returned HTTP 429; autonomous decisions paused",
			},
		})
	})
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
			technicalQuestionsSupported: true,
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

describe("engineer call authorizations", () => {
	function setup() {
		const incidents = {
			confirmResourceCapacity: jest.fn().mockResolvedValue(undefined),
			recordFact: jest.fn().mockResolvedValue(undefined),
		}
		const service = new AgentService(
			{} as never,
			incidents as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{ demo: { engineerName: "Guillermo" } } as never,
			new AgentCycleStateService(),
			{} as never,
			{} as never,
			{} as never,
		)
		jest.spyOn(
			service as unknown as { scenarioOf: () => unknown },
			"scenarioOf",
		).mockReturnValue({
			engineerBriefing: {
				questions: [
					{ confirmsFact: "The snapshot is recent enough" },
					{ confirmsFact: "Route assignment can run in the backup" },
				],
			},
		})
		const record = (
			service as unknown as {
				recordAuthorizationsFromCall: (
					incident: unknown,
					authorizations: unknown,
					mode: string,
					messages: unknown,
				) => Promise<number>
			}
		).recordAuthorizationsFromCall.bind(service)
		return { incidents, record }
	}

	const incident = {
		resources: [{ identifier: "backup-oman" }],
		runIdentifier: "run",
	}

	it("records a granted authorization and confirms the backup capacity it covers", async () => {
		const { incidents, record } = setup()

		const recorded = await record(
			incident,
			{
				notifyAllClients: { rationale: "said yes", value: true },
				trafficFailoverAuthorized: {
					rationale: "said yes",
					value: true,
				},
			},
			"live",
			AGENT_MESSAGES.en,
		)

		expect(recorded).toBe(4)
		expect(incidents.recordFact).toHaveBeenCalledTimes(4)
		expect(incidents.recordFact).toHaveBeenCalledWith(
			"run",
			"The snapshot is recent enough",
			"confirmed",
			expect.stringContaining("authorized by voice"),
		)
		expect(incidents.recordFact).toHaveBeenCalledWith(
			"run",
			AGENT_MESSAGES.en.authorizedTrafficFailover,
			"confirmed",
			"Guillermo (live)",
		)
		expect(incidents.confirmResourceCapacity).toHaveBeenCalledWith(
			"run",
			"backup-oman",
			true,
			expect.stringContaining("Guillermo"),
		)
	})

	it("records nothing when the engineer refused or stayed unclear", async () => {
		const { incidents, record } = setup()

		const recorded = await record(
			incident,
			{
				notifyAllClients: { rationale: "no answer", value: null },
				trafficFailoverAuthorized: {
					rationale: "refused",
					value: false,
				},
			},
			"live",
			AGENT_MESSAGES.en,
		)

		expect(recorded).toBe(0)
		expect(incidents.recordFact).not.toHaveBeenCalled()
		expect(incidents.confirmResourceCapacity).not.toHaveBeenCalled()
	})
})
