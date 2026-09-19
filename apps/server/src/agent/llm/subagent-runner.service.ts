import { randomUUID } from "node:crypto"
import { ActivityService } from "@activity/services/activity.service"
import {
	SUBAGENT_INBOX_LIMIT,
	SUBAGENT_MAXIMUM_TURNS,
	SUBAGENT_PROMPTS,
	SUBAGENT_TITLES,
} from "@agent/constants/subagent.constant"
import { LlmMessage } from "@agent/llm/llm.types"
import { LlmClientError, LlmClientService } from "@agent/llm/llm-client.service"
import { argumentDiagnostics } from "@agent/llm/llm-context"
import { modelVisible } from "@agent/llm/llm-state"
import {
	subagentAvailableSteps,
	subagentContext,
} from "@agent/llm/subagent-context"
import {
	parseDispatchIdentifier,
	parseSubagentReport,
	requireEmptyArguments,
	SubagentArgumentsError,
	subagentCorrectionFor,
	subagentToolDefinitions,
} from "@agent/llm/subagent-tools"
import { LlmLoopActions, LlmLoopState } from "@agent/types/llm-loop.type"
import {
	SubagentOutcome,
	SubagentRequest,
} from "@agent/types/subagent.type"
import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import { Injectable, Logger } from "@nestjs/common"
import { ToolInvocation } from "@tools/types/tool.type"

const HISTORY_LIMIT = 6

type SubagentActivityType =
	| "agent.llm-decision"
	| "agent.llm-rejected"
	| "agent.llm-failed"
	| "agent.limit-reached"

function readInvocation(name: string): ToolInvocation {
	switch (name) {
		case "get_incident_context":
			return { input: {}, name: "get_incident_context" }
		case "get_service_health":
			return { input: {}, name: "get_service_health" }
		case "get_recovery_capacity":
			return { input: {}, name: "get_recovery_capacity" }
		case "check_services_status":
			return { input: {}, name: "check_services_status" }
		case "prioritize_customers":
			return { input: {}, name: "prioritize_customers" }
		case "read_incoming_emails":
			return {
				input: { limit: SUBAGENT_INBOX_LIMIT },
				name: "read_incoming_emails",
			}
		default:
			throw new SubagentArgumentsError(
				"Unknown tool; use one of the declared tools",
			)
	}
}

/**
 * Runs one specialist against a single objective with its own short prompt, its
 * own tool subset and a bounded slice of state. The commander never sees the raw
 * tool output, only the specialist's report, which is what keeps a commander
 * turn small as the incident grows.
 */
@Injectable()
export class SubagentRunnerService {
	private readonly logger = new Logger(SubagentRunnerService.name)

	constructor(
		private readonly client: LlmClientService,
		private readonly activity: ActivityService,
	) {}

