export const APPROVAL_STATUSES = [
	"pending",
	"approved",
	"rejected",
	"superseded",
	"expired",
] as const

export const APPROVAL_DECISIONS = ["approve", "reject"] as const

export const APPROVAL_ENTITY_NAME = "Approval"
