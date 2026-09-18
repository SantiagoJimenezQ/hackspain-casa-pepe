import {
	FACT_STATUSES,
	HARNESS_EVENT_TYPES,
} from "@incidents/constants/incident.constant"
import {
	FactStatus,
	HarnessEvent,
	HarnessEventType,
} from "@incidents/types/incident.type"
import { BadRequestException } from "@nestjs/common"
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { SERVICE_HEALTH_STATUSES } from "@scenarios/constants/scenario.constant"
import { ServiceHealthStatus } from "@scenarios/types/scenario.type"
import {
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	Min,
	ValidateIf,
} from "class-validator"

export class InjectHarnessEventDTO {
	@ApiProperty({ enum: HARNESS_EVENT_TYPES })
	@IsIn(HARNESS_EVENT_TYPES)
	type: HarnessEventType

	@ApiPropertyOptional({
		description:
			"capacity-limited: units really available in the backup region",
	})
	@ValidateIf((dto: InjectHarnessEventDTO) => dto.type === "capacity-limited")
	@IsInt()
	@Min(0)
	availableCapacity?: number

	@ApiPropertyOptional({
		description: "Human readable reason shown to the operator",
	})
	@IsOptional()
	@IsString()
	reason: string = "Introduced from the demo controls"

	@ApiPropertyOptional({
		description: "service-health-changed: affected service",
	})
	@ValidateIf(
		(dto: InjectHarnessEventDTO) => dto.type === "service-health-changed",
	)
	@IsString()
	serviceIdentifier?: string

	@ApiPropertyOptional({
		description: "service-health-changed: new status",
		enum: SERVICE_HEALTH_STATUSES,
	})
	@ValidateIf(
		(dto: InjectHarnessEventDTO) => dto.type === "service-health-changed",
	)
	@IsIn(SERVICE_HEALTH_STATUSES)
	status?: ServiceHealthStatus

	@ApiPropertyOptional({ description: "fact-reported: statement" })
	@ValidateIf((dto: InjectHarnessEventDTO) => dto.type === "fact-reported")
	@IsString()
	statement?: string

	@ApiPropertyOptional({
		description: "fact-reported: status of the fact",
		enum: FACT_STATUSES,
	})
	@ValidateIf((dto: InjectHarnessEventDTO) => dto.type === "fact-reported")
	@IsIn(FACT_STATUSES)
	factStatus?: FactStatus

	@ApiPropertyOptional({ description: "fact-reported: who reported it" })
	@IsOptional()
	@IsString()
	source: string = "Demo controls"
}

function requireField<Value>(
	value: Value | undefined,
	fieldName: string,
): Value {
	if (value === undefined) {
		throw new BadRequestException(
			`${fieldName} is required for this event type`,
		)
	}
	return value
}

export function toHarnessEvent(dto: InjectHarnessEventDTO): HarnessEvent {
	switch (dto.type) {
		case "meteorite-impact":
			return { type: "meteorite-impact" }
		case "capacity-limited":
			return {
				availableCapacity: requireField(
					dto.availableCapacity,
					"availableCapacity",
				),
				reason: dto.reason,
				type: "capacity-limited",
			}
		case "service-health-changed":
			return {
				reason: dto.reason,
				serviceIdentifier: requireField(
					dto.serviceIdentifier,
					"serviceIdentifier",
				),
				status: requireField(dto.status, "status"),
				type: "service-health-changed",
			}
		case "fact-reported":
			return {
				source: dto.source,
				statement: requireField(dto.statement, "statement"),
				status: requireField(dto.factStatus, "factStatus"),
				type: "fact-reported",
			}
	}
}
