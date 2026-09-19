export const ENGINEER_CALL_STATUSES = [
	"dialing",
	"in-progress",
	"completed",
	"failed",
	"no-answer",
] as const

export const ENGINEER_CALL_OUTCOMES = [
	"completed",
	"failed",
	"no-answer",
] as const

export const ENGINEER_CALL_ENTITY_NAME = "Engineer call"

export const ENGINEER_CALL_ADAPTER = "ENGINEER_CALL_ADAPTER"

export const ENGINEER_CALL_FALLBACK_ADAPTER = "ENGINEER_CALL_FALLBACK_ADAPTER"

export const HAPPYROBOT_INTEGRATION_NAME = "HappyRobot"

export const HAPPYROBOT_CALLBACK_PATH = "api/webhooks/happyrobot"

export const HAPPYROBOT_DEFAULT_SEVERITY = "high"

export const HAPPYROBOT_DEFAULT_AFFECTED_SERVICES = "Casa Pepe platform"
