import { RunsService } from "@incidents/services/runs.service"
import { Controller, Get, Query } from "@nestjs/common"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"
import { ListRecoveryActionsDTO } from "@recovery/dtos/list-recovery-actions.dto"
import { RecoveryService } from "@recovery/services/recovery.service"
import { RecoveryActionRecord } from "@recovery/types/recovery.type"

@ApiTags("Recovery")
@ApiSecurity("operator")
@Controller("recovery/actions")
export class RecoveryController {
	constructor(
		private readonly recoveryService: RecoveryService,
		private readonly runsService: RunsService,
	) {}

	@Get()
	@ApiOperation({
		summary:
			"Recovery actions executed in the test environment during a run",
	})
	async list(
		@Query() query: ListRecoveryActionsDTO,
	): Promise<ReadonlyArray<RecoveryActionRecord>> {
		const runIdentifier = await this.runsService.resolveRunIdentifier(
			query.runIdentifier,
		)
		return this.recoveryService.list(runIdentifier)
	}
}
