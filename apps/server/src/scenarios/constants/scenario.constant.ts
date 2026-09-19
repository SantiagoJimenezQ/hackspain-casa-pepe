export const SERVICE_HEALTH_STATUSES = [
	"healthy",
	"degraded",
	"down",
	"recovering",
] as const

export const BUSINESS_IMPACT_LEVELS = [
	"critical",
	"high",
	"medium",
	"low",
] as const

export const RECOVERY_ACTION_KINDS = [
	"failover-database",
	"redeploy-service",
	"restart-stream",
	"scale-service",
] as const

export const SIMULATED_OUTCOMES = ["success", "partial", "failure"] as const

export const BUSINESS_IMPACT_WEIGHTS: Record<
	(typeof BUSINESS_IMPACT_LEVELS)[number],
	number
> = {
	critical: 100,
	high: 60,
	low: 10,
	medium: 30,
}

export const SCENARIO_LANGUAGES = ["en", "es"] as const

export const DEFAULT_SCENARIO_IDENTIFIER = "meteorite-me-south-1"

export const SPANISH_SCENARIO_IDENTIFIER = "meteorite-me-south-1-es"
