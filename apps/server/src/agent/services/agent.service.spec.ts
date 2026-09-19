import "reflect-metadata"
import { AgentTrigger } from "@agent/types/agent.type"
import { AgentService } from "./agent.service"
import { AgentCycleStateService } from "./agent-cycle-state.service"

describe("agent replanning during execution", () => {
	it("preserves a capacity-change trigger queued during an active cycle", async () => {
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
			new AgentCycleStateService(),
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
		release()
		await first
		await new Promise((resolve) => setImmediate(resolve))
		expect(execute).toHaveBeenCalledTimes(2)
		expect(triggers[1]).toMatchObject({
			description: "Only seven units remain",
			kind: "conditions-changed",
		})
	})
})
