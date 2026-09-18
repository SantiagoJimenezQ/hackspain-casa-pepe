export const ACTIVITY_EVENT_TYPES = [
	"engineer-call.incoming",
	"incident.run-started",
	"incident.impact-detected",
	"incident.event-applied",
	"incident.status-changed",
	"incident.run-reset",
	"service.health-changed",
	"resource.capacity-changed",
	"fact.recorded",
	"plan.created",
	"plan.revised",
	"plan-step.updated",
	"decision.recorded",
	"tool-call.started",
	"tool-call.completed",
	"tool-call.failed",
	"approval.requested",
	"approval.decided",
	"approval.superseded",
	"approval.expired",
	"task.assigned",
	"task.updated",
	"engineer-call.started",
	"engineer-call.completed",
	"engineer-call.failed",
	"recovery.executed",
	"recovery.verified",
	"simulation.advanced",
	"agent.cycle-finished",
	"agent.limit-reached",
	"replay.started",
	"replay.finished",
] as const

export const ACTIVITY_SOURCES = [
	"harness",
	"agent",
	"operator",
	"tool",
	"integration",
	"system",
	"replay",
] as const

export const ACTIVITY_DEFAULT_PAGE_LIMIT = 100

export const ACTIVITY_MAXIMUM_PAGE_LIMIT = 500
