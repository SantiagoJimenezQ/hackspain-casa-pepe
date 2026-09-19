import { METEORITE_SCENARIO } from "@scenarios/constants/meteorite-scenario.constant"
import { SeededSimulationService } from "@scenarios/services/seeded-simulation.service"

describe("SeededSimulationService", () => {
	const service = new SeededSimulationService()

	it("replays initial capacity and recovery outcomes for the same seed", () => {
		const firstState = service.createState({
			difficulty: "medium",
			mode: "randomized",
			seed: 42,
		})
		const secondState = service.createState({
			difficulty: "medium",
			mode: "randomized",
			seed: 42,
		})
		const firstScenario = service.withInitialCapacity(
			METEORITE_SCENARIO,
			firstState,
		)
		const secondScenario = service.withInitialCapacity(
			METEORITE_SCENARIO,
			secondState,
		)

		expect(firstScenario.resources[0].reportedCapacity).toBe(
			secondScenario.resources[0].reportedCapacity,
		)
		expect(
			service.sampleRecovery(
				firstState,
				METEORITE_SCENARIO.services[0],
				4,
				firstScenario.resources[0].reportedCapacity,
			),
		).toEqual(
			service.sampleRecovery(
				secondState,
				METEORITE_SCENARIO.services[0],
				4,
				secondScenario.resources[0].reportedCapacity,
			),
		)
	})

	it("does not consume random draws in manual mode", () => {
		const state = service.createState()
		const scenario = service.withInitialCapacity(METEORITE_SCENARIO, state)
		service.sampleRecovery(state, scenario.services[0], 0, 12)

		expect(state.initialDraws).toBe(0)
		expect(state.recoveryDraws).toBe(0)
	})

	it("respects the disruption cap and pause", () => {
		const state = service.createState({
			maxConcurrentDisruptions: 1,
			mode: "randomized",
			seed: 42,
		})
		const healthy = [{ identifier: "service-a", status: "healthy" }]
		expect(service.maybeDisrupt(state, healthy)).toBeNull()
		const disruption = service.maybeDisrupt(state, healthy, true)
		if (disruption) {
			expect(state.generatedDisruptions).toBe(1)
			expect(service.maybeDisrupt(state, healthy, true)).toBeNull()
		}
	})
})
