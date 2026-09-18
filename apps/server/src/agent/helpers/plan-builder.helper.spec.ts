import {
	buildPlanDraft,
	stepIdentifierFor,
} from "@agent/helpers/plan-builder.helper"
import { PlanBuildInput } from "@agent/types/agent.type"
import { PlanRecord, PlanStep } from "@plans/types/plan.type"
import { createImpactedIncident } from "@root/testing/incident.fixture"
import { METEORITE_SCENARIO } from "@scenarios/constants/meteorite-scenario.constant"

function createInput(
	totalCapacity: number,
	previousPlan: PlanRecord | null = null,
): PlanBuildInput {
	return {
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
		previousPlan,
		rejectedServices: [],
		supportContact: METEORITE_SCENARIO.supportContact,
		triggeredBy: "test",
	}
}

function decisionOf(
	draft: ReturnType<typeof buildPlanDraft>,
	serviceIdentifier: string,
) {
	const priority = draft.priorities.find(
		(candidate) => candidate.serviceIdentifier === serviceIdentifier,
	)
	if (!priority) {
		throw new Error(`Missing priority for ${serviceIdentifier}`)
	}
	return priority
}

function stepOf(steps: ReadonlyArray<PlanStep>, identifier: string): PlanStep {
	const step = steps.find((candidate) => candidate.identifier === identifier)
	if (!step) {
		throw new Error(`Missing step ${identifier}`)
	}
	return step
}

function toPlanRecord(
	draft: ReturnType<typeof buildPlanDraft>,
	version: number,
): PlanRecord {
	return {
		assumptions: draft.assumptions,
		capacity: draft.capacity,
		changesFromPrevious: [],
		createdAt: "2026-09-18T10:06:00.000Z",
		decisionIdentifier: "dec_test",
		identifier: `plan_${version}`,
		incidentIdentifier: "inc_fixture",
		previousPlanIdentifier: "",
		priorities: draft.priorities,
		reason: draft.reason,
		runIdentifier: "run_fixture",
		status: "active",
		steps: draft.steps,
		summary: draft.summary,
		triggeredBy: draft.reason,
		updatedAt: "2026-09-18T10:06:00.000Z",
		version,
	}
}

