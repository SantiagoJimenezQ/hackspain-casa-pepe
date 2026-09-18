import { ActivityService } from "@activity/services/activity.service"
import { AGENT_TICK_INTERVAL_MILLISECONDS } from "@agent/constants/agent.constant"
import { interpretAnswer } from "@agent/helpers/answer-interpretation.helper"
import {
	buildPlanDraft,
	stepIdentifierFor,
} from "@agent/helpers/plan-builder.helper"
import { AgentCycleStateService } from "@agent/services/agent-cycle-state.service"
import {
	AgentStatus,
	AgentTrigger,
	CycleOutcome,
	PlanBuildInput,
	ServiceConstraint,
} from "@agent/types/agent.type"
import { ApprovalsService } from "@approvals/services/approvals.service"
import {
	ApprovalDecidedEvent,
	ApprovalRecord,
} from "@approvals/types/approval.type"
import { DOMAIN_EVENTS } from "@common/constants/domain-events.constant"
import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import { describeError } from "@common/helpers/external-response.helper"
import { createPrefixedIdentifier } from "@common/helpers/identifier.helper"
import { ConfigurationService } from "@common/services/configuration.service"
import { EngineersService } from "@engineers/services/engineers.service"
import { IncidentsService } from "@incidents/services/incidents.service"
import { RunsService } from "@incidents/services/runs.service"
import {
	IncidentEventAppliedEvent,
	IncidentSnapshot,
} from "@incidents/types/incident.type"
import { Injectable, Logger } from "@nestjs/common"
import { OnEvent } from "@nestjs/event-emitter"
import { Interval } from "@nestjs/schedule"
import { diffPlans } from "@plans/helpers/plan-diff.helper"
import { PlansService } from "@plans/services/plans.service"
import { PlanRecord, PlanStep } from "@plans/types/plan.type"
import { RecoveryService } from "@recovery/services/recovery.service"
import { ToolsService } from "@tools/services/tools.service"
import {
	ToolCallFinishedEvent,
	ToolCallRecord,
	ToolInvocation,
} from "@tools/types/tool.type"

const RUNNABLE_STATUSES: ReadonlyArray<PlanStep["status"]> = [
	"proposed",
	"approved",
]

const OPEN_STATUSES: ReadonlyArray<PlanStep["status"]> = [
	"proposed",
	"approved",
	"awaiting-approval",
	"running",
]

@Injectable()
export class AgentService {
	private readonly logger = new Logger(AgentService.name)

	constructor(
		private readonly runsService: RunsService,
		private readonly incidentsService: IncidentsService,
		private readonly plansService: PlansService,
		private readonly approvalsService: ApprovalsService,
		private readonly toolsService: ToolsService,
		private readonly engineersService: EngineersService,
		private readonly recoveryService: RecoveryService,
		private readonly activityService: ActivityService,
		private readonly configuration: ConfigurationService,
		private readonly cycleState: AgentCycleStateService,
	) {}

	@OnEvent(DOMAIN_EVENTS.INCIDENT_EVENT_APPLIED, {
		async: true,
		promisify: true,
	})
	async onIncidentEventApplied(
		event: IncidentEventAppliedEvent,
	): Promise<void> {
		const { applied, incident } = event
		switch (applied.event.type) {
			case "meteorite-impact":
				await this.requestCycle(incident.runIdentifier, {
					harnessEventIdentifier: applied.identifier,
					kind: "impact-detected",
				})
				return
			case "capacity-limited":
				await this.requestCycle(incident.runIdentifier, {
					description: `Backup capacity confirmed at ${applied.event.availableCapacity} units: ${applied.event.reason}`,
					harnessEventIdentifier: applied.identifier,
					kind: "conditions-changed",
				})
				return
			case "service-health-changed":
				await this.requestCycle(incident.runIdentifier, {
					description: `${applied.event.serviceIdentifier} changed to ${applied.event.status}: ${applied.event.reason}`,
					harnessEventIdentifier: applied.identifier,
					kind: "conditions-changed",
				})
				return
			case "fact-reported":
				await this.requestCycle(incident.runIdentifier, {
					kind: "follow-up",
				})
				return
		}
	}

