export const AGENT_TRIGGER_KINDS = [
	"impact-detected",
	"conditions-changed",
	"tool-call-finished",
	"approval-decided",
	"timeouts-expired",
	"operator-requested",
	"follow-up",
] as const

export const AGENT_TICK_INTERVAL_MILLISECONDS = 5000

/**
 * Background work only follows runs touched within this window. Several people drive
 * independent runs and abandoned ones would otherwise keep consuming database connections
 * and model calls forever.
 */
export const RUN_IDLE_TIMEOUT_MILLISECONDS = 1800000

/**
 * How long an idle run with runnable work waits before the agent is nudged again. A cycle
 * can be lost to a restart or to a provider failure, and nothing else would resume it.
 */
export const AGENT_STALLED_RUN_MILLISECONDS = 30000

/** Step statuses the agent may still dispatch. */
export const RUNNABLE_STEP_STATUSES = ["proposed", "approved"] as const

export const DEPENDENT_SERVICE_SCORE_BONUS = 15

export const AGENT_ACTOR_NAME = "Casa Pepe agent"

export const STEP_IDENTIFIER_PREFIX = "stp"

export const CONTACT_ENGINEER_STEP_IDENTIFIER = "stp_contact-engineer"

export const SUPPORT_COMMUNICATION_STEP_IDENTIFIER = "stp_support-communication"

export const ENGINEER_FOLLOW_UP_STEP_IDENTIFIER = "stp_engineer-follow-up"

export const NEGATIVE_ANSWER_PATTERN =
	/not sure|unsure|cannot confirm|can't confirm|no estoy segur|no puedo confirmar|let me check|i will check|don't know|do not know/i

export const RECENT_ACTIVITY_LIMIT = 50