describe("buildPlanDraft", () => {
	it("plans with the capacity confirmed in previous runs when the current report is unconfirmed", () => {
		const draft = buildPlanDraft({
			...createInput(12),
			capacityAssumption: {
				assumedCapacity: 7,
				observations: 2,
				reportedCapacity: 12,
			},
		})

		expect(draft.capacity.totalCapacity).toBe(12)
		expect(draft.capacity.assumedCapacity).toBe(7)
		expect(decisionOf(draft, "package-tracking").decision).toBe("postpone")
		expect(draft.assumptions).toHaveLength(1)
		expect(draft.assumptions[0]).toContain("2 previous runs")
	})

	it("ignores historical capacity once the harness confirms the real value", () => {
		const incident = createImpactedIncident(12)
		const confirmedIncident = {
			...incident,
			resources: incident.resources.map((resource) => ({
				...resource,
				confirmed: true,
			})),
		}
		const draft = buildPlanDraft({
			...createInput(12),
			capacityAssumption: {
				assumedCapacity: 7,
				observations: 1,
				reportedCapacity: 12,
			},
			incident: confirmedIncident,
		})

		expect(draft.capacity.assumedCapacity).toBe(12)
		expect(draft.assumptions).toHaveLength(0)
	})

	it("writes the plan in Spanish when the scenario is Spanish", () => {
		const draft = buildPlanDraft({ ...createInput(7), language: "es" })

		expect(draft.summary.startsWith("Recuperar")).toBe(true)
		expect(decisionOf(draft, "package-tracking").reason).toContain(
			"solo quedan",
		)
	})

	it("recovers every failing service when the reported capacity is enough", () => {
		const draft = buildPlanDraft(createInput(12))

		expect(decisionOf(draft, "orders-database").decision).toBe(
			"recover-now",
		)
		expect(decisionOf(draft, "route-assignment").decision).toBe(
			"recover-now",
		)
		expect(decisionOf(draft, "package-tracking").decision).toBe(
			"recover-now",
		)
		expect(decisionOf(draft, "events-stream").decision).toBe("recover-now")
		expect(decisionOf(draft, "driver-mobile-api").decision).toBe(
			"waiting-for-dependency",
		)
		expect(decisionOf(draft, "customer-notifications").decision).toBe(
			"waiting-for-dependency",
		)
		expect(draft.capacity.plannedUnits).toBe(12)
		expect(draft.capacity.remainingUnits).toBe(0)
	})

	it("ranks the database first because every product service depends on it", () => {
		const draft = buildPlanDraft(createInput(12))

		expect(draft.priorities[0].serviceIdentifier).toBe("orders-database")
		expect(draft.priorities[1].serviceIdentifier).toBe("route-assignment")
	})

	it("postpones lower priority services when the confirmed capacity is insufficient", () => {
		const draft = buildPlanDraft(createInput(7))

		expect(decisionOf(draft, "orders-database").decision).toBe(
			"recover-now",
		)
		expect(decisionOf(draft, "route-assignment").decision).toBe(
			"recover-now",
		)
		expect(decisionOf(draft, "package-tracking").decision).toBe("postpone")
		expect(decisionOf(draft, "events-stream").decision).toBe("postpone")
		expect(decisionOf(draft, "package-tracking").reason).toContain(
			"only 0 remain",
		)
		expect(draft.capacity.plannedUnits).toBe(7)
		expect(draft.capacity.postponedUnits).toBe(5)
		expect(
			draft.steps.some(
				(step) => step.identifier === "stp_support-communication",
			),
		).toBe(true)
		expect(
			stepOf(
				draft.steps,
				stepIdentifierFor("package-tracking", "execute"),
			).status,
		).toBe("postponed")
	})

	it("produces different actions for the same incident under different capacity", () => {
		const generous = buildPlanDraft(createInput(12))
		const constrained = buildPlanDraft(createInput(7))

		const executeSteps = (steps: ReadonlyArray<PlanStep>) =>
			steps
				.filter(
					(step) =>
						step.invocation.name === "execute_recovery" &&
						step.status !== "postponed",
				)
				.map((step) => step.serviceIdentifier)

		expect(executeSteps(generous.steps)).toEqual([
			"orders-database",
			"route-assignment",
			"events-stream",
			"package-tracking",
		])
		expect(executeSteps(constrained.steps)).toEqual([
			"orders-database",
			"route-assignment",
		])
	})

	it("executes services one at a time in priority order and after the engineer call", () => {
		const draft = buildPlanDraft(createInput(12))
		const databaseExecute = stepOf(
			draft.steps,
			stepIdentifierFor("orders-database", "execute"),
		)
		const routeExecute = stepOf(
			draft.steps,
			stepIdentifierFor("route-assignment", "execute"),
		)
		const trackingExecute = stepOf(
			draft.steps,
			stepIdentifierFor("package-tracking", "execute"),
		)

		expect(databaseExecute.dependsOn).toEqual(["stp_contact-engineer"])
		expect(databaseExecute.requiresApproval).toBe(true)
		expect(routeExecute.dependsOn).toContain(
			stepIdentifierFor("orders-database", "verify"),
		)
		expect(trackingExecute.dependsOn).toContain(
			stepIdentifierFor("events-stream", "verify"),
		)
		expect(trackingExecute.dependsOn).toContain(
			stepIdentifierFor("orders-database", "verify"),
		)
	})

	it("respects an operator rejection by postponing the rejected service", () => {
		const input: PlanBuildInput = {
			...createInput(12),
			rejectedServices: [
				{
					reason: "Rejected by Luis: wait for the DBA",
					serviceIdentifier: "orders-database",
				},
			],
		}
		const draft = buildPlanDraft(input)

		expect(decisionOf(draft, "orders-database").decision).toBe("postpone")
		expect(decisionOf(draft, "orders-database").reason).toContain(
			"Rejected by Luis",
		)
		expect(decisionOf(draft, "route-assignment").decision).toBe("postpone")
		expect(decisionOf(draft, "route-assignment").reason).toContain(
			"orders-database",
		)
	})

	it("carries completed steps over and re-requests pending approvals when the plan is revised", () => {
		const first = buildPlanDraft(createInput(12))
		const previous = toPlanRecord(first, 1)
		const revisedSteps = previous.steps.map((step): PlanStep => {
			if (step.identifier === "stp_contact-engineer") {
				return {
					...step,
					resultSummary: "Facts confirmed",
					status: "completed",
					toolCallIdentifier: "tool_1",
				}
			}
			if (
				step.identifier ===
				stepIdentifierFor("orders-database", "execute")
			) {
				return {
					...step,
					approvalIdentifier: "apr_old",
					status: "awaiting-approval",
				}
			}
			return step
		})
		const draft = buildPlanDraft(
			createInput(7, { ...previous, steps: revisedSteps }),
		)

		const contact = stepOf(draft.steps, "stp_contact-engineer")
		const databaseExecute = stepOf(
			draft.steps,
			stepIdentifierFor("orders-database", "execute"),
		)
		expect(contact.status).toBe("completed")
		expect(contact.toolCallIdentifier).toBe("tool_1")
		expect(databaseExecute.status).toBe("proposed")
		expect(databaseExecute.approvalIdentifier).toBe("")
	})

	it("does not count capacity twice for a service whose recovery already started", () => {
		const first = buildPlanDraft(createInput(12))
		const previous = toPlanRecord(first, 1)
		const incident = createImpactedIncident(7)
		const runningIncident = {
			...incident,
			resources: incident.resources.map((resource) => ({
				...resource,
				allocatedCapacity: 4,
			})),
			services: incident.services.map((service) =>
				service.identifier === "orders-database"
					? { ...service, status: "recovering" as const }
					: service,
			),
		}
		const draft = buildPlanDraft({
			...createInput(7, previous),
			incident: runningIncident,
		})

		expect(decisionOf(draft, "orders-database").decision).toBe(
			"recover-now",
		)
		expect(decisionOf(draft, "route-assignment").decision).toBe(
			"recover-now",
		)
		expect(draft.capacity.plannedUnits).toBe(7)
	})
})
