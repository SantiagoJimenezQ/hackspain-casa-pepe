import { IncidentEntity } from "@incidents/entities/incident.entity"
import { toIncidentSnapshot } from "@incidents/helpers/incident-state.helper"
import { meteoriteCustomers } from "./meteorite-map.constant"

describe("fictional customer identities", () => {
	it("uses the same identities and dependencies in both scenario languages", () => {
		const en = meteoriteCustomers("en")
		const es = meteoriteCustomers("es")
		expect(
			en.map(({ identifier, name, logo, serviceIdentifiers, users }) => ({
				identifier,
				logo,
				name,
				serviceIdentifiers,
				users,
			})),
		).toEqual(
			es.map(({ identifier, name, logo, serviceIdentifiers, users }) => ({
				identifier,
				logo,
				name,
				serviceIdentifiers,
				users,
			})),
		)
		expect(en.map(({ name }) => name)).toEqual([
			"HappyRobot",
			"Mova Energy",
			"Mirage Air",
			"Meridian Bank",
			"Dasharoo",
			"Clarity Health",
		])
	})

	it("resumes legacy customers with new display values without rewriting the stored record", () => {
		const legacy = {
			...meteoriteCustomers("es")[3],
			logo: "/logos/emirates-nbd.png",
			name: "Emirates NBD",
			shortName: "ENBD",
		}
		const entity = Object.assign(new IncidentEntity(), {
			customers: [legacy],
		})
		const snapshot = toIncidentSnapshot(entity)
		expect(snapshot.customers[0]).toEqual({
			...legacy,
			logo: "/logos/meridian-bank.svg",
			name: "Meridian Bank",
			shortName: "MB",
		})
		expect(entity.customers[0]).toBe(legacy)
		expect(legacy.name).toBe("Emirates NBD")
	})
})
