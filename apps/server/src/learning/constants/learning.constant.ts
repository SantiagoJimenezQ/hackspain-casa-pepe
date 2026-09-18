export const INSIGHT_KINDS = ["capacity-overstated", "recovery-outcome"] as const

export const LEARNING_INSIGHT_ENTITY_NAME = "Learning insight"

export const REPORT_TIMELINE_EVENT_TYPES = [
	"incident.impact-detected",
	"incident.status-changed",
	"plan.created",
	"plan.revised",
	"decision.recorded",
	"engineer-call.completed",
	"engineer-call.failed",
	"approval.requested",
	"approval.decided",
	"approval.superseded",
	"approval.expired",
	"recovery.executed",
	"recovery.verified",
	"task.assigned",
	"agent.limit-reached",
] as const
