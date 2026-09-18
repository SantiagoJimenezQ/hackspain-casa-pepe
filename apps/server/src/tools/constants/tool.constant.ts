export const TOOL_NAMES = [
	"get_incident_context",
	"call_engineer",
	"save_recovery_plan",
	"send_incident_email",
	"publish_status_update",
	"get_incident_state",
	"get_service_health",
	"get_recovery_capacity",
	"contact_engineer",
	"assign_task",
	"request_approval",
	"execute_recovery",
	"verify_recovery",
] as const

export const TOOL_CALL_STATUSES = [
	"pending",
	"running",
	"succeeded",
	"failed",
	"cancelled",
] as const

export const TOOL_INTERACTION_KINDS = [
	"harness",
	"simulated-data",
	"real-call",
	"real-record",
	"operator-interaction",
	"test-environment",
] as const

export const TOOL_DEFINITIONS: ReadonlyArray<{
	readonly name: (typeof TOOL_NAMES)[number]
	readonly description: string
	readonly interaction: (typeof TOOL_INTERACTION_KINDS)[number]
	readonly asynchronous: boolean
}> = [
	{
		asynchronous: false,
		description: "Read incident and current plan",
		interaction: "harness",
		name: "get_incident_context",
	},
	{
		asynchronous: true,
		description: "Call the engineer and collect answers",
		interaction: "real-call",
		name: "call_engineer",
	},
	{
		asynchronous: false,
		description: "Save a versioned plan and supersede pending approvals",
		interaction: "real-record",
		name: "save_recovery_plan",
	},
	{
		asynchronous: false,
		description: "Email the persisted plan to the configured operator",
		interaction: "real-record",
		name: "send_incident_email",
	},
	{
		asynchronous: false,
		description: "Publish verified service status",
		interaction: "real-record",
		name: "publish_status_update",
	},

	{
		asynchronous: false,
		description: "Read the incident state kept by the harness",
		interaction: "harness",
		name: "get_incident_state",
	},
	{
		asynchronous: false,
		description: "Read service health and dependencies",
		interaction: "simulated-data",
		name: "get_service_health",
	},
	{
		asynchronous: false,
		description: "Read the backup capacity that remains available",
		interaction: "simulated-data",
		name: "get_recovery_capacity",
	},
	{
		asynchronous: true,
		description:
			"Call an engineer through HappyRobot and collect the answers",
		interaction: "real-call",
		name: "contact_engineer",
	},
	{
		asynchronous: false,
		description: "Create a task with an owner and a status",
		interaction: "real-record",
		name: "assign_task",
	},
	{
		asynchronous: false,
		description: "Ask the operator to authorize an action",
		interaction: "operator-interaction",
		name: "request_approval",
	},
	{
		asynchronous: true,
		description: "Execute a recovery action in the test environment",
		interaction: "test-environment",
		name: "execute_recovery",
	},
	{
		asynchronous: false,
		description:
			"Check with an independent query whether the recovery worked",
		interaction: "test-environment",
		name: "verify_recovery",
	},
]

export const TOOL_CALL_ENTITY_NAME = "Tool call"
