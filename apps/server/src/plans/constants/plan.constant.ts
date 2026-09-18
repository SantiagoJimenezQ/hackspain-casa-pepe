export const PLAN_STATUSES = ["active", "superseded", "completed"] as const

export const PLAN_STEP_STATUSES = [
	"proposed",
	"awaiting-approval",
	"approved",
	"rejected",
	"running",
	"completed",
	"failed",
	"cancelled",
	"postponed",
] as const

export const SERVICE_DECISIONS = [
	"recover-now",
	"postpone",
	"already-healthy",
	"waiting-for-dependency",
] as const

export const PLAN_CHANGE_KINDS = [
	"step-added",
	"step-removed",
	"step-postponed",
	"step-reprioritized",
	"priority-changed",
	"capacity-changed",
] as const

export const PLAN_ENTITY_NAME = "Plan"

export const PLAN_STEP_ENTITY_NAME = "Plan step"

export const PLAN_STEP_OWNER_AGENT = "Casa Pepe agent"
