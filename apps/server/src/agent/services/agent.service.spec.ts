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
