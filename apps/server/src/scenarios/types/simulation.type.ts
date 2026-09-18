import type {
	SimulationConfigInput,
	SimulationDisruption,
	SimulationRecoveryScript,
	SimulationState,
} from "../../../../../packages/contracts/simulation"

export const SIMULATION_MODES = ["manual", "randomized"] as const
export const SIMULATION_DIFFICULTIES = ["easy", "medium", "hard"] as const

export type SimulationMode = (typeof SIMULATION_MODES)[number]
export type SimulationDifficulty = (typeof SIMULATION_DIFFICULTIES)[number]

export type {
	SimulationConfigInput,
	SimulationDisruption,
	SimulationRecoveryScript,
	SimulationState,
}
