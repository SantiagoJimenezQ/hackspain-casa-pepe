import { ApprovalsService } from "@approvals/services/approvals.service"
import { IncomingCallsService } from "@engineers/services/incoming-calls.service"
import { RunsService } from "@incidents/services/runs.service"
import { Injectable } from "@nestjs/common"
import { PlansService } from "@plans/services/plans.service"
import { RecoveryService } from "@recovery/services/recovery.service"
import {
	Tool,
	ToolContext,
	ToolExecutionResult,
	ToolInvocation,
} from "@tools/types/tool.type"

type ExecuteRecoveryInvocation = Extract<
	ToolInvocation,
	{ name: "execute_recovery" }
>
type VerifyRecoveryInvocation = Extract<
	ToolInvocation,
	{ name: "verify_recovery" }
>

@Injectable()
export class ExecuteRecoveryTool implements Tool<ExecuteRecoveryInvocation> {
	readonly name = "execute_recovery" as const

	constructor(
		private readonly recoveryService: RecoveryService,
		private readonly approvalsService: ApprovalsService,
		private readonly runs: RunsService,
		private readonly plans: PlansService,
		private readonly incomingCalls: IncomingCallsService,
	) {}

	async execute(
		input: ExecuteRecoveryInvocation["input"],
		context: ToolContext,
	): Promise<ToolExecutionResult> {
		if (
			(await this.incomingCalls.list(context.runIdentifier)).some(
				(call) => call.status === "pending",
			)
		)
			return {
				error: {
					code: "UNCONFIRMED_CAPACITY",
					message:
						"Confirm the incoming capacity report before recovery",
					retryable: false,
				},
				status: "failed",
			}
		const incident = await this.runs.getByRunIdentifier(
			context.runIdentifier,
		)
		const plan = await this.plans.findActivePlan(context.runIdentifier)
		const service = incident.services.find(
			(s) => s.identifier === input.serviceIdentifier,
		)
		const step = plan?.steps.find(
			(s) => s.identifier === context.planStepIdentifier,
		)
		if (
			!incident.active ||
			incident.runKind === "replay" ||
			incident.identifier !== context.incidentIdentifier ||
			!plan ||
			plan.identifier !== context.planIdentifier ||
			plan.version !== context.planVersion ||
			!service ||
			!step ||
			step.serviceIdentifier !== service.identifier ||
			!["proposed", "approved"].includes(step.status) ||
			input.capacityUnits !== service.recoveryCapacityUnits ||
			input.actionKind !== service.recoveryActionKind ||
			input.resourceIdentifier !== plan.capacity.resourceIdentifier ||
			service.dependencies.some(
				(id) =>
					incident.services.find((s) => s.identifier === id)
						?.status !== "healthy",
			)
		) {
			return {
				error: {
					code: "RECOVERY_PRECONDITION_FAILED",
					message:
						"Recovery does not match the active plan, service requirements or healthy dependencies",
					retryable: false,
				},
				status: "failed",
			}
		}
		if (
			(service.recoveryRequiresApproval || step.requiresApproval) &&
			!input.approvalIdentifier
		)
			return {
				error: {
					code: "APPROVAL_REQUIRED",
					message: "This recovery requires operator approval",
					retryable: false,
				},
				status: "failed",
			}
		if (input.approvalIdentifier) {
			const approval = await this.approvalsService.getByIdentifier(
				input.approvalIdentifier,
			)
			if (
				approval.runIdentifier !== context.runIdentifier ||
				approval.planVersion !== context.planVersion ||
				approval.planStepIdentifier !== context.planStepIdentifier ||
				approval.serviceIdentifier !== service.identifier ||
				approval.capacityUnits !== input.capacityUnits
			)
				return {
					error: {
						code: "APPROVAL_INVALID",
						message:
							"Approval does not authorize this specific action",
						retryable: false,
					},
					status: "failed",
				}

			const approved = await this.approvalsService.isApproved(
				input.approvalIdentifier,
				context.planIdentifier,
			)
			if (!approved) {
				return {
					error: {
						code: "APPROVAL_INVALID",
						message:
							"The approval is missing, rejected or belongs to another plan version",
						retryable: false,
					},
					status: "failed",
				}
			}
		}
		const outcome = await this.recoveryService.execute({
			actionDescription: input.actionDescription,
			actionKind: input.actionKind,
			approvalIdentifier: input.approvalIdentifier,
			capacityUnits: input.capacityUnits,
			incidentIdentifier: context.incidentIdentifier,
			planStepIdentifier: context.planStepIdentifier,
			resourceIdentifier: input.resourceIdentifier,
			runIdentifier: context.runIdentifier,
			serviceIdentifier: input.serviceIdentifier,
			toolCallIdentifier: context.toolCallIdentifier,
		})
		switch (outcome.kind) {
			case "rejected":
				return {
					error: {
						code: outcome.code,
						message: outcome.message,
						retryable: false,
					},
					status: "failed",
				}
			case "in-progress":
				return {
					externalReference: outcome.action.identifier,
					status: "in-progress",
				}
			case "finished": {
				const result = outcome.action.result
				if (!result) {
					return {
						error: {
							code: "EXECUTION_FAILED",
							message:
								"The recovery action finished without a result",
							retryable: true,
						},
						status: "failed",
					}
				}
				return {
					output: {
						detail: result.detail,
						kind: "recovery-execution",
						mode: outcome.action.mode,
						outcome: result.outcome,
						recoveryActionIdentifier: outcome.action.identifier,
					},
					status: "succeeded",
				}
			}
		}
	}
}

@Injectable()
export class VerifyRecoveryTool implements Tool<VerifyRecoveryInvocation> {
	readonly name = "verify_recovery" as const

	constructor(private readonly recoveryService: RecoveryService) {}

	async execute(
		input: VerifyRecoveryInvocation["input"],
		context: ToolContext,
	): Promise<ToolExecutionResult> {
		const verification = await this.recoveryService.verify(
			context.runIdentifier,
			context.incidentIdentifier,
			input.serviceIdentifier,
			input.recoveryActionIdentifier,
			context.toolCallIdentifier,
		)
		return {
			output: {
				detail: verification.detail,
				kind: "recovery-verification",
				mode: verification.mode,
				serviceIdentifier: verification.serviceIdentifier,
				status: verification.status,
				verified: verification.verified,
			},
			status: "succeeded",
		}
	}
}
