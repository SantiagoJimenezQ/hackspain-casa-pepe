import { prioritizeCustomers } from "@customers/helpers/customer-priority.helper"
import { RecoveryActionRecord } from "@recovery/types/recovery.type"
import {
	createImpactedIncident,
	FIXTURE_IMPACT_TIMESTAMP,
} from "@root/testing/incident.fixture"

const NOW = "2026-09-18T10:35:00.000Z"

function action(
	serviceIdentifier: string,
	status: RecoveryActionRecord["status"],
): RecoveryActionRecord {
	return {
		actionDescription: "Recover",
		actionKind: "failover-database",
		approvalIdentifier: "",
		capacityUnits: 4,
		finishedAt: "",
		identifier: `rec_${serviceIdentifier}`,
		incidentIdentifier: "inc_fixture",
		mode: "simulated",
		planStepIdentifier: "",
		providerReference: "",
		resourceIdentifier: "backup-compute",
		result: null,
		runIdentifier: "run_fixture",
		serviceIdentifier,
		startedAt: FIXTURE_IMPACT_TIMESTAMP,
		status,
		toolCallIdentifier: "",
	}
}

describe("prioritizeCustomers", () => {
	it("ranks the customer whose critical service blocks the rest first", () => {
		const incident = createImpactedIncident(7)
		const report = prioritizeCustomers(incident, [], NOW)

		expect(report.customers.length).toBe(incident.customers.length)
		expect(report.customers.map((customer) => customer.rank)).toEqual(
			report.customers.map((_, index) => index + 1),
		)
		const first = report.customers[0]
		expect(first.highestImpact).toBe("critical")
		expect(first.status).toBe("down")
		expect(first.blockedDependentServices.length).toBeGreaterThan(0)
		expect(first.score).toBe(
			first.breakdown.businessImpact +
				first.breakdown.blockedDependents +
				first.breakdown.unhealthyServices +
				first.breakdown.affectedUsers +
				first.breakdown.timeDown +
				first.breakdown.recoveryInProgress,
		)
		expect(first.minutesDown).toBe(30)
		for (let index = 1; index < report.customers.length; index += 1) {
			expect(report.customers[index - 1].score).toBeGreaterThanOrEqual(
				report.customers[index].score,
			)
		}
	})

	it("lowers the priority and marks the customer as recovering when a recovery is running", () => {
		const incident = createImpactedIncident(7)
		const baseline = prioritizeCustomers(incident, [], NOW)
		const target = baseline.customers[0]
		const running = target.services.find(
			(service) => service.status !== "healthy",
		)
		if (!running) {
			throw new Error(
				"Fixture has no unhealthy service for the first customer",
			)
		}
		const report = prioritizeCustomers(
			incident,
			[action(running.identifier, "running")],
			NOW,
		)
		const updated = report.customers.find(
			(customer) => customer.identifier === target.identifier,
		)
		if (!updated) {
			throw new Error("Customer missing from the report")
		}
		expect(updated.status).toBe("recovering")
		expect(updated.recoveryInProgress).toBe(1)
		expect(updated.score).toBe(Math.max(0, target.score - 10))
		expect(
			updated.services.find(
				(service) => service.identifier === running.identifier,
			)?.recoveryStatus,
		).toBe("running")
	})

	it("reports healthy customers with zero score and no action", () => {
		const incident = createImpactedIncident(7)
		const healed = {
			...incident,
			services: incident.services.map((service) => ({
				...service,
				status: "healthy" as const,
			})),
		}
		const report = prioritizeCustomers(healed, [], NOW)
		expect(
			report.customers.every((customer) => customer.status === "healthy"),
		).toBe(true)
		expect(report.customers.every((customer) => customer.score === 0)).toBe(
			true,
		)
		expect(report.customers[0].nextAction).toBe("No action needed")
	})
})