	@OnEvent(DOMAIN_EVENTS.APPROVAL_DECIDED, { async: true, promisify: true })
	async onApprovalDecided(event: ApprovalDecidedEvent): Promise<void> {
		const { approval } = event
		await this.applyApprovalDecision(approval)
		await this.requestCycle(approval.runIdentifier, {
			approvalIdentifier: approval.identifier,
			kind: "approval-decided",
		})
	}

	@OnEvent(DOMAIN_EVENTS.TOOL_CALL_FINISHED, { async: true, promisify: true })
	async onToolCallFinished(event: ToolCallFinishedEvent): Promise<void> {
		const { toolCall } = event
		const plan = await this.plansService.findActivePlan(
			toolCall.runIdentifier,
		)
		if (!plan) {
			return
		}
		const step = plan.steps.find(
			(candidate) =>
				candidate.toolCallIdentifier === toolCall.identifier &&
				candidate.status === "running",
		)
		if (!step) {
			return
		}
		const incident = await this.runsService.getByRunIdentifier(
			toolCall.runIdentifier,
		)
		await this.applyToolResult(incident, plan, step, toolCall)
		await this.requestCycle(toolCall.runIdentifier, {
			kind: "tool-call-finished",
			toolCallIdentifier: toolCall.identifier,
		})
	}

	@Interval(AGENT_TICK_INTERVAL_MILLISECONDS)
	async tick(): Promise<void> {
		const active = await this.runsService.findActiveEntity()
		if (!active) {
			return
		}
		if (
			active.runKind === "replay" ||
			active.status === "normal" ||
			active.status === "recovered" ||
			active.status === "reset"
		) {
			return
		}
		const expiredApprovals = await this.approvalsService.expireOverdue(
			active.runIdentifier,
		)
		for (const approval of expiredApprovals) {
			this.logger.warn(LOG_MESSAGES.AGENT.APPROVAL_EXPIRED, {
				approvalIdentifier: approval.identifier,
			})
			await this.applyApprovalDecision(approval)
		}
		const expiredCalls = await this.toolsService.expireRunningCalls(
			active.runIdentifier,
		)
		if (expiredApprovals.length || expiredCalls.length) {
			await this.requestCycle(active.runIdentifier, {
				description: `${expiredApprovals.length} approvals and ${expiredCalls.length} tool calls timed out`,
				kind: "timeouts-expired",
			})
		}
	}

	async requestCycle(
		runIdentifier: string,
		trigger: AgentTrigger,
	): Promise<CycleOutcome> {
		this.logger.log(LOG_MESSAGES.AGENT.TRIGGER_RECEIVED, {
			runIdentifier,
			trigger: trigger.kind,
		})
		if (!this.cycleState.tryBegin(runIdentifier)) {
			return {
				kind: "skipped",
				reason: "A cycle is already in progress, a follow-up cycle was queued",
			}
		}
		let outcome: CycleOutcome
		try {
			outcome = await this.executeCycle(runIdentifier, trigger)
		} catch (error) {
			const reason = describeError(error)
			this.logger.error(
				LOG_MESSAGES.AGENT.CYCLE_FAILED,
				error instanceof Error ? error.stack : reason,
			)
			outcome = { kind: "failed", reason }
		}
		const rerun = this.cycleState.finish(runIdentifier, outcome)
		if (rerun) {
			void this.requestCycle(runIdentifier, { kind: "follow-up" })
		}
		return outcome
	}

	async getStatus(runIdentifier: string): Promise<AgentStatus> {
		const incident =
			await this.runsService.getByRunIdentifier(runIdentifier)
		const plan = await this.plansService.findLatestPlan(runIdentifier)
		const pendingApprovals = await this.approvalsService.list(
			runIdentifier,
			"pending",
		)
		const toolCalls = await this.toolsService.list(runIdentifier)
		const state = this.cycleState.get(runIdentifier)
		return {
			cycleInProgress: state.inProgress,
			cycles: incident.agentCycles,
			engineerCallMode: this.engineersService.mode,
			incidentStatus: incident.status,
			lastCycleAt: state.lastCycleAt,
			lastCycleOutcome: state.lastOutcome,
			maximumCycles: this.configuration.agent.maximumCyclesPerRun,
			pendingApprovals: pendingApprovals.length,
			planVersion: plan ? plan.version : 0,
			recoveryMode: this.recoveryService.mode,
			runIdentifier,
			runningToolCalls: toolCalls.filter(
				(toolCall) => toolCall.status === "running",
			).length,
		}
	}

