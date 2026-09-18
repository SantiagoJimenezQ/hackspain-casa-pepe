import { EngineersService } from "@engineers/services/engineers.service"
import { IncidentsService } from "@incidents/services/incidents.service"
import { RunsService } from "@incidents/services/runs.service"
import { Injectable } from "@nestjs/common"
import {
	Tool,
	ToolContext,
	ToolExecutionResult,
	ToolInvocation,
} from "@tools/types/tool.type"

type ContactEngineerInvocation = Extract<
	ToolInvocation,
	{ name: "contact_engineer" }
>

@Injectable()
export class ContactEngineerTool implements Tool<ContactEngineerInvocation> {
	readonly name = "contact_engineer" as const

	constructor(
		private readonly engineersService: EngineersService,
		private readonly runsService: RunsService,
		private readonly incidentsService: IncidentsService,
	) {}

	async execute(
		input: ContactEngineerInvocation["input"],
		context: ToolContext,
	): Promise<ToolExecutionResult> {
		const incident = await this.runsService.getByRunIdentifier(
			context.runIdentifier,
		)
		const scenario = this.incidentsService.getScenario(
			incident.scenarioIdentifier,
		)
		const answersByKey: Record<string, string> = Object.fromEntries(
			scenario.engineerBriefing.questions.map((question) => [
				question.key,
				question.simulatedAnswer,
			]),
		)
		const call = await this.engineersService.startCall({
			engineer: {
				name: input.engineerName,
				phone: input.engineerPhone,
				role: input.engineerRole,
			},
			incidentIdentifier: context.incidentIdentifier,
			planStepIdentifier: context.planStepIdentifier,
			purpose: input.purpose,
			questions: input.questions,
			runIdentifier: context.runIdentifier,
			simulatedScript: {
				answersByKey,
				summary: scenario.engineerBriefing.simulatedSummary,
			},
			toolCallIdentifier: context.toolCallIdentifier,
		})
		switch (call.status) {
			case "dialing":
			case "in-progress":
				return {
					externalReference: call.identifier,
					status: "in-progress",
				}
			case "completed":
				return {
					output: {
						answers: call.result ? call.result.answers : [],
						engineerCallIdentifier: call.identifier,
						kind: "engineer-call",
						mode: call.mode,
						summary: call.result ? call.result.summary : "",
					},
					status: "succeeded",
				}
			case "failed":
			case "no-answer":
				return {
					error: {
						code: "CALL_FAILED",
						message: call.failureReason,
						retryable: true,
					},
					status: "failed",
				}
		}
	}
}
