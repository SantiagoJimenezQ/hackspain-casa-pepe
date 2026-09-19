import {
	buildPlanDraft,
	effectiveCapacity,
} from "@agent/helpers/plan-builder.helper"
import {
	LlmMessage,
	LlmToolCall,
	LlmToolDefinition,
} from "@agent/llm/llm.types"
import {
	PlanBuildInput,
	PlanDraft,
	ServiceConstraint,
} from "@agent/types/agent.type"
import { selectBackupResource } from "@incidents/helpers/incident-state.helper"
import { PlanRecord, PlanStep } from "@plans/types/plan.type"

const SCRIPTED_MODEL = "script-fixture"
const CARRIED_STATUSES = new Set<PlanStep["status"]>(["completed", "running"])

export interface ScriptedLlmState {
	readonly input: PlanBuildInput
	readonly evidence: Record<string, unknown>
	readonly blocked: boolean
}

interface ScriptedLlmBudget {
	readonly remainingTurns: number
	readonly remainingActions: number
}

interface ScriptedLlmEnvelope {
	readonly currentState: ScriptedLlmState
	readonly budget: ScriptedLlmBudget
}

export interface ScriptedLlmInvocation {
	readonly call: LlmToolCall
	readonly currentState: ScriptedLlmState
	readonly messages: ReadonlyArray<LlmMessage>
	readonly tools: ReadonlyArray<LlmToolDefinition>
}

/**
 * Adapts the deterministic plan helper into the model's tool-call contract.
 * This belongs to integration tests: production must receive an actual LLM
 * decision and validate it independently.
 */
export function buildScriptedPlanDraft(input: PlanBuildInput): PlanDraft {
	const draft = buildPlanDraft(input)
	const previousSteps = new Map(
		(input.previousPlan?.steps ?? []).map((step) => [
			step.identifier,
			step,
		]),
	)
	const identifierMap = new Map(
		draft.steps.map((step) => [
			step.identifier,
			toScriptedStepIdentifier(step.identifier),
		]),
	)
	const carriedOrderOffset = Math.max(
		0,
		...Array.from(previousSteps.values())
			.filter((step) => CARRIED_STATUSES.has(step.status))
			.map((step) => step.order),
	)

	return {
		...draft,
		steps: draft.steps
			.filter((step) => step.status !== "postponed")
			.map((step, index) => {
				const previous = previousSteps.get(step.identifier)
				if (previous && CARRIED_STATUSES.has(previous.status)) {
					return previous
				}

				const status =
					step.status === "postponed" ? "postponed" : "proposed"
				return {
					...step,
					approvalIdentifier: "",
					attempts: 0,
					dependsOn: step.dependsOn.map(
						(identifier) =>
							identifierMap.get(identifier) ?? identifier,
					),
					identifier:
						identifierMap.get(step.identifier) ?? step.identifier,
					order: carriedOrderOffset + index + 1,
					resultSummary: "",
					status,
					statusReason: step.statusReason,
					toolCallIdentifier: "",
					updatedAt: input.incident.updatedAt,
				}
			}),
	}
}

/**
 * A transparent fake for the Nest provider override used by integration
 * suites. It reads only the model-visible currentState JSON sent by the loop;
 * simulation metadata is intentionally absent and never drives a decision.
 */
export class ScriptedLlmClient {
	readonly calls: ScriptedLlmInvocation[] = []
	private callSequence = 0
	private shouldFail = false

	get model(): string {
		return SCRIPTED_MODEL
	}

	failNextCall(): void {
		this.shouldFail = true
	}

	clear(): void {
		this.calls.length = 0
		this.callSequence = 0
		this.shouldFail = false
	}

	async complete(
		messages: LlmMessage[],
		tools: LlmToolDefinition[],
	): Promise<{
		readonly message: LlmMessage
		readonly usage: { readonly scripted: true; readonly calls: number }
		readonly model: string
	}> {
		if (this.shouldFail) {
			this.shouldFail = false
			throw new Error("script-fixture provider failure")
		}

		const { budget, currentState } = readCurrentState(messages)
		const decision = chooseDecision(currentState, budget)
		const call: LlmToolCall = {
			function: {
				arguments: JSON.stringify(decision.arguments),
				name: decision.name,
			},
			id: `script-fixture-call-${++this.callSequence}`,
			type: "function",
		}
		this.calls.push({
			call,
			currentState,
			messages: messages.map((message) => ({ ...message })),
			tools: tools.map((tool) => ({ ...tool })),
		})

		return {
			message: {
				content: `script-fixture selected ${decision.name}`,
				role: "assistant",
				tool_calls: [call],
			},
			model: SCRIPTED_MODEL,
			usage: { calls: this.calls.length, scripted: true },
		}
	}
}

export function createScriptedLlmClient(): ScriptedLlmClient {
	return new ScriptedLlmClient()
}