	private async executeCycle(
		runIdentifier: string,
		trigger: AgentTrigger,
	): Promise<CycleOutcome> {
		const incident =
			await this.runsService.getByRunIdentifier(runIdentifier)
		if (!incident.active) {
			this.logger.warn(LOG_MESSAGES.AGENT.CYCLE_SKIPPED_INACTIVE_RUN, {
				runIdentifier,
			})
			return { kind: "skipped", reason: "The run is no longer active" }
		}
		if (incident.runKind === "replay") {
			this.logger.log(LOG_MESSAGES.AGENT.CYCLE_SKIPPED_REPLAY, {
				runIdentifier,
			})
			return {
				kind: "skipped",
				reason: "Replays only reproduce recorded activity",
			}
		}
		if (incident.status === "normal" || incident.status === "reset") {
			return {
				kind: "skipped",
				reason: "No impact has been detected yet",
			}
		}
		const cycles =
			await this.incidentsService.incrementAgentCycles(runIdentifier)
		if (cycles > this.configuration.agent.maximumCyclesPerRun) {
			this.logger.warn(LOG_MESSAGES.AGENT.CYCLE_LIMIT_REACHED, {
				cycles,
				runIdentifier,
			})
			await this.activityService.record({
				correlation: {},
				incidentIdentifier: incident.identifier,
				payload: {
					cycles,
					maximumCycles: this.configuration.agent.maximumCyclesPerRun,
				},
				runIdentifier,
				simulated: false,
				source: "agent",
				summary: `The agent stopped after ${cycles - 1} cycles to avoid running without progress. An operator can request a cycle manually`,
				title: "Agent limit reached",
				type: "agent.limit-reached",
			})
			return { cycles, kind: "limit-reached" }
		}
		this.logger.log(LOG_MESSAGES.AGENT.CYCLE_STARTED, {
			cycle: cycles,
			runIdentifier,
			trigger: trigger.kind,
		})

		let plan = await this.ensurePlan(incident, trigger)
		let executed = 0
		let progressed = plan.status === "active"
		while (
			progressed &&
			executed < this.configuration.agent.maximumStepsPerCycle
		) {
			progressed = false
			const step = this.nextRunnableStep(plan)
			if (!step) {
				break
			}
			const refreshedIncident =
				await this.runsService.getByRunIdentifier(runIdentifier)
			await this.executeStep(refreshedIncident, plan, step)
			executed += 1
			progressed = true
			const refreshed =
				await this.plansService.findActivePlan(runIdentifier)
			if (!refreshed) {
				break
			}
			plan = refreshed
		}

		const finalIncident =
			await this.runsService.getByRunIdentifier(runIdentifier)
		const waitingFor = plan.steps
			.filter(
				(step) =>
					step.status === "awaiting-approval" ||
					step.status === "running",
			)
			.map((step) => `${step.title} (${step.status})`)
		const openSteps = plan.steps.filter((step) =>
			OPEN_STATUSES.includes(step.status),
		)
		if (!openSteps.length && plan.status === "active") {
			await this.plansService.markCompleted(plan.identifier)
		}
		await this.recordCycleSummary(
			finalIncident,
			plan,
			executed,
			waitingFor,
			!openSteps.length,
		)
		this.logger.log(LOG_MESSAGES.AGENT.CYCLE_FINISHED, {
			executed,
			planVersion: plan.version,
			runIdentifier,
			waiting: waitingFor.length,
		})
		return {
			executedSteps: executed,
			kind: "completed",
			planVersion: plan.version,
			waitingFor,
		}
	}

	private async ensurePlan(
		incident: IncidentSnapshot,
		trigger: AgentTrigger,
	): Promise<PlanRecord> {
		const latest = await this.plansService.findLatestPlan(
			incident.runIdentifier,
		)
		if (!latest) {
			await this.incidentsService.markResponding(incident.runIdentifier)
			return this.createPlanVersion(
				incident,
				null,
				describeTrigger(trigger),
			)
		}
		if (latest.status === "completed") {
			if (
				trigger.kind === "conditions-changed" ||
				trigger.kind === "operator-requested"
			) {
				return this.createPlanVersion(
					incident,
					latest,
					describeTrigger(trigger),
				)
			}
			return latest
		}
		if (this.requiresRevision(latest, trigger)) {
			return this.createPlanVersion(
				incident,
				latest,
				describeTrigger(trigger),
			)
		}
		return latest
	}

