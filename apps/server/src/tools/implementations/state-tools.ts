import { remainingCapacity } from "@incidents/helpers/incident-state.helper"
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
		const remaining = incident.resources.reduce(
			(total, resource) => total + remainingCapacity(resource),
			0,
		)
		const confirmed = incident.resources.every(
			(resource) => resource.confirmed,
		)
		return {
			output: {
				confirmed,
				kind: "recovery-capacity",
				remainingCapacity: remaining,
				resources: incident.resources,
			},
			status: "succeeded",
		}
	}
}
