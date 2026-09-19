import {
	IncidentSnapshot,
	ResourceState,
	ServiceState,
} from "@incidents/types/incident.type"
import { ServiceHealthStatus } from "@scenarios/types/scenario.type"
import {
	TOOL_CALL_STATUSES,
	TOOL_INTERACTION_KINDS,
	TOOL_NAMES,
} from "@tools/constants/tool.constant"

export type ToolName = (typeof TOOL_NAMES)[number]

export type ToolCallStatus = (typeof TOOL_CALL_STATUSES)[number]

export type ToolInteractionKind = (typeof TOOL_INTERACTION_KINDS)[number]

export interface ToolContext {
	readonly runIdentifier: string
	readonly incidentIdentifier: string
	readonly toolCallIdentifier: string
	readonly planIdentifier: string
	readonly planVersion: number
	readonly planStepIdentifier: string
	readonly decisionIdentifier: string
}

export type ContactEngineerInput =
	import("../../../../../packages/contracts/tools").CallEngineerInput
export type RequestApprovalInput =
	import("../../../../../packages/contracts/tools").RequestApprovalInput
export type ExecuteRecoveryInput =
	import("../../../../../packages/contracts/tools").ExecuteRecoveryInput
export type VerifyRecoveryInput =
	import("../../../../../packages/contracts/tools").VerifyRecoveryInput

export interface AssignTaskInput {
	readonly title: string
	readonly description: string
	readonly assigneeName: string
	readonly assigneeRole: string
	readonly priority: "critical" | "high" | "medium" | "low"
	readonly serviceIdentifier: string
}

export type ToolInvocation =
	| import("../../../../../packages/contracts/tools").MvpToolInvocation<
			Omit<import("@plans/types/plan.type").CreatePlanInput, "previous">
	  >
	| {
			readonly name: "get_incident_state"
			readonly input: Record<string, never>
	  }
	| {
			readonly name: "get_service_health"
			readonly input: Record<string, never>
	  }
	| {
			readonly name: "get_recovery_capacity"
			readonly input: Record<string, never>
	  }
	| {
			readonly name: "contact_engineer"
			readonly input: ContactEngineerInput
	  }
	| { readonly name: "assign_task"; readonly input: AssignTaskInput }
	| {
			readonly name: "read_incoming_emails"
			readonly input: {
				readonly limit?: number
				readonly emailId?: string
			}
	  }

export interface EngineerAnswer {
	readonly key: string
	readonly question: string
	readonly answer: string
	readonly confirmed?: boolean
}

export type ToolOutput =
	| import("../../../../../packages/contracts/tools").CommunicationReceipt
	| {
			readonly kind: "incident-context"
			readonly incident: IncidentSnapshot
			readonly plan: import("@plans/types/plan.type").PlanRecord | null
	  }
	| {
			readonly kind: "recovery-plan"
			readonly plan: import("@plans/types/plan.type").PlanRecord
	  }
	| { readonly kind: "incident-state"; readonly incident: IncidentSnapshot }
	| {
			readonly kind: "service-health"
			readonly services: ReadonlyArray<ServiceState>
	  }
	| {
			readonly kind: "recovery-capacity"
			readonly resources: ReadonlyArray<ResourceState>
			readonly remainingCapacity: number
			readonly confirmed: boolean
	  }
	| {
			readonly kind: "engineer-call"
			readonly engineerCallIdentifier: string
			readonly summary: string
			readonly answers: ReadonlyArray<EngineerAnswer>
			readonly mode: "simulated" | "live"
			readonly authorizations?: import("../../../../../packages/contracts/outbound-calls").EngineerCallAuthorizations
	  }
	| { readonly kind: "task"; readonly taskIdentifier: string }
	| { readonly kind: "approval"; readonly approvalIdentifier: string }
	| {
			readonly kind: "recovery-execution"
			readonly recoveryActionIdentifier: string
			readonly outcome: "success" | "partial" | "failure"
			readonly detail: string
			readonly mode: "simulated" | "http"
	  }
	| {
			readonly kind: "recovery-verification"
			readonly serviceIdentifier: string
			readonly status: ServiceHealthStatus
			readonly verified: boolean
			readonly detail: string
			readonly mode: "simulated" | "http"
	  }
	| {
			readonly kind: "inbound-emails"
			readonly emails: ReadonlyArray<Record<string, unknown>>
			readonly selected: Record<string, unknown> | null
	  }

export interface ToolError {
	readonly code: string
	readonly message: string
	readonly retryable: boolean
}

export type ToolExecutionResult =
	| { readonly status: "succeeded"; readonly output: ToolOutput }
	| { readonly status: "failed"; readonly error: ToolError }
	| { readonly status: "in-progress"; readonly externalReference: string }

export interface Tool<Invocation extends ToolInvocation = ToolInvocation> {
	readonly name: Invocation["name"]
	execute(
		input: Invocation["input"],
		context: ToolContext,
	): Promise<ToolExecutionResult>
}

export interface ToolCallRecord {
	readonly identifier: string
	readonly runIdentifier: string
	readonly incidentIdentifier: string
	readonly idempotencyKey: string
	readonly name: ToolName
	readonly interaction: ToolInteractionKind
	readonly input: Record<string, unknown>
	readonly status: ToolCallStatus
	readonly output: ToolOutput | null
	readonly error: ToolError | null
	readonly externalReference: string
	readonly simulated: boolean
	readonly attempt: number
	readonly planIdentifier: string
	readonly planVersion: number
	readonly planStepIdentifier: string
	readonly decisionIdentifier: string
	readonly startedAt: string
	readonly finishedAt: string
	readonly createdAt: string
	readonly updatedAt: string
}

export interface ExecuteToolRequest {
	readonly runIdentifier: string
	readonly incidentIdentifier: string
	readonly invocation: ToolInvocation
	readonly idempotencyKey: string
	readonly planIdentifier: string
	readonly planVersion: number
	readonly planStepIdentifier: string
	readonly decisionIdentifier: string
	readonly attempt: number
}

export type ExecuteToolOutcome =
	| { readonly kind: "completed"; readonly toolCall: ToolCallRecord }
	| { readonly kind: "in-progress"; readonly toolCall: ToolCallRecord }
	| { readonly kind: "duplicate"; readonly toolCall: ToolCallRecord }

export interface ToolCallFinishedEvent {
	readonly toolCall: ToolCallRecord
}

export interface ToolDefinitionView {
	readonly name: ToolName
	readonly description: string
	readonly interaction: ToolInteractionKind
	readonly asynchronous: boolean
	readonly simulated: boolean
}
