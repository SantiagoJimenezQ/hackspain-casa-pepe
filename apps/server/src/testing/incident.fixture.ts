import {
	applyImpact,
	buildBaselineResources,
	buildBaselineServices,
} from "@incidents/helpers/incident-state.helper"
import { IncidentSnapshot } from "@incidents/types/incident.type"
import { METEORITE_SCENARIO } from "@scenarios/constants/meteorite-scenario.constant"
import { SimulationState } from "@scenarios/types/simulation.type"

export const FIXTURE_TIMESTAMP = "2026-09-18T10:00:00.000Z"

export const FIXTURE_IMPACT_TIMESTAMP = "2026-09-18T10:05:00.000Z"

export function createImpactedIncident(
	totalCapacity: number,
): IncidentSnapshot {
	const baseline = buildBaselineServices(
		METEORITE_SCENARIO,
		FIXTURE_TIMESTAMP,
	)
	const resources = buildBaselineResources(
		METEORITE_SCENARIO,
		FIXTURE_TIMESTAMP,
	).map((resource, index) =>
		index === 0 ? { ...resource, totalCapacity } : resource,
	)
	return {
		active: true,
		agentCycles: 0,
		backupRegion: METEORITE_SCENARIO.backupRegion,
		businessImpactSummary: METEORITE_SCENARIO.businessImpactSummary,
		company: METEORITE_SCENARIO.company,
		createdAt: FIXTURE_TIMESTAMP,
		customers: METEORITE_SCENARIO.customers,
		facts: METEORITE_SCENARIO.initialFacts.map((fact, index) => ({
			identifier: `fact_${index}`,
			recordedAt: FIXTURE_IMPACT_TIMESTAMP,
			source: fact.source,
			statement: fact.statement,
			status: fact.confirmed ? "confirmed" : "pending",
		})),
		harnessEvents: [],
		identifier: "inc_fixture",
		impactedAt: FIXTURE_IMPACT_TIMESTAMP,
		narrative: METEORITE_SCENARIO.narrative,
		region: METEORITE_SCENARIO.region,
		resolvedAt: "",
		resources,
		runIdentifier: "run_fixture",
		runKind: "live",
		scenarioIdentifier: METEORITE_SCENARIO.identifier,
		services: applyImpact(
			baseline,
			METEORITE_SCENARIO,
			FIXTURE_IMPACT_TIMESTAMP,
		),
		simulation: {
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
		} satisfies SimulationState,
		sourceRunIdentifier: "",
		startedAt: FIXTURE_TIMESTAMP,
		status: "detected",
		title: METEORITE_SCENARIO.title,
		topology: METEORITE_SCENARIO.topology,
		updatedAt: FIXTURE_IMPACT_TIMESTAMP,
	}
}

export function createLastDegradedIncident(): IncidentSnapshot {
	const incident = createImpactedIncident(4)
	return {
		...incident,
		resources: incident.resources.map((resource) => {
			if (resource.identifier === "backup-oman") {
				return { ...resource, allocatedCapacity: 4 }
			}
			if (resource.identifier === "backup-bahrain") {
				return { ...resource, allocatedCapacity: 8 }
			}
			return resource
		}),
		services: incident.services.map((service) =>
			service.identifier === "customer-notifications"
				? service
				: { ...service, status: "healthy" as const },
		),
		status: "partially-recovered",
	}
}
