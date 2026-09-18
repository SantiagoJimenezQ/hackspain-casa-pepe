import { APPROVAL_DECISIONS } from "@approvals/constants/approval.constant"
import { ApprovalDecision } from "@approvals/types/approval.type"
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator"

export class DecideApprovalDTO {
	@ApiProperty({ enum: APPROVAL_DECISIONS })
	@IsIn(APPROVAL_DECISIONS)
	decision: ApprovalDecision

	@ApiPropertyOptional({ default: "Operator" })
	@IsOptional()
	@IsString()
	@MaxLength(120)
	operatorName: string = "Operator"

	@ApiPropertyOptional({ default: "" })
	@IsOptional()
	@IsString()
	@MaxLength(1000)
	comment: string = ""
}
