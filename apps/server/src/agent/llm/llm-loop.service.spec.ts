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
import {
	createImpactedIncident,
	createLastDegradedIncident,
} from "@root/testing/incident.fixture"
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

function createOpeningPlan(incident: IncidentSnapshot): PlanRecord {
	const plan = createActivePlan(incident)
	return {
		...plan,
		steps: [
			{
				...plan.steps[0],
				capacityUnits: 0,
				identifier: "stp_contact-engineer",
				invocation: {
					input: {
						engineerName: "Marta Ruiz",
						engineerPhone: "+34600000000",
						engineerRole: "Platform on-call engineer",
						purpose: "Settle the pending facts",
						questions: [
							{
								key: "backup-capacity",
								question: "How much capacity is real?",
							},
						],
					},
					name: "call_engineer",
				},
				requiresApproval: false,
				serviceIdentifier: "",
				status: "completed",
				title: "Call the on-call engineer",
			},
		],
	}
}

describe("LlmLoopService", () => {
	it("asks for the real plan before accepting a wait on the opening engineer call", async () => {
		const { client, service } = createHarness(3)
		const incident = createImpactedIncident(12)
		const state = createState(
			createInput(incident, createOpeningPlan(incident)),
		)
		client.complete
			.mockResolvedValueOnce(
				completion([
					toolCall("wait_for_input", {
						reason: "The call collected no technical answer",
					}),
				]),
			)
			.mockResolvedValueOnce(
				completion([
					toolCall("wait_for_input", {
						reason: "Only the operator can supply the missing facts now",
					}),
				]),
			)

		const outcome = await service.run(createActions(() => state))

		expect(JSON.stringify(client.complete.mock.calls[1][0])).toContain(
			"opening engineer call the server dispatched",
		)
		expect(outcome).toMatchObject({ kind: "completed" })
	})

	it("accepts a wait once the plan carries work beyond the engineer call", async () => {
		const { client, service } = createHarness(2)
		const incident = createImpactedIncident(12)
		const opening = createOpeningPlan(incident)
		const plan = {
			...opening,
			steps: [...opening.steps, ...createActivePlan(incident).steps],
		}
		const state = createState(createInput(incident, plan))
		client.complete.mockResolvedValue(
			completion([
				toolCall("wait_for_input", {
					reason: "Waiting for the operator decision",
				}),
			]),
		)

		await service.run(createActions(() => state))

		expect(JSON.stringify(client.complete.mock.calls[0][0])).not.toContain(
			"opening engineer call the server dispatched",
		)
	})

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
		// The server guarantees the engineer call while facts stay pending, so the validated
		// draft is the model's proposal plus that step.
		const [repaired, validatedAgainst] = validateLlmPlanMock.mock
			.calls[0] as [
			{ steps: Array<{ invocation: { name: string } }> },
			unknown,
		]
		expect(validatedAgainst).toBe(state.input)
		expect(repaired).toMatchObject({
			capacity: draft.capacity,
			priorities: draft.priorities,
			reason: draft.reason,
			summary: draft.summary,
		})
		expect(repaired.steps.map((step) => step.invocation.name)).toEqual([
			"call_engineer",
		])
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

	it("delegates investigation to the specialist and never exposes simulation-only fields", async () => {
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
								"Confirm which services are down before planning",
						}),
					],
					"Asking the investigation specialist for service health.",
				),
			)
			.mockResolvedValueOnce(
				completion(
					[toolCall("get_service_health", {})],
					"Reading current service health.",
				),
			)
			.mockResolvedValueOnce(
				completion(
					[
						toolCall("report_result", {
							details: ["Orders database is down"],
							pending: ["Backup capacity is still unconfirmed"],
							summary:
								"One service is down; capacity unconfirmed.",
						}),
					],
					"Reporting the findings.",
				),
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
		for (const call of client.complete.mock.calls) {
			expect(JSON.stringify(call[0])).not.toContain(
				HIDDEN_SIMULATION_ANSWER,
			)
			expect(JSON.stringify(call[0])).not.toContain(
				HIDDEN_SIMULATION_SCRIPT,
			)
		}
		const commanderTools = client.complete.mock.calls[0][1].map(
			(definition) => definition.function.name,
		)
		expect(commanderTools).toContain("delegate_investigation")
		expect(commanderTools).not.toContain("get_service_health")
		const specialistTools = client.complete.mock.calls[1][1].map(
			(definition) => definition.function.name,
		)
		expect(specialistTools).toContain("get_service_health")
		expect(specialistTools).toEqual(
			expect.not.arrayContaining(["propose_plan", "execute_step"]),
		)
		const records = activityInputs(activity)
		expect(
			records.some(
				(record) => record.payload.subagent === "investigator",
			),
		).toBe(true)
		const delegation = records.find(
			(record) => record.payload.specialist === "investigator",
		)
		expect(delegation?.payload).toMatchObject({
			executedSteps: 0,
			specialist: "investigator",
		})
		// Commander turns emit pending and accepted records for the same output.
		const commander = records.filter((record) => record.payload.disposition)
		expect(commander.map((record) => record.payload.disposition)).toEqual([
			"pending",
			"accepted",
			"pending",
			"accepted",
		])
		for (const offset of [0, 2]) {
			expect(commander[offset].payload.outputIdentifier).toEqual(
				expect.any(String),
			)
			expect(commander[offset + 1].payload.outputIdentifier).toBe(
				commander[offset].payload.outputIdentifier,
			)
		}
		expect(
			records.filter(
				(record) => record.payload.subagent === "investigator",
			),
		).toHaveLength(2)
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

	it("surfaces a runnable step instead of idling when a cycle dispatched nothing", async () => {
		const incident = createImpactedIncident(12)
		const plan = createActivePlan(incident)
		const { client, service } = createHarness(4)
		const actions = createActions(() =>
			createState(createInput(incident, plan)),
		)
		client.complete
			.mockResolvedValueOnce(
				completion([
					toolCall("wait_for_input", {
						reason: "Waiting for the recovery that already finished",
					}),
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
						reason: "The dispatched recovery is running; wait for its result",
					}),
				]),
			)

		const outcome = await service.run(actions as unknown as LlmLoopActions)

		// The first wait is challenged, the second one is accepted after real work.
		expect(outcome).toMatchObject({ executedSteps: 1, kind: "completed" })
		expect(actions.execute).toHaveBeenCalledTimes(1)
	})

	it("rejects waiting after a local task while an engineer call is still runnable", async () => {
		const incident = createImpactedIncident(12)
		const base = createActivePlan(incident)
		const plan: PlanRecord = {
			...base,
			steps: [
				{
					approvalIdentifier: "",
					attempts: 0,
					capacityUnits: 0,
					dependsOn: [],
					identifier: "stp_contact-engineer",
					invocation: {
						input: {
							engineerName: "Marta Ruiz",
							engineerPhone: "+34600000000",
							engineerRole: "Platform on-call engineer",
							purpose: "Confirm pending facts",
							questions: [
								{
									key: "traffic-failover-authorized",
									question: "Authorize failover?",
								},
							],
						},
						name: "call_engineer",
					},
					order: 1,
					owner: { kind: "engineer", name: "Marta Ruiz" },
					reason: "Call the on-call engineer",
					requiresApproval: false,
					resultSummary: "",
					serviceIdentifier: "",
					status: "proposed",
					statusReason: "",
					title: "Call Marta Ruiz",
					toolCallIdentifier: "",
					updatedAt: incident.updatedAt,
				},
				{
					approvalIdentifier: "",
					attempts: 0,
					capacityUnits: 0,
					dependsOn: [],
					identifier: "stp_investigate_task",
					invocation: {
						input: {
							assigneeName:
								METEORITE_SCENARIO.supportContact.name,
							assigneeRole:
								METEORITE_SCENARIO.supportContact.role,
							description: "Confirm snapshot",
							priority: "critical",
							serviceIdentifier: "orders-database",
							title: "Confirm Muscat",
						},
						name: "assign_task",
					},
					order: 2,
					owner: {
						kind: "engineer",
						name: METEORITE_SCENARIO.supportContact.name,
					},
					reason: "Need independent confirmation",
					requiresApproval: false,
					resultSummary: "",
					serviceIdentifier: "orders-database",
					status: "proposed",
					statusReason: "",
					title: "Coordinate confirmations",
					toolCallIdentifier: "",
					updatedAt: incident.updatedAt,
				},
				...base.steps,
			],
		}
		const { activity, client, service } = createHarness(4)
		const actions = createActions(() =>
			createState(createInput(incident, plan)),
		)
		client.complete
			.mockResolvedValueOnce(
				completion([
					toolCall("execute_step", {
						stepIdentifier: "stp_investigate_task",
					}),
				]),
			)
			.mockResolvedValueOnce(
				completion([
					toolCall("wait_for_input", {
						reason: "Waiting for operator confirmation",
					}),
				]),
			)
			.mockResolvedValueOnce(
				completion([
					toolCall("wait_for_input", {
						reason: "The call cannot run because the voice provider is limited",
					}),
				]),
			)

		const outcome = await service.run(actions as unknown as LlmLoopActions)

		expect(outcome).toMatchObject({ executedSteps: 1, kind: "completed" })
		expect(actions.execute).toHaveBeenCalledTimes(1)
		expect(actions.execute).toHaveBeenCalledWith(
			"stp_investigate_task",
			expect.anything(),
		)
		expect(JSON.stringify(activityInputs(activity))).toContain(
			"stp_contact-engineer",
		)
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

	it("repairs a post-recovery propose_plan onto Bahrain instead of stalling", async () => {
		const { validateLlmPlan: actualValidate } = jest.requireActual(
			"@agent/llm/plan-validation",
		) as { validateLlmPlan: typeof validateLlmPlan }
		validateLlmPlanMock.mockReset()
		validateLlmPlanMock.mockImplementation(actualValidate)
		const incident = createImpactedIncident(4)
		const recovered: IncidentSnapshot = {
			...incident,
			resources: incident.resources.map((resource, index) =>
				index === 0 ? { ...resource, allocatedCapacity: 4 } : resource,
			),
			services: incident.services.map((service) =>
				service.identifier === "orders-database"
					? { ...service, status: "healthy" }
					: service,
			),
			status: "partially-recovered",
		}
		const database = recovered.services.find(
			(service) => service.identifier === "orders-database",
		)
		if (!database) throw new Error("fixture lacks orders-database")
		const previous = createActivePlan(recovered)
		const completedCall: PlanStep = {
			approvalIdentifier: "",
			attempts: 1,
			capacityUnits: 0,
			dependsOn: [],
			identifier: "stp_engineer_call",
			invocation: {
				input: {
					engineerName: "Marta Ruiz",
					engineerPhone: "+34600000000",
					engineerRole: "Platform on-call engineer",
					purpose: "Request permission",
					questions: [
						{
							key: "traffic-failover-authorized",
							question: "Authorize failover?",
						},
					],
				},
				name: "call_engineer",
			},
			order: 1,
			owner: { kind: "engineer", name: "Marta Ruiz" },
			reason: "Call the engineer",
			requiresApproval: false,
			resultSummary: "Authorized",
			serviceIdentifier: "",
			status: "completed",
			statusReason: "Completed",
			title: "Call engineer",
			toolCallIdentifier: "tool_call",
			updatedAt: recovered.updatedAt,
		}
		const previousPlan: PlanRecord = {
			...previous,
			capacity: {
				...previous.capacity,
				assumedCapacity: 4,
				plannedUnits: 4,
				remainingUnits: 0,
				resourceIdentifier: "backup-oman",
				totalCapacity: 4,
			},
			steps: [
				completedCall,
				{
					...createExecuteStep(recovered, "orders-database", 2),
					attempts: 1,
					status: "completed",
					statusReason: "Completed",
					toolCallIdentifier: "tool_execute",
				},
				{
					approvalIdentifier: "",
					attempts: 1,
					capacityUnits: 0,
					dependsOn: ["stp_orders-database_execute"],
					identifier: "stp_orders-database_verify",
					invocation: {
						input: {
							recoveryActionIdentifier: "",
							serviceIdentifier: "orders-database",
						},
						name: "verify_recovery",
					},
					order: 3,
					owner: { kind: "agent", name: "Casa Pepe agent" },
					reason: "Verify the failover",
					requiresApproval: false,
					resultSummary: "Healthy",
					serviceIdentifier: "orders-database",
					status: "completed",
					statusReason: "Completed",
					title: "Verify database",
					toolCallIdentifier: "tool_verify",
					updatedAt: recovered.updatedAt,
				},
			],
		}
		const state = createState(createInput(recovered, previousPlan))
		const dump = {
			assumptions: ["Oman is full after the database failover"],
			capacity: {
				assumedCapacity: 4,
				confirmed: false,
				plannedUnits: 4,
				postponedUnits: 10,
				remainingUnits: 0,
				resourceIdentifier: "backup-oman",
				totalCapacity: 4,
			},
			priorities: recovered.services.map((service, index) => ({
				blockedBy: [],
				businessImpact: service.businessImpact,
				capacityUnits: service.recoveryCapacityUnits,
				decision:
					service.identifier === "orders-database"
						? "already-healthy"
						: "postpone",
				rank: index + 1,
				reason: "Dump revision",
				score: 100 - index,
				serviceIdentifier: service.identifier,
				serviceName: service.name,
			})),
			reason: "Preserve the recovered database",
			steps: [
				{
					approvalIdentifier: "",
					attempts: 0,
					capacityUnits: 0,
					dependsOn: [],
					identifier: "stp_engineer_call_2",
					invocation: {
						input: {
							engineerName: "Marta Ruiz",
							engineerPhone: "+34600000000",
							engineerRole: "Platform on-call engineer",
							purpose: "Chase remaining facts",
							questions: [
								{
									key: "backup-capacity-available",
									question: "Authorize remaining capacity?",
								},
							],
						},
						name: "call_engineer",
					},
					order: 1,
					owner: { kind: "engineer", name: "Marta Ruiz" },
					reason: "Follow-up call",
					requiresApproval: false,
					resultSummary: "",
					serviceIdentifier: "",
					status: "proposed",
					statusReason: "",
					title: "Call engineer again",
					toolCallIdentifier: "",
					updatedAt: recovered.updatedAt,
				},
			],
			summary: "Wait for another call",
		}
		const { client, service } = createHarness(2)
		const actions = createActions(() => state)
		actions.save.mockImplementation(async (draft) => ({
			...previousPlan,
			...draft,
			identifier: "plan_repaired",
			version: 2,
		}))
		client.complete
			.mockResolvedValueOnce(
				completion([toolCall("propose_plan", dump)], "Revising."),
			)
			.mockResolvedValueOnce(
				completion([
					toolCall("wait_for_input", {
						reason: "Waiting after the repaired plan",
					}),
				]),
			)

		const outcome = await service.run(actions as unknown as LlmLoopActions)

		expect(outcome.kind).toBe("completed")
		expect(actions.save).toHaveBeenCalled()
		const saved = actions.save.mock.calls[0][0] as PlanDraft
		expect(
			saved.priorities.find(
				(priority) => priority.serviceIdentifier === "orders-database",
			),
		).toMatchObject({ capacityUnits: 0, decision: "already-healthy" })
		expect(
			saved.priorities.find(
				(priority) => priority.serviceIdentifier === "route-assignment",
			)?.decision,
		).toBe("recover-now")
		expect(saved.capacity.resourceIdentifier).toBe("backup-bahrain")
		expect(
			saved.steps.find(
				(step) => step.identifier === "stp_route-assignment_execute",
			)?.status,
		).toBe("proposed")
		const executeOrder =
			saved.steps.find(
				(step) => step.identifier === "stp_route-assignment_execute",
			)?.order ?? Number.POSITIVE_INFINITY
		const followUpOrder =
			saved.steps.find(
				(step) => step.identifier === "stp_engineer_call_2",
			)?.order ?? Number.POSITIVE_INFINITY
		expect(executeOrder).toBeLessThan(followUpOrder)
	})

	it("accepts a leftover notifications propose_plan on Bahrain instead of stalling", async () => {
		const { validateLlmPlan: actualValidate } = jest.requireActual(
			"@agent/llm/plan-validation",
		) as { validateLlmPlan: typeof validateLlmPlan }
		validateLlmPlanMock.mockReset()
		validateLlmPlanMock.mockImplementation(actualValidate)
		const leftover = createLastDegradedIncident()
		const database = leftover.services.find(
			(service) => service.identifier === "orders-database",
		)
		if (!database) throw new Error("fixture lacks orders-database")
		const previous = createActivePlan(leftover)
		const completedCall: PlanStep = {
			approvalIdentifier: "",
			attempts: 1,
			capacityUnits: 0,
			dependsOn: [],
			identifier: "stp_engineer_call",
			invocation: {
				input: {
					engineerName: "Marta Ruiz",
					engineerPhone: "+34600000000",
					engineerRole: "Platform on-call engineer",
					purpose: "Request permission",
					questions: [
						{
							key: "traffic-failover-authorized",
							question: "Authorize failover?",
						},
					],
				},
				name: "call_engineer",
			},
			order: 1,
			owner: { kind: "engineer", name: "Marta Ruiz" },
			reason: "Call the engineer",
			requiresApproval: false,
			resultSummary: "Authorized",
			serviceIdentifier: "",
			status: "completed",
			statusReason: "Completed",
			title: "Call engineer",
			toolCallIdentifier: "tool_call",
			updatedAt: leftover.updatedAt,
		}
		const previousPlan: PlanRecord = {
			...previous,
			capacity: {
				...previous.capacity,
				assumedCapacity: 4,
				plannedUnits: 4,
				remainingUnits: 0,
				resourceIdentifier: "backup-oman",
				totalCapacity: 4,
			},
			steps: [
				completedCall,
				{
					...createExecuteStep(leftover, "orders-database", 2),
					attempts: 1,
					status: "completed",
					statusReason: "Completed",
					toolCallIdentifier: "tool_execute",
				},
				{
					approvalIdentifier: "",
					attempts: 1,
					capacityUnits: 0,
					dependsOn: ["stp_orders-database_execute"],
					identifier: "stp_orders-database_verify",
					invocation: {
						input: {
							recoveryActionIdentifier: "",
							serviceIdentifier: "orders-database",
						},
						name: "verify_recovery",
					},
					order: 3,
					owner: { kind: "agent", name: "Casa Pepe agent" },
					reason: "Verify the failover",
					requiresApproval: false,
					resultSummary: "Healthy",
					serviceIdentifier: "orders-database",
					status: "completed",
					statusReason: "Completed",
					title: "Verify database",
					toolCallIdentifier: "tool_verify",
					updatedAt: leftover.updatedAt,
				},
			],
		}
		const state = createState(createInput(leftover, previousPlan))
		const dump = {
			assumptions: ["Oman is full and only notifications remain"],
			capacity: {
				assumedCapacity: 4,
				confirmed: false,
				plannedUnits: 4,
				postponedUnits: 1,
				remainingUnits: 0,
				resourceIdentifier: "backup-oman",
				totalCapacity: 4,
			},
			priorities: leftover.services.map((service, index) => ({
				blockedBy: [],
				businessImpact: service.businessImpact,
				capacityUnits: service.recoveryCapacityUnits,
				decision:
					service.identifier === "customer-notifications"
						? "postpone"
						: "already-healthy",
				rank: index + 1,
				reason: "Dump revision",
				score: 100 - index,
				serviceIdentifier: service.identifier,
				serviceName: service.name,
			})),
			reason: "No remaining Oman capacity",
			steps: [],
			summary: "Wait because Oman is full",
		}
		const { client, service } = createHarness(2)
		const actions = createActions(() => state)
		actions.save.mockImplementation(async (draft) => ({
			...previousPlan,
			...draft,
			identifier: "plan_repaired",
			version: 2,
		}))
		client.complete
			.mockResolvedValueOnce(
				completion([toolCall("propose_plan", dump)], "Revising."),
			)
			.mockResolvedValueOnce(
				completion([
					toolCall("wait_for_input", {
						reason: "Waiting after the repaired plan",
					}),
				]),
			)

		const outcome = await service.run(actions as unknown as LlmLoopActions)

		expect(outcome.kind).toBe("completed")
		expect(actions.save).toHaveBeenCalled()
		const saved = actions.save.mock.calls[0][0] as PlanDraft
		expect(
			saved.priorities.find(
				(priority) =>
					priority.serviceIdentifier === "customer-notifications",
			)?.decision,
		).toBe("recover-now")
		expect(saved.capacity).toMatchObject({
			plannedUnits: 9,
			remainingUnits: 3,
			resourceIdentifier: "backup-bahrain",
		})
		expect(
			saved.steps.find(
				(step) =>
					step.identifier === "stp_customer-notifications_execute",
			)?.status,
		).toBe("proposed")
	})
})
