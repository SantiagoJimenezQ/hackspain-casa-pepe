import { SERVICE_HEALTH_STATUSES } from "@scenarios/constants/scenario.constant"
import { ServiceHealthStatus } from "@scenarios/types/scenario.type"
import { IsIn, IsOptional, IsString } from "class-validator"

export class RecoveryEnvironmentActionResponseDTO {
	@IsIn(["accepted", "succeeded", "partial", "failed"])
	status: "accepted" | "succeeded" | "partial" | "failed"

	@IsOptional()
	@IsString()
	detail: string = ""

	@IsOptional()
	@IsString()
	reference: string = ""
}

export class RecoveryEnvironmentHealthResponseDTO {
	@IsIn(SERVICE_HEALTH_STATUSES)
	status: ServiceHealthStatus

	@IsOptional()
	@IsString()
	detail: string = ""
}
