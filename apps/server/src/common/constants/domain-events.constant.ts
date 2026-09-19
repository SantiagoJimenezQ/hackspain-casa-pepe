export const DOMAIN_EVENTS = {
	ACTIVITY_RECORDED: "domain.activity.recorded",
	APPROVAL_DECIDED: "domain.approval.decided",
	ENGINEER_CALL_FINISHED: "domain.engineer-call.finished",
	INCIDENT_EVENT_APPLIED: "domain.incident.event-applied",
	INCIDENT_RUN_DEACTIVATED: "domain.incident.run-deactivated",
	INCIDENT_RUN_STARTED: "domain.incident.run-started",
	INCOMING_CALL_CONFIRMED: "domain.incoming-call.confirmed",
	INCOMING_CALL_RECEIVED: "domain.incoming-call.received",
	RECOVERY_ACTION_FINISHED: "domain.recovery.action-finished",
	TASK_UPDATED: "domain.task.updated",
	TOOL_CALL_FINISHED: "domain.tool-call.finished",
} as const
