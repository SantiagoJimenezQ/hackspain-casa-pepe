import { RUNNABLE_STEP_STATUSES } from "@agent/constants/agent.constant"
import {
	SUBAGENT_LIST_LIMIT,
	SUBAGENT_MAXIMUM_TURNS,
} from "@agent/constants/subagent.constant"
import { modelVisible } from "@agent/llm/llm-state"
import { subagentStepScope } from "@agent/llm/subagent-tools"
import { LlmLoopState } from "@agent/types/llm-loop.type"
import {
	SubagentAvailableStep,
	SubagentKind,
	SubagentRequest,
} from "@agent/types/subagent.type"
import { EngineerCallRecord } from "@engineers/types/engineer.type"
import { IncidentSnapshot } from "@incidents/types/incident.type"
import { PlanRecord } from "@plans/types/plan.type"
import { ToolCallRecord } from "@tools/types/tool.type"

function listOf<Entry>(value: unknown): ReadonlyArray<Entry> {
	return Array.isArray(value) ? (value as ReadonlyArray<Entry>) : []
}

function incidentSummary(incident: IncidentSnapshot) {
	return {
		backupRegion: incident.backupRegion,
		businessImpactSummary: incident.businessImpactSummary,
		impactedAt: incident.impactedAt,
		region: incident.region,
		runIdentifier: incident.runIdentifier,
		status: incident.status,
		title: incident.title,
	}
}

function planSummary(plan: PlanRecord | null) {
	if (!plan) return null
	return {
		assumptions: plan.assumptions.slice(0, SUBAGENT_LIST_LIMIT),
		reason: plan.reason,
		status: plan.status,
		summary: plan.summary,
		version: plan.version,
	}
}

/**
 * The runnable steps a specialist may dispatch. A step outside its scope, with
 * an unmet dependency or in a non-runnable status is never offered, so the
 * specialist cannot widen its own authority by naming another identifier.
 */
export function subagentAvailableSteps(
	state: LlmLoopState,
	kind: SubagentKind,
): ReadonlyArray<SubagentAvailableStep> {
	const scope = subagentStepScope(kind)
	const plan = state.input.previousPlan
	if (!plan) return []
	if (plan.status !== "active") return []
	const completed = new Set(
		plan.steps
			.filter((step) => step.status === "completed")
			.map((step) => step.identifier),
	)
	return plan.steps
		.filter((step) =>
			scope.some((name) => name === step.invocation.name),
		)
		.filter((step) =>
			RUNNABLE_STEP_STATUSES.some((status) => status === step.status),
		)
		.filter((step) =>
			step.dependsOn.every((dependency) => completed.has(dependency)),
		)
		.map((step) => ({
			identifier: step.identifier,
			reason: step.reason,
			requiresApproval: step.requiresApproval,
			title: step.title,
			tool: step.invocation.name,
		}))
}

function callEvidence(state: LlmLoopState) {
	const calls = listOf<EngineerCallRecord>(state.evidence.calls)
	const answered = calls.flatMap((call) =>
		listOf<EngineerCallRecord["questions"][number]>(call.questions)
			.filter((question) =>
				call.result?.answers.some(
					(answer) =>
						answer.key === question.key &&
						answer.confirmed === true,
				),
			)
			.map((question) => question.question),
	)
	const open = calls.flatMap((call) =>
		call.questions
			.filter(
				(question) =>
					!call.result?.answers.some(
						(answer) =>
							answer.key === question.key &&
							answer.confirmed === true,
					),
			)
			.map((question) => ({
				callStatus: call.status,
				question: question.question,
			})),
	)
	return {
		answeredQuestions: answered.slice(-SUBAGENT_LIST_LIMIT),
		openQuestions: open.slice(-SUBAGENT_LIST_LIMIT),
	}
}

function communicationEvidence(state: LlmLoopState) {
	const toolCalls = listOf<ToolCallRecord>(state.evidence.toolCalls)
	const sent = toolCalls
		.filter(
			(toolCall) =>
				toolCall.name === "send_incident_email" ||
				toolCall.name === "publish_status_update",
		)
		.slice(-SUBAGENT_LIST_LIMIT)
		.map((toolCall) => ({
			channel: toolCall.name,
			planVersion: toolCall.planVersion,
			status: toolCall.status,
		}))
	const verified = toolCalls
		.filter((toolCall) => toolCall.name === "verify_recovery")
		.slice(-SUBAGENT_LIST_LIMIT)
		.map((toolCall) => {
			const output = toolCall.output
			if (output && output.kind === "recovery-verification")
				return {
					serviceIdentifier: output.serviceIdentifier,
					status: output.status,
					verified: output.verified,
				}
			return {
				serviceIdentifier: "",
				status: toolCall.status,
				verified: false,
			}
		})
	return { sentCommunications: sent, verifiedRecoveries: verified }
}

/**
 * The bounded slice of state one specialist needs. The commander's full
 * evidence blob, investigation memory and plan schema stay out of it, which is
 * what keeps a specialist turn small.
 */
export function subagentContext(
	request: SubagentRequest,
	turn: number,
): Record<string, unknown> {
	const { input } = request.state
	const incident = input.incident
	const shared = {
		budget: {
			remainingActions: request.remainingActions,
			remainingTurns: SUBAGENT_MAXIMUM_TURNS - turn,
		},
		incident: incidentSummary(incident),
		objective: request.objective,
	}
	switch (request.kind) {
		case "investigator":
			return modelVisible({
				...shared,
				facts: incident.facts.slice(-SUBAGENT_LIST_LIMIT).map((fact) => ({
					source: fact.source,
					statement: fact.statement,
					status: fact.status,
				})),
				plan: planSummary(input.previousPlan),
				resources: incident.resources.map((resource) => ({
					allocatedCapacity: resource.allocatedCapacity,
					confirmed: resource.confirmed,
					identifier: resource.identifier,
					name: resource.name,
					region: resource.region,
					totalCapacity: resource.totalCapacity,
					unit: resource.unit,
				})),
				services: incident.services.map((service) => ({
					businessImpact: service.businessImpact,
					dependencies: service.dependencies,
					identifier: service.identifier,
					name: service.name,
					status: service.status,
					statusReason: service.statusReason,
				})),
			}) as Record<string, unknown>
		case "caller":
			return modelVisible({
				...shared,
				...callEvidence(request.state),
				availableSteps: subagentAvailableSteps(
					request.state,
					request.kind,
				),
				briefing: {
					purpose: input.briefing.purpose,
					suggestedQuestions: input.briefing.questions.map(
						(question) => ({
							key: question.key,
							question: question.question,
						}),
					),
				},
				engineer: { name: input.engineer.name, role: input.engineer.role },
				unresolvedFacts: incident.facts
					.filter((fact) => fact.status !== "confirmed")
					.slice(-SUBAGENT_LIST_LIMIT)
					.map((fact) => fact.statement),
			}) as Record<string, unknown>
		case "communicator":
			return modelVisible({
				...shared,
				...communicationEvidence(request.state),
				availableSteps: subagentAvailableSteps(
					request.state,
					request.kind,
				),
				plan: planSummary(input.previousPlan),
				services: incident.services.map((service) => ({
					name: service.name,
					status: service.status,
				})),
			}) as Record<string, unknown>
	}
}
