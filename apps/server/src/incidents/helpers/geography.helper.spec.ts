import { nearbyRegions } from "@incidents/helpers/geography.helper"
import { selectBackupResource } from "@incidents/helpers/incident-state.helper"
import { createImpactedIncident } from "@root/testing/incident.fixture"
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
})
