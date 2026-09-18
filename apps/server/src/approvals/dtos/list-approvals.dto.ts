import { APPROVAL_STATUSES } from "@approvals/constants/approval.constant"
import { ApprovalStatus } from "@approvals/types/approval.type"
import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsIn, IsOptional, IsString } from "class-validator"

export class ListApprovalsDTO {
	@ApiPropertyOptional({
		description: "Run identifier. Defaults to the active run",
	})
	@IsOptional()
	@IsString()
	runIdentifier?: string

	@ApiPropertyOptional({ enum: APPROVAL_STATUSES })
	@IsOptional()
	@IsIn(APPROVAL_STATUSES)
	status?: ApprovalStatus
}
