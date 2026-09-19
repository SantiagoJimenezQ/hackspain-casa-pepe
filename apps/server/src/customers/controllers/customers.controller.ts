import { ListCustomerPrioritiesDTO } from "@customers/dtos/list-customer-priorities.dto"
import { CustomerPrioritiesService } from "@customers/services/customer-priorities.service"
import { CustomerPriorityReport } from "@customers/types/customer-priority.type"
import { RunsService } from "@incidents/services/runs.service"
import { Controller, Get, Query } from "@nestjs/common"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"

@ApiTags("Customers")
@ApiSecurity("operator")
@Controller("customers")
export class CustomersController {
	constructor(
		private readonly priorities: CustomerPrioritiesService,
		private readonly runsService: RunsService,
	) {}

	@Get("priorities")
	@ApiOperation({
		summary:
			"Customers ranked by recovery priority with their unavailable services, recovery progress and the criteria applied",
	})
	async listPriorities(
		@Query() query: ListCustomerPrioritiesDTO,
	): Promise<CustomerPriorityReport> {
		const runIdentifier = await this.runsService.resolveRunIdentifier(
			query.runIdentifier,
		)
		return this.priorities.prioritize(runIdentifier, query.mode)
	}
}
