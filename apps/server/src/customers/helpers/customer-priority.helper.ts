import {
	CUSTOMER_BLOCKED_DEPENDENT_WEIGHT,
	CUSTOMER_IMPACT_WEIGHTS,
	CUSTOMER_MINUTES_MAXIMUM_POINTS,
	CUSTOMER_MINUTES_PER_POINT,
	CUSTOMER_PRIORITY_CRITERIA,
	CUSTOMER_PRIORITY_ORDER,
	CUSTOMER_RECOVERY_IN_PROGRESS_PENALTY,
	CUSTOMER_SECTOR_PRIORITY,
	CUSTOMER_SECTOR_UNRANKED,
	CUSTOMER_UNHEALTHY_SERVICE_WEIGHT,
	CUSTOMER_USERS_MAXIMUM_POINTS,
	CUSTOMER_USERS_PER_POINT,
} from "@customers/constants/customer-priority.constant"
import {
	CustomerPriority,
	CustomerPriorityReport,
	CustomerServiceStatus,
	CustomerStatus,
} from "@customers/types/customer-priority.type"
import { IncidentSnapshot, ServiceState } from "@incidents/types/incident.type"
import { RecoveryActionRecord } from "@recovery/types/recovery.type"
import {
	BusinessImpactLevel,
	ScenarioCustomer,
} from "@scenarios/types/scenario.type"

const IMPACT_ORDER: ReadonlyArray<BusinessImpactLevel> = [
	"critical",
	"high",
	"medium",
	"low",
]

/**
 * Where a company sits in the fixed head of the order. Everything the order does not name shares
 * the place right behind it, and falls back to sector and score.
 */
export function companyRank(identifier: string): number {
	const place = CUSTOMER_PRIORITY_ORDER.indexOf(identifier)
	if (place === -1) {
		return CUSTOMER_PRIORITY_ORDER.length
	}
	return place
}

/**
 * The tier a sector belongs to. Scenarios name their sectors in their own language and with
 * their own accents, so the name is compared stripped of both.
 */
export function sectorRank(sector: string): number {
	const normalized = sector
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.trim()
		.toLowerCase()
	const tier = CUSTOMER_SECTOR_PRIORITY.findIndex((names) =>
		names.includes(normalized),
	)
	if (tier === -1) {
		return CUSTOMER_SECTOR_UNRANKED
	}
	return tier
}

const UNHEALTHY_STATUSES: ReadonlySet<string> = new Set([
	"down",
	"degraded",
	"recovering",
])

const IN_PROGRESS_STATUSES: ReadonlySet<string> = new Set([
	"requested",
	"running",
])

function isUnhealthy(service: ServiceState): boolean {
	return UNHEALTHY_STATUSES.has(service.status)
}

function latestActionFor(
	actions: ReadonlyArray<RecoveryActionRecord>,
	serviceIdentifier: string,
): RecoveryActionRecord | null {
	const matching = actions.filter(
		(action) => action.serviceIdentifier === serviceIdentifier,
	)
	if (!matching.length) {
		return null
	}
	return matching[matching.length - 1]
}

function toServiceStatus(
	service: ServiceState,
	actions: ReadonlyArray<RecoveryActionRecord>,
): CustomerServiceStatus {
	const action = latestActionFor(actions, service.identifier)
	return {
		businessImpact: service.businessImpact,
		identifier: service.identifier,
		lastChangedAt: service.lastChangedAt,
		name: service.name,
		recoveryActionDescription: service.recoveryActionDescription,
		recoveryCapacityUnits: service.recoveryCapacityUnits,
		recoveryDetail: action?.result?.detail ?? "",
		recoveryRequiresApproval: service.recoveryRequiresApproval,
		recoveryStatus: action ? action.status : "not-started",
		status: service.status,
		statusReason: service.statusReason,
	}
}

function highestImpactOf(
	services: ReadonlyArray<ServiceState>,
): BusinessImpactLevel | "none" {
	const levels = services.map((service) => service.businessImpact)
	const found = IMPACT_ORDER.find((level) => levels.includes(level))
	return found ?? "none"
}

function minutesBetween(fromISO: string, toISO: string): number {
	const from = new Date(fromISO).getTime()
	const to = new Date(toISO).getTime()
	if (Number.isNaN(from) || Number.isNaN(to) || to <= from) {
		return 0
	}
	return Math.floor((to - from) / 60000)
}

function statusOf(
	unhealthy: ReadonlyArray<ServiceState>,
	recoveryInProgress: number,
): CustomerStatus {
	if (!unhealthy.length) {
		return "healthy"
	}
	if (
		recoveryInProgress > 0 ||
		unhealthy.some((service) => service.status === "recovering")
	) {
		return "recovering"
	}
	if (unhealthy.some((service) => service.status === "down")) {
		return "down"
	}
	return "degraded"
}

function reasonFor(
	customer: ScenarioCustomer,
	status: CustomerStatus,
	highestImpact: BusinessImpactLevel | "none",
	unhealthyCount: number,
	blockedDependents: ReadonlyArray<string>,
	recoveryInProgress: number,
): string {
	switch (status) {
		case "healthy":
			return `${customer.name}: every service is operating normally`
		case "recovering":
			return `${customer.name}: ${recoveryInProgress} recovery ${recoveryInProgress === 1 ? "action" : "actions"} in progress for ${unhealthyCount} affected ${unhealthyCount === 1 ? "service" : "services"}`
		case "down":
		case "degraded": {
			const blocked = blockedDependents.length
				? `, blocking ${blockedDependents.join(", ")}`
				: ""
			return `${customer.name}: ${unhealthyCount} ${unhealthyCount === 1 ? "service" : "services"} unavailable with ${highestImpact} impact for ${customer.users} users${blocked}`
		}
	}
}

