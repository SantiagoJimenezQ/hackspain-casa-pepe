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
