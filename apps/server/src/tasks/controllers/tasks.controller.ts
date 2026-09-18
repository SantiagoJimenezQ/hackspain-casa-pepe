import { RunsService } from "@incidents/services/runs.service"
import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"
import { ListTasksDTO } from "@tasks/dtos/list-tasks.dto"
import { UpdateTaskStatusDTO } from "@tasks/dtos/update-task-status.dto"
import { TasksService } from "@tasks/services/tasks.service"
import { TaskRecord } from "@tasks/types/task.type"

@ApiTags("Tasks")
@ApiSecurity("operator")
@Controller("tasks")
export class TasksController {
	constructor(
		private readonly tasksService: TasksService,
		private readonly runsService: RunsService,
	) {}

	@Get()
	@ApiOperation({
		summary: "Tasks created by the agent with owner and status",
	})
	async list(
		@Query() query: ListTasksDTO,
	): Promise<ReadonlyArray<TaskRecord>> {
		const runIdentifier = await this.runsService.resolveRunIdentifier(
			query.runIdentifier,
		)
		return this.tasksService.list(runIdentifier, query.status)
	}

	@Patch(":identifier/status")
	@ApiOperation({
		summary: "Update the status of a task on behalf of its owner",
	})
	updateStatus(
		@Param("identifier") identifier: string,
		@Body() body: UpdateTaskStatusDTO,
	): Promise<TaskRecord> {
		return this.tasksService.updateStatus(
			identifier,
			body.status,
			body.note,
			body.updatedBy,
		)
	}
}
