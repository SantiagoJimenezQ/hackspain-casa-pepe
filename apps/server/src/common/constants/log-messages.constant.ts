export const LOG_MESSAGES = {
	AGENT: {
		APPROVAL_EXPIRED: "Approval expired without an operator decision",
		CYCLE_FAILED: "Failed to complete the agent cycle",
		CYCLE_FINISHED: "Agent cycle finished",
		CYCLE_LIMIT_REACHED:
			"Agent cycle limit reached for this run, stopping automatic execution",
		CYCLE_SKIPPED_INACTIVE_RUN:
			"Agent cycle skipped because the run is no longer active",
		CYCLE_SKIPPED_REPLAY: "Agent cycle skipped because the run is a replay",
		CYCLE_STARTED: "Agent cycle started",
		ENGINEER_CALL_DISPATCHED:
			"On-call engineer called immediately, before the first model turn",
		LLM_RETRYING:
			"Retrying the LLM request after the provider asked for a pause",
		PLAN_CREATED: "Initial response plan created",
		PLAN_REVISED: "Response plan revised after a change in conditions",
		STALLED_RUN_RESUMED:
			"Idle run with runnable work resumed after a lost cycle",
		STEP_EXECUTION_FAILED: "Failed to execute a plan step",
		STEP_WAITING_FOR_APPROVAL: "Plan step is waiting for operator approval",
		TRIGGER_RECEIVED: "Agent trigger received",
	},
	APPLICATION: {
		STARTED: "Casa Pepe service started",
		UNHANDLED_EXCEPTION: "Unhandled exception while processing the request",
		UNHANDLED_REJECTION:
			"Unhandled promise rejection outside a request, the process keeps running",
	},
	APPROVALS: {
		DECIDED: "Operator decided on an approval",
		REQUESTED: "Approval requested from the operator",
		SUPERSEDED: "Pending approvals superseded by a new plan version",
	},
	CUSTOMERS: {
		RANKING_FAILED:
			"Failed to rank customers with the model, using the deterministic order",
		RANKING_FINISHED: "Customer ranking by the model finished",
	},
	DATABASE: {
		CONNECTION_FAILED: "Failed to connect to the database",
	},
	ENGINEERS: {
		CALL_AUTHORIZATION_IGNORED:
			"Live authorization ignored because the call already finished",
		CALL_AUTHORIZED: "Engineer call reported live authorizations",
		CALL_FINISHED: "Engineer call finished",
		CALL_RESULT_ALREADY_SETTLED:
			"Engineer call result ignored because the call already has one",
		CALL_RESULT_IGNORED:
			"Engineer call result ignored because it does not belong to the active run",
		CALL_STARTED: "Engineer call started",
		HAPPYROBOT_REQUEST_FAILED: "Failed to trigger the HappyRobot call",
		SIMULATED_CALL_SCHEDULED: "Simulated engineer call scheduled",
	},
	INCIDENTS: {
		EVENT_APPLIED: "Harness event applied to the incident",
		RUN_RESET: "Incident run reset",
		RUN_STARTED: "Incident run started",
		STALE_RESULT_IGNORED:
			"Late result ignored because it belongs to a previous run",
	},
	RECOVERY: {
		ACTION_FINISHED: "Recovery action finished",
		ACTION_STARTED: "Recovery action started",
		ENVIRONMENT_REQUEST_FAILED: "Failed to reach the recovery environment",
		SERVICES_CHECKED: "Service status check finished",
		VERIFICATION_FINISHED: "Recovery verification finished",
	},
	REPLAYS: {
		FINISHED: "Replay finished",
		STARTED: "Replay started",
	},
	SUBAGENTS: {
		DELEGATION_FAILED: "Failed to complete the specialist delegation",
		DELEGATION_FINISHED: "Specialist delegation finished",
		DELEGATION_STARTED: "Specialist delegation started",
		DISPATCH_OUT_OF_SCOPE:
			"Specialist tried to dispatch a step outside its own scope",
		TURN_LIMIT_REACHED:
			"Specialist reached its turn budget without reporting a result",
	},
	TASKS: {
		ASSIGNED: "Task assigned",
		UPDATED: "Task updated",
	},
	TOOLS: {
		CALL_COMPLETED: "Tool call completed",
		CALL_DUPLICATE_SKIPPED: "Duplicate tool call skipped",
		CALL_FAILED: "Tool call failed",
		CALL_STARTED: "Tool call started",
		CALL_TIMED_OUT: "Tool call timed out",
	},
	WEBHOOKS: {
		DELIVERY_EXHAUSTED:
			"Webhook delivery abandoned after reaching the maximum attempts",
		DELIVERY_FAILED: "Failed to deliver webhook, retry scheduled",
		DELIVERY_SUCCEEDED: "Webhook delivered",
		INBOUND_RECEIVED: "Inbound webhook received",
		INBOUND_REJECTED:
			"Inbound webhook rejected because the signature is invalid",
		SUBSCRIPTION_CREATED: "Webhook subscription created",
		SUBSCRIPTION_REMOVED: "Webhook subscription removed",
		SUBSCRIPTION_UPDATED:
			"Webhook subscription updated for an existing target URL",
	},
} as const