	private requiresRevision(plan: PlanRecord, trigger: AgentTrigger): boolean {
		switch (trigger.kind) {
			case "conditions-changed":
				return true
			case "approval-decided":
			case "timeouts-expired":
			case "tool-call-finished":
			case "follow-up":
			case "operator-requested":
			case "impact-detected":
				return plan.steps.some((step) => {
					const priority = plan.priorities.find(
						(candidate) =>
							candidate.serviceIdentifier ===
							step.serviceIdentifier,
					)
					const stillPlanned = priority
						? priority.decision === "recover-now"
						: false
					return (
						stillPlanned &&
						(step.status === "rejected" ||
							(step.status === "failed" &&
								step.attempts >=
									this.configuration.agent
										.maximumStepAttempts))
					)
				})
		}
	}

	private async createPlanVersion(
		incident: IncidentSnapshot,
		previous: PlanRecord | null,
		triggeredBy: string,
	): Promise<PlanRecord> {
		const scenario = this.incidentsService.getScenario(
			incident.scenarioIdentifier,
		)
		if (previous) {
			await this.approvalsService.supersedePending(
				incident.runIdentifier,
				`Plan revised: ${triggeredBy}`,
			)
		}
		const rejectedApprovals = await this.approvalsService.list(
			incident.runIdentifier,
			"rejected",
		)
		const rejectedServices: ReadonlyArray<ServiceConstraint> =
			rejectedApprovals.map((approval) => ({
				reason: `Rejected by ${approval.decidedBy}${approval.comment ? `: ${approval.comment}` : ""}. The agent respects the operator decision`,
				serviceIdentifier: approval.serviceIdentifier,
			}))
		const failedServices: ReadonlyArray<ServiceConstraint> = previous
			? previous.steps
					.filter(
						(step) =>
							step.invocation.name === "execute_recovery" &&
							step.status === "failed" &&
							step.attempts >=
								this.configuration.agent.maximumStepAttempts,
					)
					.map((step) => ({
						reason: `Recovery failed: ${step.statusReason}`,
						serviceIdentifier: step.serviceIdentifier,
					}))
			: []
		const input: PlanBuildInput = {
			briefing: scenario.engineerBriefing,
			engineer: {
				name: this.configuration.demo.engineerName,
				phone: this.configuration.demo.engineerPhone,
				role: this.configuration.demo.engineerRole,
			},
			failedServices,
			incident,
			maximumStepAttempts: this.configuration.agent.maximumStepAttempts,
			previousPlan: previous,
			rejectedServices,
			supportContact: scenario.supportContact,
			triggeredBy,
		}
		const draft = buildPlanDraft(input)
		const changes = previous
			? diffPlans(previous, {
					priorities: draft.priorities,
					steps: draft.steps,
					totalCapacity: draft.capacity.totalCapacity,
				})
			: []
		const decisionIdentifier = createPrefixedIdentifier("dec")
		const plan = await this.plansService.createVersion({
			capacity: draft.capacity,
			changesFromPrevious: changes,
			decisionIdentifier,
			incidentIdentifier: incident.identifier,
			previous,
			priorities: draft.priorities,
			reason: draft.reason,
			runIdentifier: incident.runIdentifier,
			steps: draft.steps,
			summary: draft.summary,
			triggeredBy,
		})
		this.logger.log(
			previous
				? LOG_MESSAGES.AGENT.PLAN_REVISED
				: LOG_MESSAGES.AGENT.PLAN_CREATED,
			{
				planVersion: plan.version,
				runIdentifier: incident.runIdentifier,
			},
		)
		await this.activityService.record({
			correlation: {
				decisionIdentifier,
				planIdentifier: plan.identifier,
				planVersion: plan.version,
			},
			incidentIdentifier: incident.identifier,
			payload: {
				changes,
				confirmedFacts: incident.facts
					.filter((fact) => fact.status === "confirmed")
					.map((fact) => fact.statement),
				pendingFacts: incident.facts
					.filter((fact) => fact.status === "pending")
					.map((fact) => fact.statement),
				priorities: plan.priorities,
				trigger: triggeredBy,
			},
			runIdentifier: incident.runIdentifier,
			simulated: false,
			source: "agent",
			summary: explainDecision(plan, changes.length),
			title: previous
				? "Decision: plan revised"
				: "Decision: initial plan",
			type: "decision.recorded",
		})
		return plan
	}

