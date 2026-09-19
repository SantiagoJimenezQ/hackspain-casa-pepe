import { Injectable } from "@nestjs/common"
import { RecoveryService } from "@recovery/services/recovery.service"
import {
	Tool,
	ToolContext,
	ToolExecutionResult,
	ToolInvocation,
} from "@tools/types/tool.type"

type CheckServicesStatusInvocation = Extract<
	ToolInvocation,
	{ name: "check_services_status" }
>

@Injectable()
export class CheckServicesStatusTool
	implements Tool<CheckServicesStatusInvocation>
{
	readonly name = "check_services_status" as const

	constructor(private readonly recoveryService: RecoveryService) {}

	async execute(
		_input: CheckServicesStatusInvocation["input"],
		context: ToolContext,
	): Promise<ToolExecutionResult> {
		const report = await this.recoveryService.checkServices(
			context.runIdentifier,
			context.incidentIdentifier,
			context.toolCallIdentifier,
		)
		return {
			output: {
				checks: report.checks,
				discrepancies: report.discrepancies,
				healthyCount: report.healthyCount,
				kind: "services-status",
				mode: report.mode,
				totalCount: report.totalCount,
			},
			status: "succeeded",
		}
	}
}
