import "reflect-metadata"
import { LlmToolCall } from "@agent/llm/llm.types"
import {
	LlmLoopActions,
	LlmLoopService,
	LlmLoopState,
	stateFingerprint,
} from "@agent/llm/llm-loop.service"
import { validateLlmPlan } from "@agent/llm/plan-validation"
import { SubagentRunnerService } from "@agent/llm/subagent-runner.service"
import { PlanBuildInput, PlanDraft } from "@agent/types/agent.type"
import { IncidentSnapshot } from "@incidents/types/incident.type"
import { PlanRecord, PlanStep } from "@plans/types/plan.type"
import { createImpactedIncident } from "@root/testing/incident.fixture"
import { METEORITE_SCENARIO } from "@scenarios/constants/meteorite-scenario.constant"

jest.mock("@agent/llm/plan-validation", () => ({
	LlmPlanValidationError: jest.requireActual("@agent/llm/plan-validation")
		.LlmPlanValidationError,
	llmPlanSchema: {
		additionalProperties: true,
		properties: {},
		type: "object",
	},
	validateLlmPlan: jest.fn(),
}))

const validateLlmPlanMock = validateLlmPlan as jest.MockedFunction<
	typeof validateLlmPlan
>

const HIDDEN_SIMULATION_ANSWER = "hidden-simulation-answer"
const HIDDEN_SIMULATION_SCRIPT = "hidden-simulation-script"

function createInput(
	incident: IncidentSnapshot = createImpactedIncident(12),
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
		incident,
		language: "en",
		maximumStepAttempts: 2,
		previousPlan,
		rejectedServices: [],
		supportContact: METEORITE_SCENARIO.supportContact,
		triggeredBy: "test",
	}
}

function createState(
	input: PlanBuildInput = createInput(),
	overrides: Partial<Pick<LlmLoopState, "blocked" | "evidence">> = {},
): LlmLoopState {
	return {
		blocked: false,
		evidence: {},
		input,
		...overrides,
	}
}

