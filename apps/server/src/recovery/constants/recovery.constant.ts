export const RECOVERY_ACTION_STATUSES = [
	"requested",
	"running",
	"succeeded",
	"partial",
	"failed",
] as const

export const RECOVERY_OUTCOMES = ["success", "partial", "failure"] as const

export const RECOVERY_ACTION_ENTITY_NAME = "Recovery action"

export const RECOVERY_ADAPTER = "RECOVERY_ADAPTER"

export const RECOVERY_INTEGRATION_NAME = "Recovery environment"

export const RECOVERY_CALLBACK_PATH = "api/webhooks/recovery"

export const RECOVERY_ERROR_CODES = {
	CAPACITY_INSUFFICIENT: "CAPACITY_INSUFFICIENT",
	ENVIRONMENT_UNREACHABLE: "ENVIRONMENT_UNREACHABLE",
	EXECUTION_FAILED: "EXECUTION_FAILED",
} as const
