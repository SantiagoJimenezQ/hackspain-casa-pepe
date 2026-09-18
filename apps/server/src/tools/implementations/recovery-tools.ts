import { ApprovalsService } from "@approvals/services/approvals.service"
import { Injectable } from "@nestjs/common"
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
	) {}

	async execute(
		input: ExecuteRecoveryInvocation["input"],
		context: ToolContext,
	): Promise<ToolExecutionResult> {
		if (input.approvalIdentifier) {
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