function toolCall(
	name: string,
	argumentsValue: unknown,
	id = `${name}-call`,
): LlmToolCall {
	return {
		function: {
			arguments: JSON.stringify(argumentsValue),
			name,
		},
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
	content = "Public decision summary",
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

function createActions(getState: () => LlmLoopState) {
	return {
		execute: jest.fn().mockResolvedValue({ kind: "executed" }),
		investigate: jest.fn().mockResolvedValue({ kind: "investigated" }),
		observe: jest.fn(async () => getState()),
		save: jest.fn().mockResolvedValue({} as PlanRecord),
	}
}

function createHarness(maximumTurns = 3) {
	const client = { complete: jest.fn() }
	const configuration = {
		agent: { maximumStepsPerCycle: 1 },
		llm: { maximumTurns },
	}
	const activity = {
		list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
		record: jest.fn().mockResolvedValue(undefined),
	}
	const subagents = new SubagentRunnerService(
		client as never,
		activity as never,
	)
	const service = new LlmLoopService(
		client as never,
		configuration as never,
		activity as never,
		subagents,
	)
	return { activity, client, configuration, service, subagents }
}

function activityInputs(activity: { record: jest.Mock }) {
	return activity.record.mock.calls.map(
		([input]) =>
			input as {
				payload: Record<string, unknown>
				type: string
			},
	)
}

function createExecuteStep(
	incident: IncidentSnapshot,
	serviceIdentifier: string,
	order: number,
): PlanStep {
	const service = incident.services.find(
		(candidate) => candidate.identifier === serviceIdentifier,
	)
	if (!service)
		throw new Error(`Missing fixture service ${serviceIdentifier}`)

	return {
		approvalIdentifier: "",
		attempts: 0,
		capacityUnits: service.recoveryCapacityUnits,
		dependsOn: [],
		identifier: `stp_${serviceIdentifier}_execute`,
		invocation: {
			input: {
				actionDescription: service.recoveryActionDescription,
				actionKind: service.recoveryActionKind,
				approvalIdentifier: "",
				capacityUnits: service.recoveryCapacityUnits,
				resourceIdentifier: incident.resources[0].identifier,
				serviceIdentifier,
			},
			name: "execute_recovery",
		},
		order,
		owner: { kind: "agent", name: "Casa Pepe agent" },
		reason: "Restore an impacted service",
		requiresApproval: service.recoveryRequiresApproval,
		resultSummary: "",
		serviceIdentifier,
		status: "proposed",
		statusReason: "Proposed by the model",
		title: `Recover ${service.name}`,
		toolCallIdentifier: "",
		updatedAt: incident.updatedAt,
	}
}

function createActivePlan(incident: IncidentSnapshot): PlanRecord {
	const steps = [
		createExecuteStep(incident, "orders-database", 1),
		createExecuteStep(incident, "events-stream", 2),
	]
	return {
		assumptions: [],
		capacity: {
			assumedCapacity: 12,
			confirmed: false,
			plannedUnits: 6,
			postponedUnits: 0,
			remainingUnits: 6,
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
		reason: "Recover the most important services first",
		runIdentifier: incident.runIdentifier,
		status: "active",
		steps,
		summary: "Recover impacted services",
		triggeredBy: "test",
		updatedAt: incident.updatedAt,
		version: 1,
	}
}

describe("LlmLoopService", () => {
	it("restores rejection and waiting context in a new loop instance without replaying raw exchanges", async () => {
		const first = createHarness(2)
		const state = createState()
		first.client.complete
			.mockResolvedValueOnce(
				completion([
					toolCall("delegate_investigation", {
						resourceIdentifier: "backup",
					}),
				]),
			)
			.mockResolvedValueOnce(
				completion([
					toolCall("wait_for_input", {
						reason: "Waiting for engineer confirmation",
					}),
				]),
			)
		await first.service.run(createActions(() => state))
		const stored = first.activity.record.mock.calls.map(
			([entry], index) => ({
				...entry,
				replayed: false,
				sequence: index + 1,
			}),
		)
		const next = createHarness(1)
		next.activity.list.mockResolvedValue({
			items: stored,
			total: stored.length,
		})
		next.client.complete.mockResolvedValue(
			completion([
				toolCall("wait_for_input", {
					reason: "Still awaiting engineer",
				}),
			]),
		)
		await next.service.run(createActions(() => state))
		const messages = next.client.complete.mock.calls[0][0]
		expect(messages.map((message) => message.role)).toEqual([
			"system",
			"user",
		])
		const summary = JSON.parse(messages[1].content).investigationSummary
		expect(summary.runIdentifier).toBe(state.input.incident.runIdentifier)
		expect(summary.recentEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					correction: expect.stringContaining('"objective"'),
					type: "agent.llm-rejected",
				}),
				expect.objectContaining({
					summary: "Waiting for engineer confirmation",
					type: "agent.cycle-finished",
				}),
			]),
		)
		expect(next.activity.list).toHaveBeenCalledWith(
			expect.objectContaining({
				limit: 16,
				runIdentifier: state.input.incident.runIdentifier,
			}),
		)
	})

	it("keeps rejection memory when stale input clears the working conversation", async () => {
		const { client, service } = createHarness(3)
		let state = createState()
		const actions = createActions(() => state)
		client.complete
			.mockResolvedValueOnce(
				completion([toolCall("delegate_investigation", { input: {} })]),
			)
			.mockImplementationOnce(async () => {
				state = {
					...state,
					evidence: { newReport: "Capacity dropped" },
				}
				return completion([
					toolCall("delegate_investigation", {
						objective: "Confirm the remaining backup capacity",
					}),
				])
			})
			.mockResolvedValueOnce(
				completion([
					toolCall("wait_for_input", {
						reason: "Reassess changed capacity",
					}),
				]),
			)
		await service.run(actions)
		const messages = client.complete.mock.calls[2][0]
		expect(messages.map((message) => message.role)).toEqual([
			"system",
			"user",
		])
		expect(
			JSON.parse(messages[1].content).investigationSummary.recentEvents,
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: "agent.llm-rejected" }),
				expect.objectContaining({ type: "agent.llm-stale" }),
			]),
		)
		expect(actions.investigate).not.toHaveBeenCalled()
	})

	it("loads a bounded latest audit window and excludes records belonging to another run", async () => {
		const { activity, client, service } = createHarness(1)
		const state = createState()
		activity.list
			.mockResolvedValueOnce({ items: [], total: 90 })
			.mockResolvedValueOnce({
				items: [
					{
						payload: {},
						replayed: false,
						runIdentifier: "other-run",
						summary: "Never include me",
						type: "agent.cycle-finished",
					},
				],
				total: 90,
			})
		client.complete.mockResolvedValue(
			completion([
				toolCall("wait_for_input", { reason: "Need evidence" }),
			]),
		)
		await service.run(createActions(() => state))
		expect(activity.list).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ limit: 16, offset: 74 }),
		)
		expect(JSON.stringify(client.complete.mock.calls[0])).not.toContain(
			"Never include me",
		)
	})

	it("does not echo malformed JSON or integration secrets into the audit trail", async () => {
		const { activity, client, service } = createHarness(3)
		const actions = createActions(() => createState())
		actions.execute.mockRejectedValue(
			new Error("Bearer hidden-integration-token"),
		)
		client.complete
			.mockResolvedValueOnce(
				completion([
					rawToolCall(
						"delegate_investigation",
						'{"secret":"hidden-json-token"',
					),
				]),
			)
			.mockResolvedValueOnce(
				completion([
					toolCall("execute_step", {
						stepIdentifier: "stp_orders-database_execute",
					}),
				]),
			)
			.mockResolvedValueOnce(
				completion([
					toolCall("wait_for_input", {
						reason: "Dispatch failure",
					}),
				]),
			)
		await service.run(actions)
		const audit = JSON.stringify(activityInputs(activity))
		expect(audit).not.toContain("hidden-json-token")
		expect(audit).not.toContain("hidden-integration-token")
		expect(audit).toContain('"validJson":false')
	})

	it("ignores bookkeeping and simulation clock changes but fingerprints decision evidence", () => {
		const incident = createImpactedIncident(12)
		const plan = createActivePlan(incident)
		const base = createState(createInput(incident, plan), {
			evidence: {
				approvals: [{ identifier: "approval-1", status: "pending" }],
				incomingCalls: [
					{
						identifier: "incoming-1",
						reportedCapacity: 12,
						status: "pending",
					},
				],
			},
		})
		const fingerprint = stateFingerprint(base)

		const bookkeepingChanged = createState(
			{
				...base.input,
				incident: {
					...base.input.incident,
					agentCycles: base.input.incident.agentCycles + 1,
					simulation: {
						...base.input.incident.simulation,
						elapsedMinutes:
							base.input.incident.simulation.elapsedMinutes + 1,
						recoveryDraws:
							base.input.incident.simulation.recoveryDraws + 1,
					},
					updatedAt: "2026-09-18T10:06:00.000Z",
				},
			},
			{ evidence: base.evidence },
		)
		expect(stateFingerprint(bookkeepingChanged)).toBe(fingerprint)

		const approvalChanged = createState(base.input, {
			evidence: {
				...base.evidence,
				approvals: [{ identifier: "approval-1", status: "approved" }],
			},
		})
		expect(stateFingerprint(approvalChanged)).not.toBe(fingerprint)

		const serviceHealthChanged = createState({
			...base.input,
			incident: {
				...base.input.incident,
				services: base.input.incident.services.map((service, index) =>
					index === 0
						? {
								...service,
								status: "healthy",
								statusReason: "Independent health check passed",
							}
						: service,
				),
			},
		})
		expect(stateFingerprint(serviceHealthChanged)).not.toBe(fingerprint)

		const capacityChanged = createState({
			...base.input,
			incident: {
				...base.input.incident,
				resources: base.input.incident.resources.map(
					(resource, index) =>
						index === 0
							? {
									...resource,
									totalCapacity: resource.totalCapacity - 1,
								}
							: resource,
				),
			},
		})
		expect(stateFingerprint(capacityChanged)).not.toBe(fingerprint)

		const planStepsChanged = createState({
			...base.input,
			previousPlan: {
				...plan,
				steps: plan.steps.map((step, index) =>
					index === 0 ? { ...step, status: "running" } : step,
				),
			},
		})
		expect(stateFingerprint(planStepsChanged)).not.toBe(fingerprint)

		const incomingReportChanged = createState(base.input, {
			evidence: {
				...base.evidence,
				incomingCalls: [
					{
						identifier: "incoming-1",
						reportedCapacity: 7,
						status: "confirmed",
					},
				],
			},
		})
		expect(stateFingerprint(incomingReportChanged)).not.toBe(fingerprint)
	})

	it("validates and saves a proposed plan, then gives the saved result to the next turn", async () => {
		const incident = createImpactedIncident(12)
		const state = createState(createInput(incident))
		const savedPlan = createActivePlan(incident)
		const draft: PlanDraft = {
			assumptions: ["The model draft was validated before persistence"],
			capacity: {
				assumedCapacity: 12,
				confirmed: false,
				plannedUnits: 0,
				postponedUnits: 0,
				remainingUnits: 12,
				resourceIdentifier: incident.resources[0].identifier,
				totalCapacity: 12,
			},
			priorities: [],
			reason: "Create a validated recovery plan",
			steps: [],
			summary: "Persist the model's recovery proposal",
		}
		const { client, service } = createHarness(2)
		const actions = createActions(() => state)
		validateLlmPlanMock.mockReset()
		validateLlmPlanMock.mockReturnValueOnce(draft)
		actions.save.mockResolvedValueOnce(savedPlan)
		client.complete
			.mockResolvedValueOnce(
				completion(
					[toolCall("propose_plan", draft)],
					"I propose this recovery plan.",
				),
			)
			.mockResolvedValueOnce(
				completion([
					toolCall("wait_for_input", {
						reason: "The saved plan is ready for the next decision",
					}),
				]),
			)

		const outcome = await service.run(actions as unknown as LlmLoopActions)

		expect(outcome.kind).toBe("completed")
		expect(validateLlmPlanMock).toHaveBeenCalledWith(draft, state.input)
		expect(actions.save).toHaveBeenCalledWith(draft, state)
		expect(client.complete).toHaveBeenCalledTimes(2)
		expect(
			(
				client.complete.mock.calls[1][0] as Array<{ content?: string }>
			).some(
				(message) =>
					message.content?.includes('"identifier":"plan_fixture"') ===
					true,
			),
		).toBe(true)
	})

	it("lets the model investigate before waiting and never exposes simulation-only fields", async () => {
		const baseIncident = createImpactedIncident(12)
		const incident: IncidentSnapshot = {
			...baseIncident,
			services: baseIncident.services.map((service) => ({
				...service,
				simulatedOutcomeDetail: HIDDEN_SIMULATION_ANSWER,
			})),
		}
		const state = createState(
			{
				...createInput(incident),
				triggeredBy: "initial-observation",
			},
			{
				evidence: {
					operatorNote: "Visible evidence",
					simulatedAnswer: HIDDEN_SIMULATION_ANSWER,
					simulation: { script: HIDDEN_SIMULATION_SCRIPT },
				},
			},
		)
		const { activity, client, service } = createHarness(2)
		const actions = createActions(() => state)
		actions.investigate.mockResolvedValueOnce({
			kind: "service-health",
			services: [
				{
					name: "Orders database",
					simulatedAnswer: HIDDEN_SIMULATION_ANSWER,
					simulatedScript: HIDDEN_SIMULATION_SCRIPT,
					simulation: { script: HIDDEN_SIMULATION_SCRIPT },
					status: "down",
				},
			],
		})
		client.complete
			.mockResolvedValueOnce(
				completion(
					[
						toolCall("delegate_investigation", {
							objective:
								"Check current service health before planning.",
						}),
					],
					"I need current service health before planning.",
				),
			)
			.mockResolvedValueOnce(
				completion([toolCall("get_service_health", {})]),
			)
			.mockResolvedValueOnce(
				completion([
					toolCall("report_result", {
						details: ["Orders database is down."],
						pending: [],
						summary:
							"Service health confirms Orders database is down.",
					}),
				]),
			)
			.mockResolvedValueOnce(
				completion(
					[
						toolCall("wait_for_input", {
							reason: "Waiting for the next authoritative incident update",
						}),
					],
					"Waiting for new evidence.",
				),
			)

		const outcome = await service.run(actions as unknown as LlmLoopActions)

		expect(outcome).toEqual({
			executedSteps: 0,
			kind: "completed",
			planVersion: 0,
			waitingFor: ["Waiting for the next authoritative incident update"],
		})
		expect(actions.investigate).toHaveBeenCalledWith({
			input: {},
			name: "get_service_health",
		})
		expect(client.complete).toHaveBeenCalledTimes(4)
		expect(JSON.stringify(client.complete.mock.calls[0][0])).not.toContain(
			HIDDEN_SIMULATION_ANSWER,
		)
		expect(JSON.stringify(client.complete.mock.calls[0][0])).not.toContain(
			HIDDEN_SIMULATION_SCRIPT,
		)
		expect(JSON.stringify(client.complete.mock.calls[1][0])).not.toContain(
			HIDDEN_SIMULATION_ANSWER,
		)
		expect(JSON.stringify(client.complete.mock.calls[1][0])).not.toContain(
			HIDDEN_SIMULATION_SCRIPT,
		)
		expect(activityInputs(activity).map((input) => input.type)).toEqual([
			"agent.llm-decision",
			"agent.llm-decision",
			"agent.llm-decision",
			"agent.llm-decision",
			"agent.llm-decision",
			"agent.llm-decision",
			"agent.llm-decision",
			"agent.cycle-finished",
		])
	})

	it("discards an execute decision when input changes during the provider response", async () => {
		let current = createState()
		const { activity, client, service } = createHarness(2)
		const actions = createActions(() => current)
		client.complete.mockImplementationOnce(async () => {
			current = {
				...current,
				input: {
					...current.input,
					triggeredBy: "capacity-report-arrived",
				},
			}
			return completion([
				toolCall("execute_step", {
					stepIdentifier: "stp_orders-database_execute",
				}),
			])
		})
		client.complete.mockResolvedValueOnce(
			completion([
				toolCall("wait_for_input", {
					reason: "Reassessing the capacity report before dispatch",
				}),
			]),
		)

		const outcome = await service.run(actions as unknown as LlmLoopActions)

		expect(outcome.kind).toBe("completed")
		expect(actions.execute).not.toHaveBeenCalled()
		expect(client.complete).toHaveBeenCalledTimes(2)
		expect(JSON.stringify(client.complete.mock.calls[1][0])).toContain(
			"capacity-report-arrived",
		)
		expect(
			activityInputs(activity).some(
				(input) => input.type === "agent.llm-stale",
			),
		).toBe(true)
	})

	it("blocks all model actions while an incoming report awaits confirmation", async () => {
		const { activity, client, service } = createHarness(3)
		const actions = createActions(() =>
			createState(createInput(), { blocked: true }),
		)

		const outcome = await service.run(actions as unknown as LlmLoopActions)

		expect(outcome).toEqual({
			kind: "skipped",
			reason: "Incoming report requires operator confirmation",
		})
		expect(client.complete).not.toHaveBeenCalled()
		expect(actions.save).not.toHaveBeenCalled()
		expect(actions.execute).not.toHaveBeenCalled()
		expect(actions.investigate).not.toHaveBeenCalled()
		expect(activity.record).not.toHaveBeenCalled()
	})

	it("surfaces provider failure without dispatching or falling back to another action", async () => {
		const { activity, client, service } = createHarness(3)
		const actions = createActions(() => createState())
		client.complete.mockRejectedValueOnce(new Error("provider unavailable"))

		const outcome = await service.run(actions as unknown as LlmLoopActions)

		expect(outcome).toEqual({
			kind: "failed",
			reason: "LLM unavailable; autonomous decisions paused",
		})
		expect(actions.save).not.toHaveBeenCalled()
		expect(actions.execute).not.toHaveBeenCalled()
		expect(actions.investigate).not.toHaveBeenCalled()
		expect(activityInputs(activity)).toHaveLength(1)
		expect(activityInputs(activity)[0]).toMatchObject({
			type: "agent.llm-failed",
		})
	})

	it("rejects invalid tool arguments and lets the model recover on the next turn", async () => {
		const { activity, client, service } = createHarness(2)
		const actions = createActions(() => createState())
		client.complete
			.mockResolvedValueOnce(
				completion([
					rawToolCall("execute_step", '{"stepIdentifier":42}'),
				]),
			)
			.mockResolvedValueOnce(
				completion([
					toolCall("wait_for_input", {
						reason: "The invalid dispatch was rejected; waiting for an operator",
					}),
				]),
			)

		const outcome = await service.run(actions as unknown as LlmLoopActions)

		expect(outcome.kind).toBe("completed")
		expect(actions.execute).not.toHaveBeenCalled()
		expect(activityInputs(activity)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					payload: expect.objectContaining({
						result: expect.objectContaining({
							error: expect.stringContaining(
								"Expected only stepIdentifier",
							),
						}),
					}),
					type: "agent.llm-rejected",
				}),
			]),
		)
	})

	it("rejects multiple tool calls without dispatching either call", async () => {
		const { client, service } = createHarness(2)
		const actions = createActions(() => createState())
		client.complete
			.mockResolvedValueOnce(
				completion([
					toolCall(
						"delegate_investigation",
						{ objective: "Check service health" },
						"health-call",
					),
					toolCall(
						"delegate_communication",
						{ objective: "Send the plan" },
						"communication-call",
					),
				]),
			)
			.mockResolvedValueOnce(
				completion([
					toolCall("wait_for_input", {
						reason: "Waiting after an invalid multi-call response",
					}),
				]),
			)

		const outcome = await service.run(actions as unknown as LlmLoopActions)

		expect(outcome.kind).toBe("completed")
		expect(actions.investigate).not.toHaveBeenCalled()
		expect(actions.execute).not.toHaveBeenCalled()
		expect(JSON.stringify(client.complete.mock.calls[1][0])).toContain(
			"return exactly one declared tool call",
		)
	})

	it("stops requesting model turns at the configured turn budget", async () => {
		const { activity, client, configuration, service } = createHarness(3)
		const actions = createActions(() => createState())
		client.complete.mockResolvedValue(
			completion([toolCall("delegate_investigation", {})]),
		)

		const outcome = await service.run(actions as unknown as LlmLoopActions)

		expect(outcome).toEqual({
			kind: "failed",
			reason: "LLM turn budget reached; operator retry required",
		})
		expect(client.complete).toHaveBeenCalledTimes(
			configuration.llm.maximumTurns,
		)
		expect(actions.investigate).not.toHaveBeenCalled()
		expect(actions.execute).not.toHaveBeenCalled()
		const inputs = activityInputs(activity)
		expect(inputs[inputs.length - 1]).toMatchObject({
			type: "agent.limit-reached",
		})
	})

	it("executes the step selected by the model instead of the first ordered step", async () => {
		const incident = createImpactedIncident(12)
		const plan = createActivePlan(incident)
		const { client, configuration, service } = createHarness(2)
		const actions = createActions(() =>
			createState(createInput(incident, plan)),
		)
		client.complete
			.mockResolvedValueOnce(
				completion([
					toolCall("execute_step", {
						stepIdentifier: "stp_events-stream_execute",
					}),
				]),
			)
			.mockResolvedValueOnce(
				completion([
					toolCall("wait_for_input", {
						reason: "The selected recovery is running; wait for its result",
					}),
				]),
			)

		const outcome = await service.run(actions as unknown as LlmLoopActions)

		expect(outcome).toMatchObject({
			executedSteps: 1,
			kind: "completed",
			planVersion: 1,
		})
		expect(plan.steps[0].identifier).toBe("stp_orders-database_execute")
		expect(actions.execute).toHaveBeenCalledTimes(1)
		expect(actions.execute).toHaveBeenCalledWith(
			"stp_events-stream_execute",
			expect.objectContaining({
				input: expect.objectContaining({ previousPlan: plan }),
			}),
		)
		expect(configuration.agent.maximumStepsPerCycle).toBe(1)
	})
})

