export const APPLICATION_NAME = "Casa Pepe incident coordinator"

export const APPLICATION_DESCRIPTION =
	"Agentic incident coordinator for a simulated AWS regional outage. Exposes the incident state, the agent plan, approvals, tasks and tool executions, and notifies consumers through signed webhooks."

export const API_PREFIX = "api"

export const DOCUMENTATION_PATH = "documentation"

export const ENVIRONMENTS = [
	"local",
	"development",
	"production",
	"test",
] as const

export const HTTP_HEADERS = {
	AUTHORIZATION: "authorization",
	CORRELATION_IDENTIFIER: "x-correlation-identifier",
	HAPPYROBOT_SIGNATURE: "x-happyrobot-signature",
	RECOVERY_SIGNATURE: "x-recovery-signature",
	WEBHOOK_DELIVERY: "x-casa-pepe-delivery",
	WEBHOOK_EVENT: "x-casa-pepe-event",
	WEBHOOK_SIGNATURE: "x-casa-pepe-signature",
	WEBHOOK_TIMESTAMP: "x-casa-pepe-timestamp",
} as const
