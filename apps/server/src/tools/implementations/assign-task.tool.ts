import { Injectable } from "@nestjs/common"
import { PLAN_STEP_OWNER_AGENT } from "@plans/constants/plan.constant"
import { TasksService } from "@tasks/services/tasks.service"
import {
	Tool,
	ToolContext,
	ToolExecutionResult,
	ToolInvocation,
} from "@tools/types/tool.type"

type AssignTaskInvocation = Extract<ToolInvocation, { name: "assign_task" }>

@Injectable()
export class AssignTaskTool implements Tool<AssignTaskInvocation> {
	readonly name = "assign_task" as const

	constructor(private readonly tasksService: TasksService) {}

	async execute(
		input: AssignTaskInvocation["input"],
		context: ToolContext,
	): Promise<ToolExecutionResult> {
		const task = await this.tasksService.create({
			assignee: { name: input.assigneeName, role: input.assigneeRole },
			createdBy: { kind: "agent", name: PLAN_STEP_OWNER_AGENT },
			description: input.description,
			incidentIdentifier: context.incidentIdentifier,
			planIdentifier: context.planIdentifier,
			planStepIdentifier: context.planStepIdentifier,
			priority: input.priority,
			runIdentifier: context.runIdentifier,
			serviceIdentifier: input.serviceIdentifier,
			title: input.title,
			toolCallIdentifier: context.toolCallIdentifier,
		})
		return {
			output: { kind: "task", taskIdentifier: task.identifier },
			status: "succeeded",
		}
	}
}
