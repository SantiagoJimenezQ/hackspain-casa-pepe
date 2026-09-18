import { ApiPropertyOptional } from "@nestjs/swagger"
import { TASK_STATUSES } from "@tasks/constants/task.constant"
import { TaskStatus } from "@tasks/types/task.type"
import { IsIn, IsOptional, IsString } from "class-validator"

export class ListTasksDTO {
	@ApiPropertyOptional({
		description: "Run identifier. Defaults to the active run",
	})
	@IsOptional()
	@IsString()
	runIdentifier?: string

	@ApiPropertyOptional({ enum: TASK_STATUSES })
	@IsOptional()
	@IsIn(TASK_STATUSES)
	status?: TaskStatus
}