it("correlates provisional public output with the final decision before executing tools", async () => {
	const { service, client, activity } = createHarness()
	const actions = createActions(() => createState())
	client.complete.mockImplementation(async (_messages, _tools, onText) => {
		await onText("Waiting for capacity confirmation")
		expect(actions.execute).not.toHaveBeenCalled()
		return completion([
			toolCall("wait_for_input", {
				reason: "Capacity confirmation pending",
			}),
		])
	})
	await service.run(actions)
	const records = activityInputs(activity)
	const draft = records.find((record) => record.type === "agent.llm-output")
	const final = records.find((record) => record.type === "agent.llm-decision")
	expect(draft?.payload).toMatchObject({
		provisional: true,
		text: "Waiting for capacity confirmation",
		turn: 0,
	})
	expect(final?.payload.outputIdentifier).toBe(
		draft?.payload.outputIdentifier,
	)
})

describe("reset during a model request", () => {
	it("discards the response without dispatching tools or saving a plan", async () => {
		const { service, client, activity } = createHarness(1)
		let state = createState()
		const actions = createActions(() => state)
		client.complete.mockImplementation(async () => {
			state = createState(
				createInput({
					...state.input.incident,
					active: false,
					status: "reset",
				}),
			)
			return completion([
				toolCall("delegate_investigation", {
					objective: "Read the incident context",
				}),
			])
		})
		await expect(service.run(actions)).resolves.toMatchObject({
			kind: "skipped",
		})
		expect(client.complete).toHaveBeenCalledTimes(1)
		expect(actions.investigate).not.toHaveBeenCalled()
		expect(actions.execute).not.toHaveBeenCalled()
		expect(actions.save).not.toHaveBeenCalled()
		expect(activity.record).toHaveBeenCalledWith(
			expect.objectContaining({
				payload: expect.objectContaining({ disposition: "stale" }),
				type: "agent.llm-stale",
			}),
		)
	})
})

