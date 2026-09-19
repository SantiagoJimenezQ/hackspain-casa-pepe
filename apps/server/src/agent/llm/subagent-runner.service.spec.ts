import "reflect-metadata"
import { LlmToolCall } from "@agent/llm/llm.types"
import { SubagentRunnerService } from "@agent/llm/subagent-runner.service"
import { PlanBuildInput } from "@agent/types/agent.type"
import { LlmLoopState } from "@agent/types/llm-loop.type"
import { SubagentKind } from "@agent/types/subagent.type"
import { IncidentSnapshot } from "@incidents/types/incident.type"
import { PlanRecord, PlanStep } from "@plans/types/plan.type"
import { createImpactedIncident } from "@root/testing/incident.fixture"
import { METEORITE_SCENARIO } from "@scenarios/constants/meteorite-scenario.constant"

const ENGINEER = {
	name: "Marta Ruiz",
	phone: "+34600000000",
	role: "Platform on-call engineer",
} as const

function createInput(
	incident: IncidentSnapshot = createImpactedIncident(12),
	previousPlan: PlanRecord | null = null,
): PlanBuildInput {
	return {
		briefing: METEORITE_SCENARIO.engineerBriefing,
		capacityAssumption: null,
		engineer: { ...ENGINEER },
		failedServices: [],
		incident,
		language: "en",
		maximumStepAttempts: 2,
		previousPlan,
		rejectedServices: [],
		supportContact: METEORITE_SCENARIO.supportContact,
		triggeredBy: "test",
	}
}

function createState(input: PlanBuildInput = createInput()): LlmLoopState {
	return { blocked: false, evidence: {}, input }
}

function createStep(
	incident: IncidentSnapshot,
	identifier: string,
	invocation: PlanStep["invocation"],
	order: number,
): PlanStep {
	return {
		approvalIdentifier: "",
		attempts: 0,
		capacityUnits: 0,
		dependsOn: [],
		identifier,
		invocation,
		order,
		owner: { kind: "agent", name: "Casa Pepe agent" },
		reason: "Planned by the commander",
		requiresApproval: false,
		resultSummary: "",
		serviceIdentifier: "",
		status: "proposed",
		statusReason: "Proposed by the model",
		title: identifier,
		toolCallIdentifier: "",
		updatedAt: incident.updatedAt,
	}
}

function createPlanWithCall(incident: IncidentSnapshot): PlanRecord {
	const callStep = createStep(
		incident,
		"stp_contact-engineer",
		{
			input: {
				engineerName: ENGINEER.name,
				engineerPhone: ENGINEER.phone,
				engineerRole: ENGINEER.role,
				purpose: "Confirm the real backup capacity",
				questions: [
					{
						key: "backup-capacity",
						question:
							"How much backup capacity is really available?",
					},
				],
			},
			name: "call_engineer",
		},
		1,
	)
	const emailStep = createStep(
		incident,
		"stp_support-communication",
		{ input: { planIdentifier: "" }, name: "send_incident_email" },
		2,
	)
	return {
		assumptions: [],
		capacity: {
			assumedCapacity: 12,
			confirmed: false,
			plannedUnits: 0,
			postponedUnits: 0,
			remainingUnits: 12,
			resourceIdentifier: incident.resources[0].identifier,
			totalCapacity: 12,
		},
		changesFromPrevious: [],
		createdAt: incident.updatedAt,
		decisionIdentifier: "dec_fixture",
		identifier: "plan_fixture",
		incidentIdentifier: incident.identifier,
		previousPlanIdentifier: "",
		priorities: [],
		reason: "Confirm capacity before committing recoveries",
		runIdentifier: incident.runIdentifier,
		status: "active",
		steps: [callStep, emailStep],
		summary: "Investigation-only plan",
		triggeredBy: "test",
		updatedAt: incident.updatedAt,
		version: 1,
	}
}

function toolCall(
	name: string,
	argumentsValue: unknown,
	id = `${name}-call`,
): LlmToolCall {
	return {
		function: { arguments: JSON.stringify(argumentsValue), name },
		id,
		type: "function",
	}
}

function rawToolCall(
	name: string,
	argumentsValue: string,
	id = `${name}-call`,
): LlmToolCall {
	return {
		function: { arguments: argumentsValue, name },
		id,
		type: "function",
	}
}

function completion(
	calls: ReadonlyArray<LlmToolCall>,
	content = "Public specialist summary",
) {
	return {
		message: {
			content,
			role: "assistant" as const,
			tool_calls: [...calls],
		},
		model: "test-model",
		usage: { completionTokens: 1, promptTokens: 1, totalTokens: 2 },
	}
}

