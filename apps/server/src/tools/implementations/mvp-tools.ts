import { ApprovalsService } from "@approvals/services/approvals.service"
import { ConcurrentPlanVersionException } from "@common/exceptions/domain.exception"
import { RunsService } from "@incidents/services/runs.service"
import { Injectable } from "@nestjs/common"
import { PlansService } from "@plans/services/plans.service"
import { ContactEngineerTool } from "@tools/implementations/contact-engineer.tool"
import {
	ToolContext,
	ToolExecutionResult,
	ToolInvocation,
} from "@tools/types/tool.type"

/** The run moved on before this proposal landed, so the agent reassesses instead of retrying. */
function stalePlanResult(): ToolExecutionResult {
	return {
		error: {
			code: "STALE_PLAN",
			message: "Run or previous plan no longer matches",
			retryable: false,
		},
		status: "failed",
	}
}

@Injectable()
export class GetIncidentContextTool {
	readonly name = "get_incident_context" as const
	constructor(
		private readonly runs: RunsService,
		private readonly plans: PlansService,
	) {}
	async execute(
		_input: Record<string, never>,
		context: ToolContext,
	): Promise<ToolExecutionResult> {
		const incident = await this.runs.getByRunIdentifier(
			context.runIdentifier,
		)
		const plan = await this.plans.findLatestPlan(context.runIdentifier)
		return {
			output: { incident, kind: "incident-context", plan },
			status: "succeeded",
		}
	}
}
@Injectable()
export class CallEngineerTool {
	readonly name = "call_engineer" as const
	constructor(private readonly contact: ContactEngineerTool) {}
	execute(
		input: Extract<ToolInvocation, { name: "call_engineer" }>["input"],
		context: ToolContext,
	) {
		return this.contact.execute(input, context)
	}
}
@Injectable()
export class SaveRecoveryPlanTool {
	readonly name = "save_recovery_plan" as const
	constructor(
		private readonly runs: RunsService,
		private readonly plans: PlansService,
		private readonly approvals: ApprovalsService,
	) {}
	async execute(
		input: Extract<ToolInvocation, { name: "save_recovery_plan" }>["input"],
		context: ToolContext,
	): Promise<ToolExecutionResult> {
		const incident = await this.runs.getByRunIdentifier(
			context.runIdentifier,
		)
		const previous = await this.plans.findLatestPlan(context.runIdentifier)
		if (
			!incident.active ||
			incident.runKind === "replay" ||
			incident.identifier !== context.incidentIdentifier ||
			input.runIdentifier !== context.runIdentifier ||
			input.incidentIdentifier !== context.incidentIdentifier ||
			(previous?.identifier ?? "") !== input.expectedPreviousIdentifier
		) {
			return stalePlanResult()
		}
		if (previous)
			await this.approvals.supersedePending(
				context.runIdentifier,
				`Plan revised: ${input.triggeredBy}`,
			)
		// The check above reads the latest plan; the insert is what finally settles who got the
		// version. Losing that race means the same thing as failing the check.
		try {
			const plan = await this.plans.createVersion({ ...input, previous })
			return {
				output: { kind: "recovery-plan", plan },
				status: "succeeded",
			}
		} catch (error) {
			if (error instanceof ConcurrentPlanVersionException) {
				return stalePlanResult()
			}
			throw error
		}
	}
}
