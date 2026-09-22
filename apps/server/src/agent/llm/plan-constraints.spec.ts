import { planConstraints } from "@agent/llm/plan-constraints"
import { PlanBuildInput } from "@agent/types/agent.type"
import { createImpactedIncident } from "@root/testing/incident.fixture"

function input(totalCapacity = 4): PlanBuildInput {
	return {
		capacityAssumption: null,
		incident: createImpactedIncident(totalCapacity),
	} as PlanBuildInput
}

describe("model-visible planning constraints", () => {
	it("uses the runtime-selected region instead of pooling a larger backup", () => {
		const built = input()
		const constraints = planConstraints(built)
		expect(constraints.selectedResource).toMatchObject({
			allocatedCapacity: 0,
			assumedCapacity: 4,
			maximumNewRecoveryUnits: 4,
			resourceIdentifier: built.incident.resources[0].identifier,
		})
		const costs = constraints.serviceRequirements.filter((s) =>
			["orders-database", "route-assignment"].includes(
				s.serviceIdentifier,
			),
		)
		expect(
			costs.reduce((sum, s) => sum + s.recoveryCapacityUnits, 0),
		).toBeGreaterThan(constraints.selectedResource?.maximumNewRecoveryUnits)
	})
	it("subtracts committed work once and honors a learned capacity limit", () => {
		const original = input(12)
		const built: PlanBuildInput = {
			...original,
			capacityAssumption: {
				assumedCapacity: 8,
				resourceIdentifier: original.incident.resources[0].identifier,
			} as PlanBuildInput["capacityAssumption"],
			incident: {
				...original.incident,
				resources: [
					{
						...original.incident.resources[0],
						allocatedCapacity: 3,
						confirmed: false,
					},
				],
			},
		}
		expect(planConstraints(built).selectedResource).toMatchObject({
			allocatedCapacity: 3,
			assumedCapacity: 8,
			maximumNewRecoveryUnits: 5,
		})
	})
	it("advances to the next runtime-selected backup when the first fills", () => {
		const original = input()
		const built: PlanBuildInput = {
			...original,
			incident: {
				...original.incident,
				resources: original.incident.resources.map((resource, index) =>
					index === 0
						? {
								...resource,
								allocatedCapacity: resource.totalCapacity,
							}
						: resource,
				),
			},
		}
		expect(
			planConstraints(built).selectedResource?.resourceIdentifier,
		).toBe(built.incident.resources[1].identifier)
	})
	it("requires prerequisite verification IDs and preserves mandatory approval", () => {
		const built = input()
		const requirements = planConstraints(built).serviceRequirements
		expect(
			requirements.find(
				(s) => s.serviceIdentifier === "route-assignment",
			),
		).toMatchObject({
			executeDependsOn: ["stp_orders-database_verify"],
			verifyDependsOn: ["stp_route-assignment_execute"],
		})
		expect(
			requirements.find((s) => s.serviceIdentifier === "orders-database")
				?.requiresApproval,
		).toBe(
			built.incident.services.find(
				(s) => s.identifier === "orders-database",
			)?.recoveryRequiresApproval,
		)
		const healthy: PlanBuildInput = {
			...built,
			incident: {
				...built.incident,
				services: built.incident.services.map((s) =>
					s.identifier === "orders-database"
						? { ...s, status: "healthy" }
						: s,
				),
			},
		}
		expect(
			planConstraints(healthy).serviceRequirements.find(
				(s) => s.serviceIdentifier === "route-assignment",
			)?.executeDependsOn,
		).toEqual([])
	})
})
