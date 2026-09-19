import { BusinessImpactLevel } from "@scenarios/types/scenario.type"

export const CUSTOMER_IMPACT_WEIGHTS: Readonly<
	Record<BusinessImpactLevel, number>
> = {
	critical: 40,
	high: 25,
	low: 5,
	medium: 12,
}

export const CUSTOMER_BLOCKED_DEPENDENT_WEIGHT = 8

export const CUSTOMER_UNHEALTHY_SERVICE_WEIGHT = 6

export const CUSTOMER_USERS_PER_POINT = 500

export const CUSTOMER_USERS_MAXIMUM_POINTS = 30

export const CUSTOMER_MINUTES_PER_POINT = 5

export const CUSTOMER_MINUTES_MAXIMUM_POINTS = 20

export const CUSTOMER_RECOVERY_IN_PROGRESS_PENALTY = 10

export const CUSTOMER_PRIORITY_MODES = ["deterministic", "llm"] as const

export const CUSTOMER_RANKING_TOOL_NAME = "rank_customers"

export const CUSTOMER_RANKING_MAXIMUM_OUTPUT_TOKENS = 1500

export const CUSTOMER_RANKING_FAILURE_CACHE_MILLISECONDS = 30000

export const CUSTOMER_RANKING_SYSTEM_PROMPT = `You are the incident coordinator of a hosting provider. Several customer companies run services on a region that is down.
You receive the current state of every customer (services down or degraded, business impact, users, dependencies they block, recovery progress) together with a deterministic baseline ranking and the criteria behind it.
Decide the final recovery order. Keep the baseline unless you see a concrete reason to move a customer, such as a dependency that unblocks several customers at once, a recovery already running, or a disproportionate user impact.
Call the ${CUSTOMER_RANKING_TOOL_NAME} tool exactly once with every customer identifier, a unique rank starting at 1, and one short sentence per customer justifying its position. Never invent customers or services.`

export const CUSTOMER_STATUSES = [
	"down",
	"degraded",
	"recovering",
	"healthy",
] as const

export const CUSTOMER_PRIORITY_CRITERIA = [
	{
		description:
			"Highest business impact among the customer's unavailable services (critical 40, high 25, medium 12, low 5)",
		key: "business-impact",
	},
	{
		description: `Services of any customer blocked because they depend on this customer's unavailable services (${CUSTOMER_BLOCKED_DEPENDENT_WEIGHT} points each)`,
		key: "blocked-dependents",
	},
	{
		description: `Number of services down or degraded (${CUSTOMER_UNHEALTHY_SERVICE_WEIGHT} points each)`,
		key: "unhealthy-services",
	},
	{
		description: `Affected users (1 point per ${CUSTOMER_USERS_PER_POINT} users, maximum ${CUSTOMER_USERS_MAXIMUM_POINTS})`,
		key: "affected-users",
	},
	{
		description: `Minutes since the oldest outage (1 point per ${CUSTOMER_MINUTES_PER_POINT} minutes, maximum ${CUSTOMER_MINUTES_MAXIMUM_POINTS})`,
		key: "time-down",
	},
	{
		description: `Recovery already requested or running for a service (${CUSTOMER_RECOVERY_IN_PROGRESS_PENALTY} points less each)`,
		key: "recovery-in-progress",
	},
] as const
