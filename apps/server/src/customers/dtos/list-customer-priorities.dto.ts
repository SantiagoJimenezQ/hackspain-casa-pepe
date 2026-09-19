import { CUSTOMER_PRIORITY_MODES } from "@customers/constants/customer-priority.constant"
import { CustomerPriorityMode } from "@customers/types/customer-priority.type"
import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsIn, IsOptional, IsString } from "class-validator"

export class ListCustomerPrioritiesDTO {
	@ApiPropertyOptional({
		description: "Run identifier. Defaults to the active run",
	})
	@IsOptional()
	@IsString()
	runIdentifier?: string

	@ApiPropertyOptional({
		description:
			"deterministic (default) returns the scored order; llm asks the fast model to confirm or reorder it with a justification, cached until the incident changes",
		enum: CUSTOMER_PRIORITY_MODES,
	})
	@IsOptional()
	@IsIn(CUSTOMER_PRIORITY_MODES)
	mode: CustomerPriorityMode = "deterministic"
}
