import { nearbyRegions } from "@incidents/helpers/geography.helper"
import { selectBackupResource } from "@incidents/helpers/incident-state.helper"
import {
	createImpactedIncident,
	createLastDegradedIncident,
} from "@root/testing/incident.fixture"
import { METEORITE_SCENARIO } from "@scenarios/constants/meteorite-scenario.constant"
import { METEORITE_SCENARIO_ES } from "@scenarios/constants/meteorite-scenario.es.constant"

describe("meteorite gulf geography", () => {
	it("places the impact in Dubai and orders backups Oman then Bahrain then Riyadh", () => {
		expect(METEORITE_SCENARIO.region).toBe("me-central-1")
		expect(METEORITE_SCENARIO.backupRegion).toBe("muscat-lz")
		expect(
			METEORITE_SCENARIO.resources.map((resource) => resource.region),
		).toEqual(["muscat-lz", "me-south-1", "riyadh"])
		expect(METEORITE_SCENARIO.customers).toHaveLength(6)
		expect(
			METEORITE_SCENARIO_ES.customers.map((customer) => customer.logo),
		).toEqual(METEORITE_SCENARIO.customers.map((customer) => customer.logo))

		const nearby = nearbyRegions(createImpactedIncident(4))
		expect(nearby.map((region) => region.region)).toEqual([
			"muscat-lz",
			"me-south-1",
			"riyadh",
		])
		expect(nearby[0].distanceKm).toBeLessThan(nearby[1].distanceKm)
		expect(nearby[1].distanceKm).toBeLessThan(nearby[2].distanceKm)
	})

	it("selects Bahrain when Oman no longer has enough remaining capacity", () => {
		const selected = selectBackupResource(createImpactedIncident(1))
		expect(selected.identifier).toBe("backup-bahrain")
		expect(selected.region).toBe("me-south-1")
	})

	it("keeps the committed region while it can still cover the next recovery", () => {
		const incident = createImpactedIncident(1)
		const selected = selectBackupResource({
			...incident,
			resources: incident.resources.map((resource) =>
				resource.identifier === "backup-bahrain"
					? { ...resource, allocatedCapacity: 3 }
					: resource,
			),
		})
		expect(selected.identifier).toBe("backup-bahrain")
	})

	it("fails over from a full committed region to the next region that fits", () => {
		const incident = createImpactedIncident(1)
		const selected = selectBackupResource({
			...incident,
			resources: incident.resources.map((resource) =>
				resource.identifier === "backup-bahrain"
					? { ...resource, allocatedCapacity: 12 }
					: resource,
			),
		})
		expect(selected.identifier).toBe("backup-riyadh")
	})

	it("selects Bahrain when Oman is fully allocated", () => {
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
		expect(selected.identifier).toBe("backup-bahrain")
	})

	it("selects Bahrain for the last degraded leftover when Oman is full", () => {
		const selected = selectBackupResource(createLastDegradedIncident())
		expect(selected.identifier).toBe("backup-bahrain")
		expect(selected.region).toBe("me-south-1")
		expect(selected.totalCapacity - selected.allocatedCapacity).toBe(4)
	})
})
