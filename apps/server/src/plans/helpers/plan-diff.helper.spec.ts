import { buildPlanDraft } from "@agent/helpers/plan-builder.helper"
import { diffPlans } from "@plans/helpers/plan-diff.helper"
import { PlanRecord } from "@plans/types/plan.type"
import { createImpactedIncident } from "@root/testing/incident.fixture"
import { METEORITE_SCENARIO } from "@scenarios/constants/meteorite-scenario.constant"

function draftFor(totalCapacity: number) {
	return buildPlanDraft({
		briefing: METEORITE_SCENARIO.engineerBriefing,
		capacityAssumption: null,
		engineer: {
			name: "Marta Ruiz",
			phone: "+34600000000",
			role: "Platform on-call engineer",
		},
		failedServices: [],
		incident: createImpactedIncident(totalCapacity),
		language: "en",
		maximumStepAttempts: 2,
		previousPlan: null,
		rejectedServices: [],
		supportContact: METEORITE_SCENARIO.supportContact,
		triggeredBy: "test",
	})
}

describe("diffPlans", () => {
	it("explains what changed when the backup capacity shrinks", () => {
		const first = draftFor(12)
		const previous: PlanRecord = {
			assumptions: first.assumptions,
			capacity: first.capacity,
			changesFromPrevious: [],
			createdAt: "2026-09-18T10:06:00.000Z",
			decisionIdentifier: "dec_1",
			identifier: "plan_1",
			incidentIdentifier: "inc_fixture",
			previousPlanIdentifier: "",
			priorities: first.priorities,
			reason: "test",
			runIdentifier: "run_fixture",
			status: "active",
			steps: first.steps,
			summary: first.summary,
			triggeredBy: "test",
			updatedAt: "2026-09-18T10:06:00.000Z",
			version: 1,
		}
		const second = draftFor(7)

		const changes = diffPlans(previous, {
			priorities: second.priorities,
			steps: second.steps,
			totalCapacity: second.capacity.totalCapacity,
		})

		expect(
			changes.some((change) => change.kind === "capacity-changed"),
		).toBe(true)
		expect(
			changes
				.filter((change) => change.kind === "step-postponed")
				.map((change) => change.serviceIdentifier)
				.sort(),
		).toEqual(["events-stream", "package-tracking"])
		expect(
			changes.some(
				(change) =>
					change.kind === "step-added" &&
					change.stepIdentifier === "stp_support-communication",
			),
		).toBe(true)
		expect(
			changes.some(
				(change) =>
					change.kind === "step-removed" &&
					change.serviceIdentifier === "package-tracking",
			),
		).toBe(false)
	})
})
