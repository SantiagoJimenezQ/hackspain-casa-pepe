import { ApprovalsService } from "@approvals/services/approvals.service"
import { ConfigurationService } from "@common/services/configuration.service"
import { Injectable } from "@nestjs/common"
import {
	Tool,
	ToolContext,
	ToolExecutionResult,
	ToolInvocation,
} from "@tools/types/tool.type"

type RequestApprovalInvocation = Extract<
	ToolInvocation,
	{ name: "request_approval" }
>

@Injectable()
export class RequestApprovalTool implements Tool<RequestApprovalInvocation> {
	readonly name = "request_approval" as const

	constructor(
		private readonly approvalsService: ApprovalsService,
		private readonly configuration: ConfigurationService,
	) {}

	async execute(
		input: RequestApprovalInvocation["input"],
		context: ToolContext,
	): Promise<ToolExecutionResult> {
		const approval = await this.approvalsService.request({
			actionSummary: input.actionSummary,
			capacityUnits: input.capacityUnits,
			consequences: input.consequences,
			decisionIdentifier: context.decisionIdentifier,
			incidentIdentifier: context.incidentIdentifier,
			planIdentifier: context.planIdentifier,
			planStepIdentifier: context.planStepIdentifier,
			planVersion: context.planVersion,
			reason: input.reason,
			runIdentifier: context.runIdentifier,
			serviceIdentifier: input.serviceIdentifier,
			timeoutMilliseconds:
				this.configuration.agent.approvalTimeoutMilliseconds,
			toolCallIdentifier: context.toolCallIdentifier,
		})
		return {
			output: {
				approvalIdentifier: approval.identifier,
				kind: "approval",
			},
			status: "succeeded",
		}
	}
}
