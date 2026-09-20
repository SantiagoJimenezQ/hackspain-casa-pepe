import { ConcurrentPlanVersionException } from "@common/exceptions/domain.exception"
import { PlanEntity } from "@plans/entities/plan.entity"
import { CreatePlanInput } from "@plans/types/plan.type"
import { QueryFailedError } from "typeorm"
import { PlansService } from "./plans.service"

function input(): CreatePlanInput {
	return {
		assumptions: [],
		capacity: {
			assumedCapacity: 4,
			confirmed: true,
			plannedUnits: 4,
			postponedUnits: 0,
			remainingUnits: 0,
			resourceIdentifier: "backup-oman",
			totalCapacity: 4,
		},
		changesFromPrevious: [],
		decisionIdentifier: "dec_1",
		incidentIdentifier: "inc_1",
		previous: null,
		priorities: [],
		reason: "Recover the root dependency",
		runIdentifier: "run_1",
		steps: [],
		summary: "Fail over the orders database",
		triggeredBy: "Impact detected",
	} as unknown as CreatePlanInput
}

function duplicateKeyError(): QueryFailedError {
	const error = new QueryFailedError("insert", [], new Error("duplicate key"))
	Object.assign(error, { code: "23505" })
	return error
}

describe("PlansService version races", () => {
	it("reports a lost race as a stale plan instead of a database failure", async () => {
		const repository = {
			create: (values: Partial<PlanEntity>) =>
				Object.assign(new PlanEntity(), values),
			insert: jest.fn().mockRejectedValue(duplicateKeyError()),
		}
		const service = new PlansService(
			repository as never,
			{
				record: jest.fn(),
			} as never,
		)

		await expect(service.createVersion(input())).rejects.toBeInstanceOf(
			ConcurrentPlanVersionException,
		)
	})

	it("lets any other database failure through untouched", async () => {
		const failure = new QueryFailedError("insert", [], new Error("boom"))
		const repository = {
			create: (values: Partial<PlanEntity>) =>
				Object.assign(new PlanEntity(), values),
			insert: jest.fn().mockRejectedValue(failure),
		}
		const service = new PlansService(
			repository as never,
			{
				record: jest.fn(),
			} as never,
		)

		await expect(service.createVersion(input())).rejects.toBe(failure)
	})
})