	private nextRunnableStep(plan: PlanRecord): PlanStep | null {
		const completed = new Set(
			plan.steps
				.filter((step) => step.status === "completed")
				.map((step) => step.identifier),
		)
		const candidate = plan.steps.find(
			(step) =>
				RUNNABLE_STATUSES.includes(step.status) &&
				step.dependsOn.every((dependency) => completed.has(dependency)),
		)
		if (!candidate) {
			return null
		}
		return candidate
	}

	private async executeStep(
		incident: IncidentSnapshot,
		plan: PlanRecord,
		step: PlanStep,
	): Promise<void> {
		if (
			step.status === "proposed" &&
			step.requiresApproval &&
			!step.approvalIdentifier
		) {
			await this.requestApprovalFor(incident, plan, step)
			return
		}
		const invocation = await this.resolveInvocation(plan, step)
		const attempt = step.attempts + 1
		const outcome = await this.toolsService.execute({
			attempt,
			decisionIdentifier: plan.decisionIdentifier,
			idempotencyKey: `${step.identifier}:attempt-${attempt}`,
			incidentIdentifier: incident.identifier,
			invocation,
			planIdentifier: plan.identifier,
			planStepIdentifier: step.identifier,
			planVersion: plan.version,
			runIdentifier: incident.runIdentifier,
		})
		switch (outcome.kind) {
			case "in-progress":
				await this.plansService.updateStep(
					plan.identifier,
					step.identifier,
					{
						attempts: attempt,
						status: "running",
						statusReason: `Waiting for ${step.invocation.name} to finish`,
						toolCallIdentifier: outcome.toolCall.identifier,
					},
				)
				return
			case "completed":
				await this.applyToolResult(
					incident,
					plan,
					{ ...step, attempts: attempt },
					outcome.toolCall,
				)
				return
			case "duplicate":
				if (outcome.toolCall.status === "running") {
					await this.plansService.updateStep(
						plan.identifier,
						step.identifier,
						{
							attempts: attempt,
							status: "running",
							statusReason:
								"A previous call for this step is still running",
							toolCallIdentifier: outcome.toolCall.identifier,
						},
					)
					return
				}
				await this.applyToolResult(
					incident,
					plan,
					{ ...step, attempts: attempt },
					outcome.toolCall,
				)
				return
		}
	}

	private async requestApprovalFor(
		incident: IncidentSnapshot,
		plan: PlanRecord,
		step: PlanStep,
	): Promise<void> {
		const service = incident.services.find(
			(candidate) => candidate.identifier === step.serviceIdentifier,
		)
		const consequences = service ? service.recoveryConsequences : []
		const outcome = await this.toolsService.execute({
			attempt: 1,
			decisionIdentifier: plan.decisionIdentifier,
			idempotencyKey: `${step.identifier}:approval:v${plan.version}`,
			incidentIdentifier: incident.identifier,
			invocation: {
				input: {
					actionSummary: step.title,
					capacityUnits: step.capacityUnits,
					consequences,
					reason: step.reason,
					serviceIdentifier: step.serviceIdentifier,
				},
				name: "request_approval",
			},
			planIdentifier: plan.identifier,
			planStepIdentifier: step.identifier,
			planVersion: plan.version,
			runIdentifier: incident.runIdentifier,
		})
		const toolCall = outcome.toolCall
		if (toolCall.output && toolCall.output.kind === "approval") {
			this.logger.log(LOG_MESSAGES.AGENT.STEP_WAITING_FOR_APPROVAL, {
				approvalIdentifier: toolCall.output.approvalIdentifier,
				stepIdentifier: step.identifier,
			})
			await this.plansService.updateStep(
				plan.identifier,
				step.identifier,
				{
					approvalIdentifier: toolCall.output.approvalIdentifier,
					status: "awaiting-approval",
					statusReason:
						"Waiting for the operator to approve or reject the action",
					toolCallIdentifier: toolCall.identifier,
				},
			)
			return
		}
		const message = toolCall.error
			? toolCall.error.message
			: "Could not request the approval"
		await this.plansService.updateStep(plan.identifier, step.identifier, {
			status: "failed",
			statusReason: message,
			toolCallIdentifier: toolCall.identifier,
		})
	}

