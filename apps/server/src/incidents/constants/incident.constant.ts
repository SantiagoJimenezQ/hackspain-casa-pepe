export const INCIDENT_STATUSES = [
	"normal",
	"detected",
	"responding",
	"partially-recovered",
	"recovered",
	"reset",
] as const

export const RUN_KINDS = ["live", "replay"] as const

export const HARNESS_EVENT_TYPES = [
	"meteorite-impact",
	"capacity-limited",
	"service-health-changed",
	"fact-reported",
] as const

export const FACT_STATUSES = ["confirmed", "pending", "refuted"] as const

export const INCIDENT_ENTITY_NAME = "Incident"

export const RUN_ENTITY_NAME = "Run"