	async run(
		request: SubagentRequest,
		actions: LlmLoopActions,
	): Promise<SubagentOutcome> {
		const { kind } = request
		const definitions = subagentToolDefinitions(kind)
		const history: LlmMessage[] = []
		let executedSteps = 0
		this.logger.log(LOG_MESSAGES.SUBAGENTS.DELEGATION_STARTED, {
			runIdentifier: request.state.input.incident.runIdentifier,
			specialist: kind,
		})
		for (let turn = 0; turn < SUBAGENT_MAXIMUM_TURNS; turn++) {
			const messages: LlmMessage[] = [
				{ content: SUBAGENT_PROMPTS[kind], role: "system" },
				...history,
				{
					content: JSON.stringify(subagentContext(request, turn)),
					role: "user",
				},
			]
			let response: Awaited<ReturnType<LlmClientService["complete"]>>
			try {
				response = await this.client.complete(messages, definitions)
			} catch (error) {
				const detail =
					error instanceof LlmClientError
						? error.message
						: "LLM unavailable"
				this.logger.warn(LOG_MESSAGES.SUBAGENTS.DELEGATION_FAILED, {
					specialist: kind,
				})
				await this.record(
					request,
					"agent.llm-failed",
					"unavailable",
					`${detail}. The specialist returned no result; the commander decides how to continue.`,
					{ turn },
				)
				return {
					executedSteps,
					kind: "failed",
					reason: detail,
					specialist: kind,
				}
			}
			const calls = response.message.tool_calls ?? []
			await this.record(
				request,
				"agent.llm-decision",
				"decision",
				response.message.content?.slice(0, 1000) ||
					"Selecting the next specialist action",
				{
					model: response.model,
					outputIdentifier: randomUUID(),
					tools: calls.map((call) =>
						safeToolName(definitions, call.function.name),
					),
					turn,
					usage: response.usage,
				},
			)
			if (calls.length !== 1) {
				history.push({
					content:
						"Invalid response: return exactly one declared tool call.",
					role: "user",
				})
				continue
			}
			const call = calls[0]
			let result: unknown
			try {
				const args = parseArguments(call.function.arguments)
				if (call.function.name === "report_result") {
					const report = parseSubagentReport(args)
					this.logger.log(
						LOG_MESSAGES.SUBAGENTS.DELEGATION_FINISHED,
						{ executedSteps, specialist: kind },
					)
					return {
						executedSteps,
						kind: "reported",
						report,
						specialist: kind,
					}
				}
				if (call.function.name === "dispatch_step") {
					const identifier = parseDispatchIdentifier(args)
					this.requireDispatchable(request, identifier, executedSteps)
					result = await actions.execute(identifier, request.state)
					executedSteps++
				} else {
					requireEmptyArguments(args)
					result = await actions.investigate(
						readInvocation(call.function.name),
					)
				}
			} catch (error) {
				result = {
					argumentDiagnostics: argumentDiagnostics(
						call.function.arguments,
					),
					correction: subagentCorrectionFor(kind, call.function.name),
					error:
						error instanceof SubagentArgumentsError
							? error.message
							: "The action failed or the state changed before dispatch. Reassess and report what you know.",
				}
				await this.record(
					request,
					"agent.llm-rejected",
					"action rejected",
					"The specialist action did not pass runtime validation and was not performed.",
					{
						result,
						tool: safeToolName(definitions, call.function.name),
					},
				)
			}
			history.push(
				{
					...response.message,
					content: response.message.content?.slice(0, 1000) ?? null,
				},
				{
					content: JSON.stringify(modelVisible(result)),
					role: "tool",
					tool_call_id: call.id,
				},
			)
			if (history.length > HISTORY_LIMIT)
				history.splice(0, history.length - HISTORY_LIMIT)
			while (history[0]?.role === "tool") history.shift()
		}
		this.logger.warn(LOG_MESSAGES.SUBAGENTS.TURN_LIMIT_REACHED, {
			specialist: kind,
		})
		await this.record(
			request,
			"agent.limit-reached",
			"turn limit reached",
			"The specialist reached its turn budget without reporting a result.",
			{ executedSteps },
		)
		return {
			executedSteps,
			kind: "exhausted",
			reason: "Specialist turn budget reached without a report",
			specialist: kind,
		}
	}

	private requireDispatchable(
		request: SubagentRequest,
		identifier: string,
		executedSteps: number,
	): void {
		if (executedSteps >= request.remainingActions)
			throw new SubagentArgumentsError(
				"Action budget reached; report what you know instead of dispatching",
			)
		const available = subagentAvailableSteps(request.state, request.kind)
		if (!available.some((step) => step.identifier === identifier)) {
			this.logger.warn(LOG_MESSAGES.SUBAGENTS.DISPATCH_OUT_OF_SCOPE, {
				specialist: request.kind,
			})
			throw new SubagentArgumentsError(
				"That step is not in availableSteps; dispatch only a listed runnable step of your own scope",
			)
		}
	}

	private record(
		request: SubagentRequest,
		type: SubagentActivityType,
		title: string,
		summary: string,
		payload: Record<string, unknown>,
	) {
		const state: LlmLoopState = request.state
		return this.activity.record({
			correlation: {
				planIdentifier: state.input.previousPlan?.identifier,
				planVersion: state.input.previousPlan?.version,
			},
			incidentIdentifier: state.input.incident.identifier,
			payload: {
				...payload,
				objective: request.objective.slice(0, 600),
				subagent: request.kind,
			},
			runIdentifier: state.input.incident.runIdentifier,
			simulated: false,
			source: "agent",
			summary,
			title: `${SUBAGENT_TITLES[request.kind]}: ${title}`,
			type,
		})
	}
}

function parseArguments(raw: string): unknown {
	try {
		return JSON.parse(raw)
	} catch {
		throw new SubagentArgumentsError("Arguments must be valid JSON.")
	}
}

function safeToolName(
	definitions: ReadonlyArray<{ function: { name: string } }>,
	name: string,
): string {
	return definitions.some((definition) => definition.function.name === name)
		? name
		: "[unknown-tool]"
}
