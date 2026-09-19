import { isBefore } from "@common/helpers/clock.helper"
import { IncidentEntity } from "@incidents/entities/incident.entity"
import {
	IncidentSnapshot,
	IncidentStatus,
	ResourceState,
	RunSummary,
	ServiceState,
} from "@incidents/types/incident.type"
import { BUSINESS_IMPACT_WEIGHTS } from "@scenarios/constants/scenario.constant"
import {
	ScenarioDefinition,
	ServiceHealthStatus,
} from "@scenarios/types/scenario.type"
import { SimulationState } from "@scenarios/types/simulation.type"

export function buildBaselineServices(
	scenario: ScenarioDefinition,
	timestamp: string,
): ServiceState[] {
	return scenario.services.map((service) => ({
		businessImpact: service.businessImpact,
		dependencies: service.dependencies,
		description: service.description,
		identifier: service.identifier,
		impactDescription: service.impactDescription,
		lastChangedAt: timestamp,
		name: service.name,
		recoveryActionDescription: service.recoveryAction.description,
		recoveryActionKind: service.recoveryAction.kind,
		recoveryCapacityUnits: service.recoveryCapacityUnits,
		recoveryConsequences: service.recoveryAction.consequences,
		recoveryRequiresApproval: service.recoveryAction.requiresApproval,
		simulatedOutcome: service.simulatedRecovery.outcome,
		simulatedOutcomeDetail: service.simulatedRecovery.detail,
		status: "healthy",
		statusReason: "Operating normally",
	}))
}

export function buildBaselineResources(
	scenario: ScenarioDefinition,
	timestamp: string,
): ResourceState[] {
	return scenario.resources.map((resource) => ({
		allocatedCapacity: 0,
		confirmed: false,
		identifier: resource.identifier,
		lastChangedAt: timestamp,
		name: resource.name,
		note: resource.note,
		region: resource.region,
		totalCapacity: resource.reportedCapacity,
		unit: resource.unit,
	}))
}

export function applyImpact(
	services: ReadonlyArray<ServiceState>,
	scenario: ScenarioDefinition,
	timestamp: string,
): ServiceState[] {
	const impactByService = new Map(
		scenario.services.map((service) => [service.identifier, service]),
	)
	return services.map((service) => {
		const definition = impactByService.get(service.identifier)
		if (!definition) {
			return service
		}
		return {
			...service,
			lastChangedAt: timestamp,
			status: definition.statusAfterImpact,
			statusReason: definition.impactReason,
		}
	})
}

export function updateServiceStatus(
	services: ReadonlyArray<ServiceState>,
	serviceIdentifier: string,
	status: ServiceHealthStatus,
	reason: string,
	timestamp: string,
): ServiceState[] {
	return services.map((service) => {
		if (service.identifier !== serviceIdentifier) {
			return service
		}
		return {
			...service,
			lastChangedAt: timestamp,
			status,
			statusReason: reason,
		}
	})
}

export function propagateDependencyHealth(
	services: ReadonlyArray<ServiceState>,
	timestamp: string,
): ServiceState[] {
	const byIdentifier = new Map(
		services.map((service) => [service.identifier, service]),
	)
	return services.map((service) => {
		if (service.status !== "degraded") {
			return service
		}
		const dependenciesHealthy = service.dependencies.every(
			(dependencyIdentifier) => {
				const dependency = byIdentifier.get(dependencyIdentifier)
				if (!dependency) {
					return true
				}
				return dependency.status === "healthy"
			},
		)
		if (dependenciesHealthy) {
			return {
				...service,
				lastChangedAt: timestamp,
				status: "healthy",
				statusReason: "Upstream dependencies recovered",
			}
		}
		return service
	})
}

export function deriveIncidentStatus(
	current: IncidentStatus,
	services: ReadonlyArray<ServiceState>,
	impactedAt: string,
): IncidentStatus {
	if (current === "normal" || current === "reset") {
		return current
	}
	const unhealthy = services.filter((service) => service.status !== "healthy")
	if (unhealthy.length === 0) {
		return "recovered"
	}
	const recoveredAfterImpact = services.filter(
		(service) =>
			service.status === "healthy" &&
			isBefore(impactedAt, service.lastChangedAt),
	)
	if (recoveredAfterImpact.length > 0) {
		return "partially-recovered"
	}
	return current
}

export function remainingCapacity(resource: ResourceState): number {
	return resource.totalCapacity - resource.allocatedCapacity
}

export function nextRecoveryUnits(incident: {
	readonly services: ReadonlyArray<ServiceState>
}): number {
	const remaining = incident.services.filter(
		(service) =>
			service.status !== "healthy" && service.status !== "recovering",
	)
	if (!remaining.length) {
		return 1
	}
	return [...remaining].sort(
		(left, right) =>
			BUSINESS_IMPACT_WEIGHTS[right.businessImpact] -
			BUSINESS_IMPACT_WEIGHTS[left.businessImpact],
	)[0].recoveryCapacityUnits
}

export function selectBackupResource(
	incident: {
		readonly resources: ReadonlyArray<ResourceState>
		readonly services: ReadonlyArray<ServiceState>
	},
	remainingOf: (resource: ResourceState) => number = remainingCapacity,
): ResourceState {
	const needed = nextRecoveryUnits(incident)
	const ordered = incident.resources
	const committed = ordered.find((resource) => resource.allocatedCapacity > 0)
	if (committed) {
		return committed
	}
	const fitting = ordered.find((resource) => remainingOf(resource) >= needed)
	if (fitting) {
		return fitting
	}
	return ordered.find((resource) => remainingOf(resource) > 0) ?? ordered[0]
}

export function toIncidentSnapshot(entity: IncidentEntity): IncidentSnapshot {
	return {
		active: entity.active,
		agentCycles: entity.agentCycles,
		backupRegion: entity.backupRegion,
		businessImpactSummary: entity.businessImpactSummary,
		company: entity.company,
		createdAt: entity.createdAt,
		customers: entity.customers,
		facts: entity.facts,
		harnessEvents: entity.harnessEvents,
		identifier: entity.identifier,
		impactedAt: entity.impactedAt,
		narrative: entity.narrative,
		region: entity.region,
		resolvedAt: entity.resolvedAt,
		resources: entity.resources,
		runIdentifier: entity.runIdentifier,
		runKind: entity.runKind,
		scenarioIdentifier: entity.scenarioIdentifier,
		services: entity.services,
		simulation:
			entity.simulation ??
			({
				automaticEvents: true,
				difficulty: "medium",
				disruptionDraws: 0,
				elapsedMinutes: 0,
				generatedDisruptions: 0,
				initialDraws: 0,
				maxConcurrentDisruptions: 2,
				mode: "manual",
				paused: true,
				recoveryDraws: 0,
				seed: 42,
			} satisfies SimulationState),
		sourceRunIdentifier: entity.sourceRunIdentifier,
		startedAt: entity.startedAt,
		status: entity.status,
		title: entity.title,
		topology: { links: entity.topologyLinks, nodes: entity.topologyNodes },
		updatedAt: entity.updatedAt,
	}
}

export function toRunSummary(entity: IncidentEntity): RunSummary {
	return {
		active: entity.active,
		agentCycles: entity.agentCycles,
		incidentIdentifier: entity.identifier,
		runIdentifier: entity.runIdentifier,
		runKind: entity.runKind,
		sourceRunIdentifier: entity.sourceRunIdentifier,
		startedAt: entity.startedAt,
		status: entity.status,
	}
}
