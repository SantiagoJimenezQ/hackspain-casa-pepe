import { nearbyRegions } from "@incidents/helpers/geography.helper"
import {
	remainingCapacity,
	selectBackupResource,
} from "@incidents/helpers/incident-state.helper"
import { RunsService } from "@incidents/services/runs.service"
import { Injectable } from "@nestjs/common"
import {
	Tool,
	ToolContext,
	ToolExecutionResult,
	ToolInvocation,
} from "@tools/types/tool.type"

type GetIncidentStateInvocation = Extract<
	ToolInvocation,
	{ name: "get_incident_state" }
>
type GetServiceHealthInvocation = Extract<
	ToolInvocation,
	{ name: "get_service_health" }
>
type GetRecoveryCapacityInvocation = Extract<
	ToolInvocation,
	{ name: "get_recovery_capacity" }
>

@Injectable()
export class GetIncidentStateTool implements Tool<GetIncidentStateInvocation> {
	readonly name = "get_incident_state" as const

	constructor(private readonly runsService: RunsService) {}

	async execute(
		_input: GetIncidentStateInvocation["input"],
		context: ToolContext,
	): Promise<ToolExecutionResult> {
		const incident = await this.runsService.getByRunIdentifier(
			context.runIdentifier,
		)
		return {
			output: { incident, kind: "incident-state" },
			status: "succeeded",
		}
	}
}

@Injectable()
export class GetServiceHealthTool implements Tool<GetServiceHealthInvocation> {
	readonly name = "get_service_health" as const

	constructor(private readonly runsService: RunsService) {}

	async execute(
		_input: GetServiceHealthInvocation["input"],
		context: ToolContext,
	): Promise<ToolExecutionResult> {
		const incident = await this.runsService.getByRunIdentifier(
			context.runIdentifier,
		)
		return {
			output: { kind: "service-health", services: incident.services },
			status: "succeeded",
		}
	}
}

@Injectable()
export class GetRecoveryCapacityTool
	implements Tool<GetRecoveryCapacityInvocation>
{
	readonly name = "get_recovery_capacity" as const

	constructor(private readonly runsService: RunsService) {}

	async execute(
		_input: GetRecoveryCapacityInvocation["input"],
		context: ToolContext,
	): Promise<ToolExecutionResult> {
		const incident = await this.runsService.getByRunIdentifier(
			context.runIdentifier,
		)
		const selected = selectBackupResource(incident)
		const remaining = remainingCapacity(selected)
		return {
			output: {
				confirmed: selected.confirmed,
				kind: "recovery-capacity",
				nearbyRegions: nearbyRegions(incident),
				remainingCapacity: remaining,
				resources: incident.resources,
			},
			status: "succeeded",
		}
	}
}
