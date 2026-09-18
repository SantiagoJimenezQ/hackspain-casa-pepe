import { Injectable } from "@nestjs/common"
import {
	ScenarioDefinition,
	ScenarioService,
} from "@scenarios/types/scenario.type"
import {
	SimulationConfigInput,
	SimulationDisruption,
	SimulationRecoveryScript,
	SimulationState,
} from "@scenarios/types/simulation.type"

interface DifficultyRules {
	readonly minimumCapacitySpare: number
	readonly maximumCapacitySpare: number
	readonly recoveryFailureRate: number
	readonly disruptionRate: number
}

const RULES: Record<SimulationState["difficulty"], DifficultyRules> = {
	easy: {
		disruptionRate: 0.15,
		maximumCapacitySpare: 3,
		minimumCapacitySpare: 0,
		recoveryFailureRate: 0.002,
	},
	hard: {
		disruptionRate: 0.5,
		maximumCapacitySpare: 1,
		minimumCapacitySpare: 0,
		recoveryFailureRate: 0.015,
	},
	medium: {
		disruptionRate: 0.3,
		maximumCapacitySpare: 2,
		minimumCapacitySpare: 0,
		recoveryFailureRate: 0.008,
	},
}

const SALTS = {
	disruption: 0xabcdef01,
	initial: 0x12345678,
	recovery: 0x87654321,
} as const

@Injectable()
export class SeededSimulationService {
	createState(config: SimulationConfigInput = {}): SimulationState {
		return {
			automaticEvents: config.automaticEvents ?? true,
			difficulty: config.difficulty ?? "medium",
			disruptionDraws: 0,
			elapsedMinutes: 0,
			generatedDisruptions: 0,
			initialDraws: 0,
			maxConcurrentDisruptions: config.maxConcurrentDisruptions ?? 2,
			mode: config.mode ?? "manual",
			paused: true,
			recoveryDraws: 0,
			seed: config.seed ?? 42,
		}
	}

	withInitialCapacity(
		scenario: ScenarioDefinition,
		simulation: SimulationState,
	): ScenarioDefinition {
		if (simulation.mode === "manual") {
			return scenario
		}
		const rules = RULES[simulation.difficulty]
		const spare = this.drawInitial(
			simulation,
			rules.maximumCapacitySpare + 1,
		)
		const totalCapacity = Math.max(
			rules.minimumCapacitySpare + 1,
			scenario.resource.reportedCapacity - 3 + spare,
		)
		return {
			...scenario,
			resource: { ...scenario.resource, reportedCapacity: totalCapacity },
		}
	}

	sampleRecovery(
		simulation: SimulationState,
		service: ScenarioService,
		allocatedCapacity: number,
		totalCapacity: number,
	): SimulationRecoveryScript {
		if (simulation.mode === "manual") {
			return service.simulatedRecovery
		}
		const rules = RULES[simulation.difficulty]
		const utilization = Math.min(
			1,
			allocatedCapacity / Math.max(1, totalCapacity),
		)
		const failureRate = rules.recoveryFailureRate * (1 + 2 * utilization)
		const failed = this.drawRecovery(simulation) < failureRate
		if (failed) {
			return {
				detail: `Simulated transfer timeout at ${Math.round(utilization * 100)}% backup capacity utilization`,
				outcome: "failure",
			}
		}
		return service.simulatedRecovery
	}

	maybeDisrupt(
		simulation: SimulationState,
		services: ReadonlyArray<{ identifier: string; status: string }>,
		allowWhilePaused = false,
	): SimulationDisruption | null {
		if (
			simulation.mode !== "randomized" ||
			!simulation.automaticEvents ||
			simulation.generatedDisruptions >=
				simulation.maxConcurrentDisruptions ||
			(simulation.paused && !allowWhilePaused)
		) {
			return null
		}
		const unhealthy = services.filter(
			(service) => service.status !== "healthy",
		).length
		if (unhealthy >= simulation.maxConcurrentDisruptions) {
			return null
		}
		const rules = RULES[simulation.difficulty]
		if (this.drawDisruption(simulation) >= rules.disruptionRate) {
			return null
		}
		const candidates = services.filter(
			(service) => service.status === "healthy",
		)
		if (!candidates.length) {
			return null
		}
		const candidate =
			candidates[
				Math.floor(this.drawDisruption(simulation) * candidates.length)
			]
		const status =
			this.drawDisruption(simulation) < 0.5 ? "degraded" : "down"
		simulation.generatedDisruptions += 1
		return {
			reason: "Seeded secondary infrastructure fault during recovery",
			serviceIdentifier: candidate.identifier,
			status,
		}
	}

	private drawInitial(simulation: SimulationState, buckets: number): number {
		const value = this.random(
			simulation.seed,
			SALTS.initial,
			simulation.initialDraws,
		)
		simulation.initialDraws += 1
		return Math.floor(value * buckets)
	}

	private drawRecovery(simulation: SimulationState): number {
		const value = this.random(
			simulation.seed,
			SALTS.recovery,
			simulation.recoveryDraws,
		)
		simulation.recoveryDraws += 1
		return value
	}

	private drawDisruption(simulation: SimulationState): number {
		const value = this.random(
			simulation.seed,
			SALTS.disruption,
			simulation.disruptionDraws,
		)
		simulation.disruptionDraws += 1
		return value
	}

	private random(seed: number, salt: number, draw: number): number {
		let value = (seed ^ salt ^ draw) >>> 0
		value = (value + 0x6d2b79f5) >>> 0
		let mixed = value
		mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
	}
}