	private async resolveInvocation(
		plan: PlanRecord,
		step: PlanStep,
	): Promise<ToolInvocation> {
		const { invocation } = step
		switch (invocation.name) {
			case "execute_recovery":
				return {
					input: {
						...invocation.input,
						approvalIdentifier: step.approvalIdentifier,
					},
					name: "execute_recovery",
				}
			case "verify_recovery": {
				const executeStep = plan.steps.find(
					(candidate) =>
						candidate.identifier ===
						stepIdentifierFor(step.serviceIdentifier, "execute"),
				)
				if (!executeStep) {
					return invocation
				}
				const recoveryActionIdentifier =
					await this.recoveryActionIdentifierOf(executeStep)
				return {
					input: { ...invocation.input, recoveryActionIdentifier },
					name: "verify_recovery",
				}
			}
			case "get_incident_state":
			case "get_service_health":
			case "get_recovery_capacity":
			case "contact_engineer":
			case "assign_task":
			case "request_approval":
				return invocation
		}
	}

	private async recoveryActionIdentifierOf(
		executeStep: PlanStep,
	): Promise<string> {
		if (!executeStep.toolCallIdentifier) {
			return ""
		}
		const toolCall = await this.toolsService.getByIdentifier(
			executeStep.toolCallIdentifier,
		)
		if (toolCall.output && toolCall.output.kind === "recovery-execution") {
			return toolCall.output.recoveryActionIdentifier
		}
		return ""
	}

	private async applyToolResult(
		incident: IncidentSnapshot,
		plan: PlanRecord,
		step: PlanStep,
		toolCall: ToolCallRecord,
	): Promise<void> {
		if (toolCall.error) {
			const canRetry =
				toolCall.error.retryable &&
				step.attempts < this.configuration.agent.maximumStepAttempts
			this.logger.warn(LOG_MESSAGES.AGENT.STEP_EXECUTION_FAILED, {
				code: toolCall.error.code,
				stepIdentifier: step.identifier,
			})
			await this.plansService.updateStep(
				plan.identifier,
				step.identifier,
				{
					attempts: toolCall.error.retryable
						? step.attempts
						: this.configuration.agent.maximumStepAttempts,
					resultSummary: toolCall.error.message,
					status: canRetry ? "proposed" : "failed",
					statusReason: canRetry
						? `Attempt ${step.attempts} failed (${toolCall.error.message}). Retrying`
						: toolCall.error.message,
					toolCallIdentifier: toolCall.identifier,
				},
			)
			return
		}
		const output = toolCall.output
		if (!output) {
			await this.plansService.updateStep(
				plan.identifier,
				step.identifier,
				{
					attempts: step.attempts,
					status: "failed",
					statusReason: "The tool finished without a result",
					toolCallIdentifier: toolCall.identifier,
				},
			)
			return
		}
		switch (output.kind) {
			case "engineer-call": {
				const confirmed = await this.recordFactsFromCall(
					incident,
					output.answers,
					output.mode,
				)
				await this.plansService.updateStep(
					plan.identifier,
					step.identifier,
					{
						attempts: step.attempts,
						resultSummary: output.summary,
						status: "completed",
						statusReason: `${confirmed} facts confirmed by the engineer in ${output.mode} mode`,
						toolCallIdentifier: toolCall.identifier,
					},
				)
				return
			}
			case "task":
				await this.plansService.updateStep(
					plan.identifier,
					step.identifier,
					{
						attempts: step.attempts,
						resultSummary: `Task ${output.taskIdentifier} created`,
						status: "completed",
						statusReason: "Task registered with an owner",
						toolCallIdentifier: toolCall.identifier,
					},
				)
				return
			case "recovery-execution":
				await this.plansService.updateStep(
					plan.identifier,
					step.identifier,
					{
						attempts:
							output.outcome === "failure"
								? this.configuration.agent.maximumStepAttempts
								: step.attempts,
						resultSummary: output.detail,
						status:
							output.outcome === "failure"
								? "failed"
								: "completed",
						statusReason:
							output.outcome === "failure"
								? `Recovery failed in ${output.mode} mode: ${output.detail}`
								: `Recovery ${output.outcome} in ${output.mode} mode. Pending verification`,
						toolCallIdentifier: toolCall.identifier,
					},
				)
				return
			case "recovery-verification":
				await this.applyVerification(
					incident,
					plan,
					step,
					toolCall,
					output.status,
					output.verified,
					output.detail,
				)
				return
			case "approval":
			case "incident-state":
			case "service-health":
			case "recovery-capacity":
				await this.plansService.updateStep(
					plan.identifier,
					step.identifier,
					{
						attempts: step.attempts,
						status: "completed",
						statusReason: "Information gathered",
						toolCallIdentifier: toolCall.identifier,
					},
				)
				return
		}
	}

