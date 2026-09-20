import {
	applyImpact,
	buildBaselineServices,
	deriveIncidentStatus,
	nextRecoveryUnits,
	propagateDependencyHealth,
	selectBackupResource,
	updateServiceStatus,
} from "@incidents/helpers/incident-state.helper"
import {
	createImpactedIncident,
	createLastDegradedIncident,
} from "@root/testing/incident.fixture"
import { METEORITE_SCENARIO } from "@scenarios/constants/meteorite-scenario.constant"

const BASELINE_TIMESTAMP = "2026-09-18T10:00:00.000Z"
const IMPACT_TIMESTAMP = "2026-09-18T10:05:00.000Z"
const RECOVERY_TIMESTAMP = "2026-09-18T10:20:00.000Z"

describe("incident state helper", () => {
	it("starts with every service healthy and applies the scenario impact", () => {
		const baseline = buildBaselineServices(
			METEORITE_SCENARIO,
			BASELINE_TIMESTAMP,
		)
		expect(baseline.every((service) => service.status === "healthy")).toBe(
			true,
		)

		const impacted = applyImpact(
			baseline,
			METEORITE_SCENARIO,
			IMPACT_TIMESTAMP,
		)
		const statuses = Object.fromEntries(
			impacted.map((service) => [service.identifier, service.status]),
		)
		expect(statuses["orders-database"]).toBe("down")
		expect(statuses["driver-mobile-api"]).toBe("degraded")
	})

	it("heals degraded services automatically once their dependencies are healthy", () => {
		const impacted = applyImpact(
			buildBaselineServices(METEORITE_SCENARIO, BASELINE_TIMESTAMP),
			METEORITE_SCENARIO,
			IMPACT_TIMESTAMP,
		)
		const withRoutes = updateServiceStatus(
			impacted,
			"route-assignment",
			"healthy",
			"Redeployed",
			RECOVERY_TIMESTAMP,
		)

		const propagated = propagateDependencyHealth(
			withRoutes,
			RECOVERY_TIMESTAMP,
		)
		const driverAPI = propagated.find(
			(service) => service.identifier === "driver-mobile-api",
		)
		const notifications = propagated.find(
			(service) => service.identifier === "customer-notifications",
		)
		expect(driverAPI?.status).toBe("healthy")
		expect(notifications?.status).toBe("degraded")
	})

	it("derives the incident status from the services recovered after the impact", () => {
		const impacted = applyImpact(
			buildBaselineServices(METEORITE_SCENARIO, BASELINE_TIMESTAMP),
			METEORITE_SCENARIO,
			IMPACT_TIMESTAMP,
		)
		expect(
			deriveIncidentStatus("detected", impacted, IMPACT_TIMESTAMP),
		).toBe("detected")
		expect(
			deriveIncidentStatus("responding", impacted, IMPACT_TIMESTAMP),
		).toBe("responding")

		const partial = updateServiceStatus(
			impacted,
			"orders-database",
			"healthy",
			"Failover done",
			RECOVERY_TIMESTAMP,
		)
		expect(
			deriveIncidentStatus("responding", partial, IMPACT_TIMESTAMP),
		).toBe("partially-recovered")

		const recovered = partial.map((service) => ({
			...service,
			lastChangedAt: RECOVERY_TIMESTAMP,
			status: "healthy" as const,
		}))
		expect(
			deriveIncidentStatus(
				"partially-recovered",
				recovered,
				IMPACT_TIMESTAMP,
			),
		).toBe("recovered")
		expect(deriveIncidentStatus("normal", impacted, IMPACT_TIMESTAMP)).toBe(
			"normal",
		)
	})

	it("selects Bahrain after Oman is fully allocated to the recovered database", () => {
		const incident = createImpactedIncident(4)
		const selected = selectBackupResource({
			...incident,
			resources: incident.resources.map((resource, index) =>
				index === 0 ? { ...resource, allocatedCapacity: 4 } : resource,
			),
			services: incident.services.map((service) =>
				service.identifier === "orders-database"
					? { ...service, status: "healthy" }
					: service,
			),
		})
		expect(selected.identifier).toBe("backup-frankfurt")
	})

	it("sizes failover from a degraded leftover and leaves a full Oman", () => {
		const leftover = createLastDegradedIncident()
		expect(nextRecoveryUnits(leftover)).toBe(1)
		expect(selectBackupResource(leftover).identifier).toBe(
			"backup-frankfurt",
		)
	})

	it("does not stay on a committed region with zero remaining units", () => {
		const leftover = createLastDegradedIncident()
		const recovered = {
			...leftover,
			services: leftover.services.map((service) => ({
				...service,
				status: "healthy" as const,
			})),
		}
		expect(nextRecoveryUnits(recovered)).toBe(0)
		expect(selectBackupResource(recovered).identifier).toBe(
			"backup-frankfurt",
		)
	})
})
