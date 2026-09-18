import { DecideApprovalDTO } from "@approvals/dtos/decide-approval.dto"
import { ListApprovalsDTO } from "@approvals/dtos/list-approvals.dto"
import { ApprovalsService } from "@approvals/services/approvals.service"
import { ApprovalRecord } from "@approvals/types/approval.type"
import { RunsService } from "@incidents/services/runs.service"
import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	Post,
	Query,
} from "@nestjs/common"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"

@ApiTags("Approvals")
@ApiSecurity("operator")
@Controller("approvals")
export class ApprovalsController {
	constructor(
		private readonly approvalsService: ApprovalsService,
		private readonly runsService: RunsService,
	) {}

	@Get()
	@ApiOperation({
		summary: "Approvals of a run, optionally filtered by status",
	})
	async list(
		@Query() query: ListApprovalsDTO,
	): Promise<ReadonlyArray<ApprovalRecord>> {
		const runIdentifier = await this.runsService.resolveRunIdentifier(
			query.runIdentifier,
		)
		return this.approvalsService.list(runIdentifier, query.status)
	}

	@Get(":identifier")
	@ApiOperation({
		summary:
			"A specific approval with the action, consequences and plan version it belongs to",
	})
	getByIdentifier(
		@Param("identifier") identifier: string,
	): Promise<ApprovalRecord> {
		return this.approvalsService.getByIdentifier(identifier)
	}

	@Post(":identifier/decision")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary:
			"Approve or reject a pending action. Rejected when the plan version is no longer active",
	})
	decide(
		@Param("identifier") identifier: string,
		@Body() body: DecideApprovalDTO,
	): Promise<ApprovalRecord> {
		return this.approvalsService.decide({
			approvalIdentifier: identifier,
			comment: body.comment,
			decision: body.decision,
			operatorName: body.operatorName,
		})
	}
}
