import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { TASK_STATUSES } from "@tasks/constants/task.constant"
import { TaskStatus } from "@tasks/types/task.type"
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator"

export class UpdateTaskStatusDTO {
	@ApiProperty({ enum: TASK_STATUSES })
	@IsIn(TASK_STATUSES)
	status: TaskStatus

	@ApiPropertyOptional({ default: "" })
	@IsOptional()
	@IsString()
	@MaxLength(1000)
	note: string = ""

	@ApiPropertyOptional({ default: "Operator" })
	@IsOptional()
	@IsString()
	@MaxLength(120)
	updatedBy: string = "Operator"
}
