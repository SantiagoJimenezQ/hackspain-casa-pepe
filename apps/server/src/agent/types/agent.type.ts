import { ActivityRecord } from "@activity/types/activity.type"
import { AGENT_TRIGGER_KINDS } from "@agent/constants/agent.constant"
import { ApprovalRecord } from "@approvals/types/approval.type"
import {
	EngineerCallMode,
	RecoveryMode,
} from "@common/types/configuration.type"
import {
	EngineerCallRecord,
	EngineerContact,
} from "@engineers/types/engineer.type"
import { IncidentSnapshot } from "@incidents/types/incident.type"
import {
	CapacityAllocationPlan,
	PlanRecord,
	PlanStep,
	ServicePriority,
} from "@plans/types/plan.type"
import {
	ScenarioEngineerBriefing,
	ScenarioLanguage,
	ScenarioSupportContact,
} from "@scenarios/types/scenario.type"
import { TaskRecord } from "@tasks/types/task.type"
import { ToolCallRecord, ToolDefinitionView } from "@tools/types/tool.type"
import type {
	DeliveryProbeResult,
	PlanComparison,
} from "../../../../../packages/contracts/demo-controls"

export type AgentTriggerKind = (typeof AGENT_TRIGGER_KINDS)[number]

export type AgentTrigger =
	| {
			readonly kind: "impact-detected"
			readonly harnessEventIdentifier: string
	  }
	| {
			readonly kind: "conditions-changed"
			readonly harnessEventIdentifier: string
			readonly description: string
	  }
	| {
			readonly kind: "tool-call-finished"
			readonly toolCallIdentifier: string
	  }
	| { readonly kind: "approval-decided"; readonly approvalIdentifier: string }
	| { readonly kind: "timeouts-expired"; readonly description: string }
	| { readonly kind: "operator-requested"; readonly operatorName: string }
	| { readonly kind: "follow-up" }

export interface ServiceConstraint {
	readonly serviceIdentifier: string
	readonly reason: string
}

export interface CapacityAssumption {
	readonly assumedCapacity: number
	readonly reportedCapacity: number
	readonly observations: number
	readonly resourceIdentifier?: string
}

export interface PlanBuildInput {
	readonly language: ScenarioLanguage
	readonly capacityAssumption: CapacityAssumption | null
	readonly incident: IncidentSnapshot
	readonly previousPlan: PlanRecord | null
	readonly rejectedServices: ReadonlyArray<ServiceConstraint>
	readonly failedServices: ReadonlyArray<ServiceConstraint>
	readonly engineer: EngineerContact
	readonly supportContact: ScenarioSupportContact
	readonly briefing: ScenarioEngineerBriefing
	readonly triggeredBy: string
	readonly maximumStepAttempts: number
}

export interface PlanDraft {
	readonly priorities: ReadonlyArray<ServicePriority>
	readonly capacity: CapacityAllocationPlan
	readonly steps: ReadonlyArray<PlanStep>
	readonly reason: string
	readonly summary: string
	readonly assumptions: ReadonlyArray<string>
}

export type CycleOutcome =
	| { readonly kind: "skipped"; readonly reason: string }
	| {
			readonly kind: "completed"
			readonly planVersion: number
			readonly executedSteps: number
			readonly waitingFor: ReadonlyArray<string>
	  }
	| { readonly kind: "limit-reached"; readonly cycles: number }
	| { readonly kind: "failed"; readonly reason: string }

export interface AgentStatus {
	readonly engine: "llm"
	readonly model: string
	readonly runIdentifier: string
	/** Language the scenario and everything the agent writes are in. */
	readonly language: ScenarioLanguage
	readonly incidentStatus: string
	readonly cycles: number
	readonly maximumCycles: number
	readonly cycleInProgress: boolean
	readonly planVersion: number
	readonly pendingApprovals: number
	readonly runningToolCalls: number
	readonly engineerCallMode: EngineerCallMode
	readonly recoveryMode: RecoveryMode
	readonly lastCycleAt: string
	readonly lastCycleOutcome: CycleOutcome | null
}

export type OverviewPlan =
	| { readonly kind: "none" }
	| { readonly kind: "plan"; readonly plan: PlanRecord }

export interface Overview {
	readonly inboundCall?: { readonly phoneNumber: string }
	readonly incident: IncidentSnapshot
	readonly deliveryProbes: ReadonlyArray<DeliveryProbeResult>
	readonly planComparison: PlanComparison | null
	readonly plan: OverviewPlan
	readonly pendingApprovals: ReadonlyArray<ApprovalRecord>
	readonly tasks: ReadonlyArray<TaskRecord>
	readonly engineerCalls: ReadonlyArray<EngineerCallRecord>
	readonly toolCalls: ReadonlyArray<ToolCallRecord>
	readonly recentActivity: ReadonlyArray<ActivityRecord>
	readonly tools: ReadonlyArray<ToolDefinitionView>
	readonly agent: AgentStatus
}

export interface CycleState {
	readonly inProgress: boolean
	readonly rerunRequested: boolean
	readonly lastCycleAt: string
	readonly lastOutcome: CycleOutcome | null
}
