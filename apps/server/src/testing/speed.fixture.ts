import { PlanBuildInput } from "@agent/types/agent.type"
import { PlanRecord } from "@plans/types/plan.type"
import { METEORITE_SCENARIO } from "@scenarios/constants/meteorite-scenario.constant"
import { createImpactedIncident } from "./incident.fixture"
import { buildScriptedPlanDraft } from "./scripted-llm.helper"
export function speedFixture() {
	const input: PlanBuildInput = {
		briefing: METEORITE_SCENARIO.engineerBriefing,
		capacityAssumption: null,
		engineer: { name: "Marta", phone: "+34600000000", role: "on-call" },
		failedServices: [],
		incident: createImpactedIncident(12),
		language: "en",
		maximumStepAttempts: 2,
		previousPlan: null,
		rejectedServices: [],
		supportContact: METEORITE_SCENARIO.supportContact,
		triggeredBy: "test",
	}
	const draft = buildScriptedPlanDraft(input)
	const plan: PlanRecord = {
		...draft,
		changesFromPrevious: [],
		createdAt: input.incident.updatedAt,
		decisionIdentifier: "dec_speed",
		identifier: "plan_speed",
		incidentIdentifier: input.incident.identifier,
		previousPlanIdentifier: "",
		runIdentifier: input.incident.runIdentifier,
		status: "active",
		triggeredBy: "test",
		updatedAt: input.incident.updatedAt,
		version: 1,
	}
	return { draft, input, plan }
}