	private async applyVerification(
		incident: IncidentSnapshot,
		plan: PlanRecord,
		step: PlanStep,
		toolCall: ToolCallRecord,
		status: string,
		verified: boolean,
		detail: string,
	): Promise<void> {
		if (verified) {
			await this.plansService.updateStep(
				plan.identifier,
				step.identifier,
				{
					attempts: step.attempts,
					resultSummary: detail,
					status: "completed",
					statusReason:
						"Recovered and verified with an independent check",
					toolCallIdentifier: toolCall.identifier,
				},
			)
			return
		}
		if (status === "degraded") {
			await this.plansService.updateStep(
				plan.identifier,
				step.identifier,
				{
					attempts: step.attempts,
					resultSummary: detail,
					status: "completed",
					statusReason:
						"Partially recovered. A follow-up task was assigned to finish the recovery",
					toolCallIdentifier: toolCall.identifier,
				},
			)
			await this.toolsService.execute({
				attempt: 1,
				decisionIdentifier: plan.decisionIdentifier,
				idempotencyKey: `${step.identifier}:follow-up`,
				incidentIdentifier: incident.identifier,
				invocation: {
					input: {
						assigneeName: this.configuration.demo.engineerName,
						assigneeRole: this.configuration.demo.engineerRole,
						description: `${step.serviceIdentifier} answers but is degraded: ${detail}. Finish the recovery and confirm when healthy.`,
						priority: "high",
						serviceIdentifier: step.serviceIdentifier,
						title: `Finish partial recovery of ${step.serviceIdentifier}`,
					},
					name: "assign_task",
				},
				planIdentifier: plan.identifier,
				planStepIdentifier: step.identifier,
				planVersion: plan.version,
				runIdentifier: incident.runIdentifier,
			})
			return
		}
		await this.plansService.updateStep(plan.identifier, step.identifier, {
			attempts: this.configuration.agent.maximumStepAttempts,
			resultSummary: detail,
			status: "failed",
			statusReason: `Verification failed, the service is still ${status}: ${detail}`,
			toolCallIdentifier: toolCall.identifier,
		})
	}

	private async recordFactsFromCall(
		incident: IncidentSnapshot,
		answers: ReadonlyArray<{
			readonly key: string
			readonly answer: string
		}>,
		mode: "simulated" | "live",
	): Promise<number> {
		const scenario = this.incidentsService.getScenario(
			incident.scenarioIdentifier,
		)
		let confirmed = 0
		for (const answer of answers) {
			const question = scenario.engineerBriefing.questions.find(
				(candidate) => candidate.key === answer.key,
			)
			if (!question) {
				continue
			}
			const status = interpretAnswer(question, answer.answer, mode)
			await this.incidentsService.recordFact(
				incident.runIdentifier,
				question.confirmsFact,
				status,
				`${this.configuration.demo.engineerName} by phone (${mode})`,
			)
			if (status === "confirmed") {
				confirmed += 1
				if (question.key === "backup-capacity") {
					await this.incidentsService.confirmResourceCapacity(
						incident.runIdentifier,
						incident.resources[0].identifier,
						true,
						`Confirmed by ${this.configuration.demo.engineerName}`,
					)
				}
			}
		}
		return confirmed
	}