function prioritizeCustomer(
	customer: ScenarioCustomer,
	incident: IncidentSnapshot,
	actions: ReadonlyArray<RecoveryActionRecord>,
	now: string,
): Omit<CustomerPriority, "rank"> {
	const services = incident.services.filter((service) =>
		customer.serviceIdentifiers.includes(service.identifier),
	)
	const unhealthy = services.filter(isUnhealthy)
	const unhealthyIdentifiers = new Set(
		unhealthy.map((service) => service.identifier),
	)
	const blockedDependentServices = incident.services
		.filter(
			(service) =>
				!unhealthyIdentifiers.has(service.identifier) &&
				service.dependencies.some((dependency) =>
					unhealthyIdentifiers.has(dependency),
				),
		)
		.map((service) => service.identifier)
	const customerActions = actions.filter((action) =>
		customer.serviceIdentifiers.includes(action.serviceIdentifier),
	)
	const recoveryInProgress = customerActions.filter((action) =>
		IN_PROGRESS_STATUSES.has(action.status),
	).length
	const recoveryCompleted = customerActions.filter(
		(action) => action.status === "succeeded",
	).length
	const recoveryFailed = customerActions.filter(
		(action) => action.status === "failed" || action.status === "partial",
	).length
	const highestImpact = highestImpactOf(unhealthy)
	const minutesDown = unhealthy.reduce(
		(maximum, service) =>
			Math.max(maximum, minutesBetween(service.lastChangedAt, now)),
		0,
	)
	const breakdown = {
		affectedUsers: unhealthy.length
			? Math.min(
					Math.floor(customer.users / CUSTOMER_USERS_PER_POINT),
					CUSTOMER_USERS_MAXIMUM_POINTS,
				)
			: 0,
		blockedDependents:
			blockedDependentServices.length * CUSTOMER_BLOCKED_DEPENDENT_WEIGHT,
		businessImpact:
			highestImpact === "none"
				? 0
				: CUSTOMER_IMPACT_WEIGHTS[highestImpact],
		recoveryInProgress:
			-recoveryInProgress * CUSTOMER_RECOVERY_IN_PROGRESS_PENALTY,
		timeDown: Math.min(
			Math.floor(minutesDown / CUSTOMER_MINUTES_PER_POINT),
			CUSTOMER_MINUTES_MAXIMUM_POINTS,
		),
		unhealthyServices: unhealthy.length * CUSTOMER_UNHEALTHY_SERVICE_WEIGHT,
	}
	const score = Math.max(
		0,
		breakdown.businessImpact +
			breakdown.blockedDependents +
			breakdown.unhealthyServices +
			breakdown.affectedUsers +
			breakdown.timeDown +
			breakdown.recoveryInProgress,
	)
	const status = statusOf(unhealthy, recoveryInProgress)
	const nextService = [...unhealthy].sort(
		(left, right) =>
			IMPACT_ORDER.indexOf(left.businessImpact) -
			IMPACT_ORDER.indexOf(right.businessImpact),
	)[0]
	const nextAction = nextService
		? `${nextService.recoveryActionDescription} (${nextService.recoveryCapacityUnits} units${nextService.recoveryRequiresApproval ? ", approval required" : ""})`
		: "No action needed"
	return {
		blockedDependentServices,
		breakdown,
		capacityUnitsToRecover: unhealthy.reduce(
			(total, service) => total + service.recoveryCapacityUnits,
			0,
		),
		highestImpact,
		identifier: customer.identifier,
		justification: "",
		minutesDown,
		name: customer.name,
		nextAction,
		reason: reasonFor(
			customer,
			status,
			highestImpact,
			unhealthy.length,
			blockedDependentServices,
			recoveryInProgress,
		),
		recoveryCompleted,
		recoveryFailed,
		recoveryInProgress,
		score,
		sector: customer.sector,
		services: services.map((service) => toServiceStatus(service, actions)),
		servicesDegraded: services.filter(
			(service) => service.status === "degraded",
		).length,
		servicesDown: services.filter((service) => service.status === "down")
			.length,
		servicesHealthy: services.filter(
			(service) => service.status === "healthy",
		).length,
		servicesRecovering: services.filter(
			(service) => service.status === "recovering",
		).length,
		shortName: customer.shortName,
		status,
		users: customer.users,
	}
}

export function prioritizeCustomers(
	incident: IncidentSnapshot,
	actions: ReadonlyArray<RecoveryActionRecord>,
	now: string,
): CustomerPriorityReport {
	const ranked = incident.customers
		.map((customer) => prioritizeCustomer(customer, incident, actions, now))
		.sort(
			(left, right) =>
				companyRank(left.identifier) - companyRank(right.identifier) ||
				sectorRank(left.sector) - sectorRank(right.sector) ||
				right.score - left.score ||
				right.users - left.users ||
				left.name.localeCompare(right.name),
		)
		.map((customer, index) => ({ ...customer, rank: index + 1 }))
	return {
		criteria: CUSTOMER_PRIORITY_CRITERIA.map((criterion) => ({
			description: criterion.description,
			key: criterion.key,
		})),
		customers: ranked,
		fallbackReason: "",
		generatedAt: now,
		incidentIdentifier: incident.identifier,
		model: "",
		runIdentifier: incident.runIdentifier,
		source: "deterministic",
	}
}
