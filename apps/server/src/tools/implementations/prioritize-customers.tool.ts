import { CustomerPrioritiesService } from "@customers/services/customer-priorities.service"
import { Injectable } from "@nestjs/common"
import {
	Tool,
	ToolContext,
	ToolExecutionResult,
	ToolInvocation,
} from "@tools/types/tool.type"

type PrioritizeCustomersInvocation = Extract<
	ToolInvocation,
	{ name: "prioritize_customers" }
>

@Injectable()
export class PrioritizeCustomersTool
	implements Tool<PrioritizeCustomersInvocation>
{
	readonly name = "prioritize_customers" as const

	constructor(private readonly priorities: CustomerPrioritiesService) {}

	async execute(
		_input: PrioritizeCustomersInvocation["input"],
		context: ToolContext,
	): Promise<ToolExecutionResult> {
		const report = await this.priorities.prioritize(context.runIdentifier)
		return {
			output: {
				criteria: report.criteria,
				customers: report.customers,
				generatedAt: report.generatedAt,
				kind: "customer-priorities",
			},
			status: "succeeded",
		}
	}
}
