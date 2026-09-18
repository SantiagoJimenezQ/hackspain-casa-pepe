export type SimulationMode = "manual" | "randomized"
export type SimulationDifficulty = "easy" | "medium" | "hard"

export interface SimulationConfigInput {
	mode?: SimulationMode
	seed?: number
	difficulty?: SimulationDifficulty
	automaticEvents?: boolean
	maxConcurrentDisruptions?: number
}

export interface SimulationState {
	mode: SimulationMode
	seed: number
	difficulty: SimulationDifficulty
	automaticEvents: boolean
	maxConcurrentDisruptions: number
	paused: boolean
	elapsedMinutes: number
	generatedDisruptions: number
	initialDraws: number
	recoveryDraws: number
	disruptionDraws: number
}

export interface SimulationRecoveryScript {
	outcome: "success" | "partial" | "failure"
	detail: string
}

export interface SimulationDisruption {
	serviceIdentifier: string
	status: "healthy" | "degraded" | "down" | "recovering"
	reason: string
}

export interface AdvanceSimulationRequest {
	minutes?: number
}