function reportCall(summary = "Reported to the commander") {
	return completion([
		toolCall("report_result", {
			details: ["A concrete finding"],
			pending: ["Something still unknown"],
			summary,
		}),
	])
}

function createActions(state: LlmLoopState) {
	return {
		execute: jest.fn().mockResolvedValue({ kind: "executed" }),
		investigate: jest.fn().mockResolvedValue({ kind: "investigated" }),
		observe: jest.fn(async () => state),
		save: jest.fn().mockResolvedValue({} as PlanRecord),
	}
}

function createHarness() {
	const client = { complete: jest.fn() }
	const activity = { record: jest.fn().mockResolvedValue(undefined) }
	const service = new SubagentRunnerService(
		client as never,
		activity as never,
	)
	return { activity, client, service }
}

function createRequest(
	kind: SubagentKind,
	state: LlmLoopState,
	remainingActions = 2,
) {
	return {
		kind,
		objective: "Answer one bounded question for the commander",
		remainingActions,
		state,
	}
}

function activityInputs(activity: { record: jest.Mock }) {
	return activity.record.mock.calls.map(
		([input]) =>
			input as {
				payload: Record<string, unknown>
				summary: string
				title: string
				type: string
			},
	)
}

describe("SubagentRunnerService", () => {
	it("explains empty read arguments and recovers from a wrapped read without leaking values", async () => {
		const { activity, client, service } = createHarness()
		const state = createState()
		const actions = createActions(state)
		client.complete
			.mockResolvedValueOnce(
				completion([
					toolCall("get_recovery_capacity", {
						input: {
							apiKey: "secret-value",
							resourceIdentifier: "private-resource",
						},
					}),
				]),
			)
			.mockResolvedValueOnce(
				completion([toolCall("get_recovery_capacity", {})]),
			)
			.mockResolvedValueOnce(reportCall("Capacity inspected"))

		const outcome = await service.run(
			createRequest("investigator", state),
			actions as never,
		)

		expect(outcome).toMatchObject({
			executedSteps: 0,
			kind: "reported",
			specialist: "investigator",
		})
		expect(actions.investigate).toHaveBeenCalledTimes(1)
		expect(actions.investigate).toHaveBeenCalledWith({
			input: {},
			name: "get_recovery_capacity",
		})
		const [messages, definitions] = client.complete.mock.calls[0]
		expect(messages[0].role).toBe("system")
		expect(messages[0].content).toContain('not {"input":{}}')
		const definition = definitions.find(
			(item) => item.function.name === "get_recovery_capacity",
		)
		expect(definition.function.description).toContain("exactly {}")
		expect(definition.function.parameters).toMatchObject({
			additionalProperties: false,
			properties: {},
			required: [],
		})
		const feedback = JSON.parse(
			client.complete.mock.calls[1][0].find(
				(message) => message.role === "tool",
			).content,
		)
		expect(feedback.correction).toContain("exactly {}")
		expect(feedback.argumentDiagnostics.shape.fields[0].name).toBe("input")
		const audit = JSON.stringify(activityInputs(activity))
		expect(audit).not.toContain("secret-value")
		expect(audit).not.toContain("private-resource")
		expect(audit).toContain("[redacted-field]")
	})

	it("returns the bounded report and never offers planning tools", async () => {
		const { client, service } = createHarness()
		const state = createState()
		client.complete.mockResolvedValueOnce(
			completion([
				toolCall("report_result", {
					details: ["Orders database is down"],
					pending: ["Capacity unconfirmed"],
					summary: "One service is down.",
				}),
			]),
		)

		const outcome = await service.run(
			createRequest("investigator", state),
			createActions(state) as never,
		)

		expect(outcome).toEqual({
			executedSteps: 0,
			kind: "reported",
			report: {
				details: ["Orders database is down"],
				pending: ["Capacity unconfirmed"],
				summary: "One service is down.",
			},
			specialist: "investigator",
		})
		const names = client.complete.mock.calls[0][1].map(
			(definition) => definition.function.name,
		)
		expect(names).toEqual(
			expect.not.arrayContaining([
				"propose_plan",
				"execute_step",
				"dispatch_step",
				"wait_for_input",
			]),
		)
	})

	it("dispatches a planned call step and spends the action budget", async () => {
		const incident = createImpactedIncident(12)
		const state = createState(
			createInput(incident, createPlanWithCall(incident)),
		)
		const { client, service } = createHarness()
		const actions = createActions(state)
		client.complete
			.mockResolvedValueOnce(
				completion([
					toolCall("dispatch_step", {
						stepIdentifier: "stp_contact-engineer",
					}),
				]),
			)
			.mockResolvedValueOnce(reportCall("The engineer call is running"))

		const outcome = await service.run(
			createRequest("caller", state),
			actions as never,
		)

		expect(outcome).toMatchObject({
			executedSteps: 1,
			kind: "reported",
			specialist: "caller",
		})
		expect(actions.execute).toHaveBeenCalledWith(
			"stp_contact-engineer",
			state,
		)
		const context = JSON.parse(client.complete.mock.calls[0][0][1].content)
		expect(context.availableSteps).toEqual([
			expect.objectContaining({
				identifier: "stp_contact-engineer",
				tool: "call_engineer",
			}),
		])
	})

	it("refuses a step outside its own scope", async () => {
		const incident = createImpactedIncident(12)
		const state = createState(
			createInput(incident, createPlanWithCall(incident)),
		)
		const { activity, client, service } = createHarness()
		const actions = createActions(state)
		client.complete
			.mockResolvedValueOnce(
				completion([
					toolCall("dispatch_step", {
						stepIdentifier: "stp_support-communication",
					}),
				]),
			)
			.mockResolvedValueOnce(reportCall("Could not dispatch"))

		const outcome = await service.run(
			createRequest("caller", state),
			actions as never,
		)

		expect(outcome).toMatchObject({ executedSteps: 0, kind: "reported" })
		expect(actions.execute).not.toHaveBeenCalled()
		expect(activityInputs(activity)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					payload: expect.objectContaining({
						result: expect.objectContaining({
							error: expect.stringContaining("availableSteps"),
						}),
					}),
					type: "agent.llm-rejected",
				}),
			]),
		)
	})

	it("refuses to dispatch once the commander's action budget is spent", async () => {
		const incident = createImpactedIncident(12)
		const state = createState(
			createInput(incident, createPlanWithCall(incident)),
		)
		const { client, service } = createHarness()
		const actions = createActions(state)
		client.complete
			.mockResolvedValueOnce(
				completion([
					toolCall("dispatch_step", {
						stepIdentifier: "stp_contact-engineer",
					}),
				]),
			)
			.mockResolvedValueOnce(reportCall("No budget left"))

		const outcome = await service.run(
			createRequest("caller", state, 0),
			actions as never,
		)

		expect(outcome).toMatchObject({ executedSteps: 0, kind: "reported" })
		expect(actions.execute).not.toHaveBeenCalled()
	})

	it("keeps the commander's evidence and plan schema out of a specialist turn", async () => {
		const incident = createImpactedIncident(12)
		const state: LlmLoopState = {
			blocked: false,
			evidence: {
				learning: [{ note: "commander-only-learning" }],
				toolCalls: [{ identifier: "commander-only-tool-call" }],
			},
			input: createInput(incident, createPlanWithCall(incident)),
		}
		const { client, service } = createHarness()
		client.complete.mockResolvedValueOnce(reportCall())

		await service.run(
			createRequest("communicator", state),
			createActions(state) as never,
		)

		const payload = JSON.stringify(client.complete.mock.calls[0][0])
		expect(payload).not.toContain("commander-only-learning")
		expect(payload).not.toContain("commander-only-tool-call")
		expect(payload).not.toContain("investigationSummary")
		const context = JSON.parse(client.complete.mock.calls[0][0][1].content)
		expect(context.objective).toBe(
			"Answer one bounded question for the commander",
		)
		expect(context.availableSteps).toEqual([
			expect.objectContaining({
				identifier: "stp_support-communication",
				tool: "send_incident_email",
			}),
		])
	})

	it("ends as exhausted when the specialist never reports", async () => {
		const { activity, client, service } = createHarness()
		const state = createState()
		client.complete.mockResolvedValue(
			completion([toolCall("get_service_health", {})]),
		)

		const outcome = await service.run(
			createRequest("investigator", state),
			createActions(state) as never,
		)

		expect(outcome).toMatchObject({
			kind: "exhausted",
			specialist: "investigator",
		})
		const inputs = activityInputs(activity)
		expect(inputs[inputs.length - 1]).toMatchObject({
			type: "agent.limit-reached",
		})
	})

	it("reports a provider failure without dispatching anything", async () => {
		const { client, service } = createHarness()
		const state = createState()
		const actions = createActions(state)
		client.complete.mockRejectedValue(new Error("provider down"))

		const outcome = await service.run(
			createRequest("investigator", state),
			actions as never,
		)

		expect(outcome).toMatchObject({
			executedSteps: 0,
			kind: "failed",
			specialist: "investigator",
		})
		expect(actions.investigate).not.toHaveBeenCalled()
		expect(actions.execute).not.toHaveBeenCalled()
	})
})