function chooseDecision(
	state: ScriptedLlmState,
	budget: ScriptedLlmBudget,
): { readonly name: string; readonly arguments: Record<string, unknown> } {
	const { input } = state
	if (budget.remainingActions <= 0) {
		return waitDecision(input, "cycle-budget")
	}
	if (!input.previousPlan || needsRevision(input)) {
		return {
			arguments: buildScriptedPlanDraft(input) as unknown as Record<
				string,
				unknown
			>,
			name: "propose_plan",
		}
	}

	const next = nextRunnableStep(input.previousPlan)
	if (next) {
		return {
			arguments: { stepIdentifier: next.identifier },
			name: "execute_step",
		}
	}

	return waitDecision(input, "external-input")
}

function needsRevision(input: PlanBuildInput): boolean {
	const previous = input.previousPlan
	if (!previous) return true

	// The server opens every run with a plan that holds nothing but the engineer call, so the
	// first real decision is still owed: answer it with the full plan instead of waiting.
	if (
		previous.steps.every((step) => step.invocation.name === "call_engineer")
	) {
		return true
	}

	const resource = selectBackupResource(
		input.incident,
		(candidate) =>
			effectiveCapacity(candidate, input) - candidate.allocatedCapacity,
	)
	if (
		previous.capacity.resourceIdentifier !== resource.identifier ||
		previous.capacity.totalCapacity !== resource.totalCapacity ||
		previous.capacity.confirmed !== resource.confirmed
	) {
		return true
	}

	if (
		input.rejectedServices.some((constraint) =>
			constraintNeedsPlanRevision(previous, constraint),
		) ||
		input.failedServices.some((constraint) =>
			constraintNeedsPlanRevision(previous, constraint),
		)
	) {
		return true
	}

	return previous.steps.some(
		(step) =>
			step.status === "failed" &&
			step.attempts < input.maximumStepAttempts,
	)
}

function constraintNeedsPlanRevision(
	plan: PlanRecord,
	constraint: ServiceConstraint,
): boolean {
	const priority = plan.priorities.find(
		(candidate) =>
			candidate.serviceIdentifier === constraint.serviceIdentifier,
	)
	return (
		!priority ||
		priority.decision !== "postpone" ||
		!priority.reason.includes(constraint.reason)
	)
}

function nextRunnableStep(plan: PlanRecord): PlanStep | null {
	if (plan.status !== "active") return null
	const completed = new Set(
		plan.steps
			.filter((step) => step.status === "completed")
			.map((step) => step.identifier),
	)
	return (
		plan.steps.find(
			(step) =>
				(step.status === "proposed" || step.status === "approved") &&
				step.dependsOn.every((dependency) => completed.has(dependency)),
		) ?? null
	)
}

function waitDecision(
	input: PlanBuildInput,
	reason: "cycle-budget" | "external-input",
): {
	readonly name: "wait_for_input"
	readonly arguments: Record<string, unknown>
} {
	const spanish = input.language === "es"
	return {
		arguments: {
			reason:
				reason === "cycle-budget"
					? spanish
						? "Esperando al siguiente ciclo para continuar con las acciones pendientes."
						: "Waiting for the next cycle to continue the pending actions."
					: spanish
						? "Esperando una nueva evidencia o una decisión del operador."
						: "Waiting for new evidence or an operator decision.",
		},
		name: "wait_for_input",
	}
}

function readCurrentState(
	messages: ReadonlyArray<LlmMessage>,
): ScriptedLlmEnvelope {
	const latestUser = [...messages]
		.reverse()
		.find((message) => message.role === "user")
	if (!latestUser || typeof latestUser.content !== "string") {
		throw new Error("script-fixture could not find the current state")
	}

	let envelope: unknown
	try {
		envelope = JSON.parse(latestUser.content)
	} catch {
		throw new Error("script-fixture received invalid current state JSON")
	}
	if (
		!isRecord(envelope) ||
		!isRecord(envelope.currentState) ||
		!isRecord(envelope.budget)
	) {
		throw new Error("script-fixture received an incomplete current state")
	}
	const currentState = envelope.currentState
	const budget = envelope.budget
	if (
		!isRecord(currentState.input) ||
		!isRecord(currentState.evidence) ||
		typeof currentState.blocked !== "boolean" ||
		typeof budget.remainingTurns !== "number" ||
		typeof budget.remainingActions !== "number"
	) {
		throw new Error("script-fixture received an invalid current state")
	}
	return {
		budget: budget as unknown as ScriptedLlmBudget,
		currentState: currentState as unknown as ScriptedLlmState,
	}
}

function toScriptedStepIdentifier(identifier: string): string {
	if (identifier.startsWith("stp_")) return identifier
	const suffix = identifier.replace(/^step[-_]?/, "").replaceAll("-", "_")
	return `stp_${suffix}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}