	private async applyApprovalDecision(
		approval: ApprovalRecord,
	): Promise<void> {
		const plan = await this.plansService.findActivePlan(
			approval.runIdentifier,
		)
		if (!plan) {
			return
		}
		if (plan.identifier !== approval.planIdentifier) {
			return
		}
		const step = plan.steps.find(
			(candidate) => candidate.approvalIdentifier === approval.identifier,
		)
		if (!step) {
			return
		}
		switch (approval.status) {
			case "approved":
				await this.plansService.updateStep(
					plan.identifier,
					step.identifier,
					{
						status: "approved",
						statusReason: `Approved by ${approval.decidedBy}${approval.comment ? `: ${approval.comment}` : ""}`,
					},
				)
				return
			case "rejected":
				await this.plansService.updateStep(
					plan.identifier,
					step.identifier,
					{
						status: "rejected",
						statusReason: `Rejected by ${approval.decidedBy}${approval.comment ? `: ${approval.comment}` : ""}`,
					},
				)
				return
			case "expired":
				await this.plansService.updateStep(
					plan.identifier,
					step.identifier,
					{
						approvalIdentifier: "",
						status: "proposed",
						statusReason:
							"The approval expired, it will be requested again",
					},
				)
				return
			case "superseded":
			case "pending":
				return
		}
	}

	private async recordCycleSummary(
		incident: IncidentSnapshot,
		plan: PlanRecord,
		executed: number,
		waitingFor: ReadonlyArray<string>,
		planFinished: boolean,
	): Promise<void> {
		const recovered = incident.services
			.filter((service) => service.status === "healthy")
			.map((service) => service.name)
		const failing = incident.services
			.filter((service) => service.status !== "healthy")
			.map((service) => `${service.name} (${service.status})`)
		const nextStep = this.nextRunnableStep(plan)
		const nextDescription = waitingFor.length
			? `Waiting for: ${waitingFor.join(", ")}`
			: nextStep
				? `Next: ${nextStep.title}`
				: planFinished
					? "Plan finished"
					: "Nothing runnable right now"
		await this.activityService.record({
			correlation: {
				decisionIdentifier: plan.decisionIdentifier,
				planIdentifier: plan.identifier,
				planVersion: plan.version,
			},
			incidentIdentifier: incident.identifier,
			payload: {
				executedSteps: executed,
				failing,
				planFinished,
				recovered,
				waitingFor,
			},
			runIdentifier: incident.runIdentifier,
			simulated: false,
			source: "agent",
			summary: `Recovered: ${recovered.length ? recovered.join(", ") : "nothing yet"}. Still failing: ${failing.length ? failing.join(", ") : "nothing"}. ${nextDescription}`,
			title: "Agent cycle finished",
			type: "agent.cycle-finished",
		})
	}
}

function describeTrigger(trigger: AgentTrigger): string {
	switch (trigger.kind) {
		case "impact-detected":
			return "Impact detected in the primary region"
		case "conditions-changed":
			return trigger.description
		case "tool-call-finished":
			return `Tool call ${trigger.toolCallIdentifier} finished`
		case "approval-decided":
			return `Operator decided on approval ${trigger.approvalIdentifier}`
		case "timeouts-expired":
			return trigger.description
		case "operator-requested":
			return `Cycle requested by ${trigger.operatorName}`
		case "follow-up":
			return "Follow-up after the previous cycle"
	}
}

function explainDecision(plan: PlanRecord, changeCount: number): string {
	const recoverNow = plan.priorities.filter(
		(priority) => priority.decision === "recover-now",
	)
	const postponed = plan.priorities.filter(
		(priority) => priority.decision === "postpone",
	)
	const parts: string[] = []
	for (const priority of recoverNow) {
		parts.push(
			`${priority.rank}. ${priority.serviceName}: ${priority.reason}`,
		)
	}
	for (const priority of postponed) {
		parts.push(`Postponed ${priority.serviceName}: ${priority.reason}`)
	}
	if (changeCount > 0) {
		parts.push(
			`${changeCount} changes compared with version ${plan.version - 1}`,
		)
	}
	return parts.join(" | ")
}