describe("complete public turn records", () => {
	it("persists full text, original calls and accepted disposition under one ID", async () => {
		const { client, service, activity } = createHarness(1)
		const text = "Complete explanation. ".repeat(250)
		client.complete.mockResolvedValue({
			finishReason: "tool_calls",
			message: {
				content: text,
				role: "assistant",
				tool_calls: [
					toolCall(
						"wait_for_input",
						{ reason: "Awaiting operator" },
						"original-call",
					),
				],
			},
			model: "fixture-model",
			usage: { total_tokens: 42 },
		})
		await service.run(createActions(() => createState()))
		const turns = activityInputs(activity).filter(
			(event) => event.type === "agent.llm-decision",
		)
		expect(turns.map((event) => event.payload.disposition)).toEqual([
			"pending",
			"accepted",
		])
		expect(turns[1].payload).toMatchObject({
			finishReason: "tool_calls",
			text,
			toolCalls: [
				{
					arguments: { reason: "Awaiting operator" },
					id: "original-call",
					name: "wait_for_input",
				},
			],
		})
		expect(turns[0].payload.outputIdentifier).toBe(
			turns[1].payload.outputIdentifier,
		)
	})
	it("retains a rejected proposal with its correlated public arguments", async () => {
		const { client, service, activity } = createHarness(1)
		client.complete.mockResolvedValue({
			message: {
				content: "Try a step",
				role: "assistant",
				tool_calls: [
					toolCall("execute_step", {
						password: "private-value",
						stepIdentifier: 99,
					}),
				],
			},
			model: "fixture-model",
		})
		await service.run(createActions(() => createState()))
		const rejected = activityInputs(activity).find(
			(event) => event.type === "agent.llm-rejected",
		)
		expect(rejected?.payload).toMatchObject({
			disposition: "rejected",
			outputIdentifier: expect.any(String),
			text: "Try a step",
		})
		expect(JSON.stringify(rejected)).not.toContain("private-value")
	})
})
