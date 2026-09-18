import { ActivityService } from "@activity/services/activity.service"
import {
	AGENT_TICK_INTERVAL_MILLISECONDS,
	CONTACT_ENGINEER_STEP_IDENTIFIER,
} from "@agent/constants/agent.constant"
import { AGENT_MESSAGES } from "@agent/constants/agent-messages.constant"
import { interpretAnswer } from "@agent/helpers/answer-interpretation.helper"
import {
	buildPlanDraft,
	stepIdentifierFor,
} from "@agent/helpers/plan-builder.helper"
import { AgentCycleStateService } from "@agent/services/agent-cycle-state.service"
import {
	AgentStatus,
	AgentTrigger,
	CapacityAssumption,
	CycleOutcome,
	PlanBuildInput,
	ServiceConstraint,
} from "@agent/types/agent.type"
import { AgentMessages } from "@agent/types/agent-messages.type"
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
import { IncomingCallsService } from "@engineers/services/incoming-calls.service"
import { toIncidentSnapshot } from "@incidents/helpers/incident-state.helper"
import { IncidentsService } from "@incidents/services/incidents.service"
import { RunsService } from "@incidents/services/runs.service"
import {
	IncidentEventAppliedEvent,
	IncidentSnapshot,
} from "@incidents/types/incident.type"
import { LearningService } from "@learning/services/learning.service"
import { Injectable, Logger } from "@nestjs/common"
import { OnEvent } from "@nestjs/event-emitter"
import { Interval } from "@nestjs/schedule"
import { diffPlans } from "@plans/helpers/plan-diff.helper"
import { PlansService } from "@plans/services/plans.service"
import { PlanRecord, PlanStep } from "@plans/types/plan.type"
import { RecoveryService } from "@recovery/services/recovery.service"
import { ScenarioDefinition } from "@scenarios/types/scenario.type"
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
	private readonly pendingChanges = new Map<string, AgentTrigger>()
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
		private readonly learningService: LearningService,
		private readonly configuration: ConfigurationService,
		private readonly cycleState: AgentCycleStateService,
		private readonly incomingCalls: IncomingCallsService,
	) {}

	@OnEvent(DOMAIN_EVENTS.INCOMING_CALL_CONFIRMED, {
		async: true,
		promisify: true,
	})
	async onIncomingCallConfirmed(event: {
		runIdentifier: string
		callIdentifier: string
	}) {
		await this.requestCycle(event.runIdentifier, {
			description: "Operator confirmed the incoming capacity report",
			harnessEventIdentifier: event.callIdentifier,
			kind: "conditions-changed",
		})
	}
	@OnEvent(DOMAIN_EVENTS.INCOMING_CALL_RECEIVED, {
		async: true,
		promisify: true,
	})
	async onIncomingCall(event: { runIdentifier: string }) {
		await this.requestCycle(event.runIdentifier, { kind: "follow-up" })
	}
	@OnEvent(DOMAIN_EVENTS.INCIDENT_EVENT_APPLIED, {
		async: true,
		promisify: true,
	})
	async onIncidentEventApplied(
		event: IncidentEventAppliedEvent,
	): Promise<void> {
		const { applied, incident } = event
		if (applied.source.startsWith("incoming-call:")) return
		switch (applied.event.type) {
			case "meteorite-impact":
				await this.requestCycle(incident.runIdentifier, {
					harnessEventIdentifier: applied.identifier,
					kind: "impact-detected",
				})
				return
			case "capacity-limited": {
				const scenario = this.scenarioOf(incident)
				await this.learningService.recordCapacityObservation(
					scenario.family,
					scenario.resource.identifier,
					scenario.resource.reportedCapacity,
					applied.event.availableCapacity,
					incident.runIdentifier,
				)
				await this.requestCycle(incident.runIdentifier, {
					description: AGENT_MESSAGES[
						scenario.language
					].capacityConfirmed(
						applied.event.availableCapacity,
						applied.event.reason,
					),
					harnessEventIdentifier: applied.identifier,
					kind: "conditions-changed",
				})
				return
			}
			case "service-health-changed":
				await this.requestCycle(incident.runIdentifier, {
					description: this.messagesFor(incident).serviceChanged(
						applied.event.serviceIdentifier,
						applied.event.status,
						applied.event.reason,
					),
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
				description: this.messagesFor(
					toIncidentSnapshot(active),
				).timeoutsExpired(expiredApprovals.length, expiredCalls.length),
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
			if (trigger.kind === "conditions-changed")
				this.pendingChanges.set(runIdentifier, trigger)
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
			const next = this.pendingChanges.get(runIdentifier) ?? {
				kind: "follow-up" as const,
			}
			this.pendingChanges.delete(runIdentifier)
			void this.requestCycle(runIdentifier, next)
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

	private scenarioOf(incident: IncidentSnapshot): ScenarioDefinition {
		return this.incidentsService.getScenario(incident.scenarioIdentifier)
	}

	private messagesFor(incident: IncidentSnapshot): AgentMessages {
		return AGENT_MESSAGES[this.scenarioOf(incident).language]
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
		const messages = this.messagesFor(incident)
		const pendingCalls = await this.incomingCalls.list(runIdentifier)
		if (pendingCalls.some((call) => call.status === "pending"))
			return {
				kind: "skipped",
				reason: "Incoming capacity report requires operator confirmation before further action",
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
				summary: messages.limitReached(cycles - 1),
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

		const observed = await this.toolsService.execute({
			attempt: 1,
			decisionIdentifier: "",
			idempotencyKey: `observe:${cycles}`,
			incidentIdentifier: incident.identifier,
			invocation: { input: {}, name: "get_incident_context" },
			planIdentifier: "",
			planStepIdentifier: "observe",
			planVersion: 0,
			runIdentifier,
		})
		if (observed.toolCall.output?.kind !== "incident-context")
			throw new Error("Could not observe incident context")
		let plan = await this.ensurePlan(
			observed.toolCall.output.incident,
			trigger,
			messages,
		)
		let executed = 0
		let progressed = plan.status === "active"
		while (
			progressed &&
			executed < this.configuration.agent.maximumStepsPerCycle
		) {
			progressed = false
			if (this.pendingChanges.has(runIdentifier)) break
			const step = this.nextRunnableStep(plan)
			if (!step) {
				break
			}
			const refreshedIncident =
				await this.runsService.getByRunIdentifier(runIdentifier)
			if (
				(await this.incomingCalls.list(runIdentifier)).some(
					(call) => call.status === "pending",
				)
			)
				break
			await this.executeStep(refreshedIncident, plan, step, messages)
			executed += 1
			progressed = true
			const refreshed =
				await this.plansService.findActivePlan(runIdentifier)
			if (!refreshed) {
				break
			}
			plan = refreshed
		}

		if (
			executed >= this.configuration.agent.maximumStepsPerCycle &&
			this.nextRunnableStep(plan)
		)
			this.cycleState.tryBegin(runIdentifier)
		const finalIncident =
			await this.runsService.getByRunIdentifier(runIdentifier)
		const waitingFor = plan.steps
			.filter(
				(step) =>
					step.status === "awaiting-approval" ||
					step.status === "running",
			)
			.map((step) => messages.stepWaiting(step.title, step.status))
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
			messages,
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
		messages: AgentMessages,
	): Promise<PlanRecord> {
		const latest = await this.plansService.findLatestPlan(
			incident.runIdentifier,
		)
		if (!latest) {
			await this.incidentsService.markResponding(incident.runIdentifier)
			return this.createPlanVersion(
				incident,
				null,
				describeTrigger(trigger, messages),
				messages,
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
					describeTrigger(trigger, messages),
					messages,
				)
			}
			return latest
		}
		if (this.requiresRevision(latest, trigger)) {
			return this.createPlanVersion(
				incident,
				latest,
				describeTrigger(trigger, messages),
				messages,
			)
		}
		return latest
	}

	private callFailedWhileStepsWait(plan: PlanRecord): boolean {
		const contact = plan.steps.find(
			(step) => step.identifier === CONTACT_ENGINEER_STEP_IDENTIFIER,
		)
		if (!contact) {
			return false
		}
		if (
			contact.status !== "failed" ||
			contact.attempts < this.configuration.agent.maximumStepAttempts
		) {
			return false
		}
		return plan.steps.some(
			(step) =>
				step.dependsOn.includes(CONTACT_ENGINEER_STEP_IDENTIFIER) &&
				OPEN_STATUSES.includes(step.status),
		)
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
				if (this.callFailedWhileStepsWait(plan)) {
					return true
				}
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
		messages: AgentMessages,
	): Promise<PlanRecord> {
		const scenario = this.scenarioOf(incident)
		const rejectedApprovals = await this.approvalsService.list(
			incident.runIdentifier,
			"rejected",
		)
		const rejectedServices: ReadonlyArray<ServiceConstraint> =
			rejectedApprovals.map((approval) => ({
				reason: messages.rejectedConstraint(
					approval.decidedBy,
					approval.comment,
				),
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
						reason: messages.recoveryFailedConstraint(
							step.statusReason,
						),
						serviceIdentifier: step.serviceIdentifier,
					}))
			: []
		const capacityAssumption = await this.resolveCapacityAssumption(
			incident,
			scenario,
		)
		const input: PlanBuildInput = {
			briefing: scenario.engineerBriefing,
			capacityAssumption,
			engineer: {
				name: this.configuration.demo.engineerName,
				phone: this.configuration.demo.engineerPhone,
				role: this.configuration.demo.engineerRole,
			},
			failedServices,
			incident,
			language: scenario.language,
			maximumStepAttempts: this.configuration.agent.maximumStepAttempts,
			previousPlan: previous,
			rejectedServices,
			supportContact: scenario.supportContact,
			triggeredBy,
		}
		const draft = buildPlanDraft(input)
		const changes = previous
			? diffPlans(
					previous,
					{
						priorities: draft.priorities,
						steps: draft.steps,
						totalCapacity: draft.capacity.totalCapacity,
					},
					messages,
				)
			: []
		const decisionIdentifier = createPrefixedIdentifier("dec")
		const saved = await this.toolsService.execute({
			attempt: 1,
			decisionIdentifier,
			idempotencyKey: `save-plan:v${(previous?.version ?? 0) + 1}`,
			incidentIdentifier: incident.identifier,
			invocation: {
				input: {
					assumptions: draft.assumptions,
					capacity: draft.capacity,
					changesFromPrevious: changes,
					decisionIdentifier,
					expectedPreviousIdentifier: previous?.identifier ?? "",
					incidentIdentifier: incident.identifier,
					priorities: draft.priorities,
					reason: draft.reason,
					runIdentifier: incident.runIdentifier,
					steps: draft.steps,
					summary: draft.summary,
					triggeredBy,
				},
				name: "save_recovery_plan",
			},
			planIdentifier: previous?.identifier ?? "",
			planStepIdentifier: "save-plan",
			planVersion: (previous?.version ?? 0) + 1,
			runIdentifier: incident.runIdentifier,
		})
		if (saved.toolCall.output?.kind !== "recovery-plan")
			throw new Error(
				saved.toolCall.error?.message ?? "Could not save recovery plan",
			)
		const plan = saved.toolCall.output.plan
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
				assumptions: plan.assumptions,
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
			summary: explainDecision(plan, changes.length, messages),
			title: previous
				? "Decision: plan revised"
				: "Decision: initial plan",
			type: "decision.recorded",
		})
		return plan
	}

	private async resolveCapacityAssumption(
		incident: IncidentSnapshot,
		scenario: ScenarioDefinition,
	): Promise<CapacityAssumption | null> {
		const resource = incident.resources[0]
		if (resource.confirmed) {
			return null
		}
		const insight = await this.learningService.findCapacityInsight(
			scenario.family,
			resource.identifier,
		)
		if (!insight) {
			return null
		}
		if (insight.confirmedCapacity >= resource.totalCapacity) {
			return null
		}
		return {
			assumedCapacity: insight.confirmedCapacity,
			observations: insight.observations,
			reportedCapacity: insight.reportedCapacity,
		}
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
		messages: AgentMessages,
	): Promise<void> {
		if (
			step.status === "proposed" &&
			step.requiresApproval &&
			!step.approvalIdentifier
		) {
			await this.requestApprovalFor(incident, plan, step, messages)
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
						statusReason: messages.waitingForTool(
							step.invocation.name,
						),
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
							statusReason: messages.previousCallRunning,
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
		messages: AgentMessages,
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
					statusReason: messages.waitingForOperator,
					toolCallIdentifier: toolCall.identifier,
				},
			)
			return
		}
		const message = toolCall.error
			? toolCall.error.message
			: messages.couldNotRequestApproval
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
			case "send_incident_email":
			case "publish_status_update":
				return {
					input: { planIdentifier: plan.identifier },
					name: invocation.name,
				}
			case "save_recovery_plan":
			case "get_incident_context":
			case "call_engineer":
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
		const messages = this.messagesFor(incident)
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
						? messages.attemptFailedRetrying(
								step.attempts,
								toolCall.error.message,
							)
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
					statusReason: messages.toolWithoutResult,
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
						statusReason: messages.factsConfirmed(
							confirmed,
							output.mode,
						),
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
						resultSummary: messages.taskCreated(
							output.taskIdentifier,
						),
						status: "completed",
						statusReason: messages.taskRegistered,
						toolCallIdentifier: toolCall.identifier,
					},
				)
				return
			case "recovery-execution":
				await this.learningService.recordRecoveryOutcome(
					this.scenarioOf(incident).family,
					step.serviceIdentifier,
					output.outcome,
					output.detail,
					incident.runIdentifier,
				)
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
								? messages.recoveryFailed(
										output.mode,
										output.detail,
									)
								: messages.recoveryPendingVerification(
										output.outcome,
										output.mode,
									),
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
					messages,
				)
				return
			case "communication":
				await this.plansService.updateStep(
					plan.identifier,
					step.identifier,
					{
						resultSummary: `${output.mode}: ${output.reference}`,
						status: "completed",
						statusReason: output.detail,
						toolCallIdentifier: toolCall.identifier,
					},
				)
				return
			case "incident-context":
			case "recovery-plan":
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
						statusReason: messages.informationGathered,
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
		messages: AgentMessages,
	): Promise<void> {
		if (verified) {
			await this.plansService.updateStep(
				plan.identifier,
				step.identifier,
				{
					attempts: step.attempts,
					resultSummary: detail,
					status: "completed",
					statusReason: messages.recoveredAndVerified,
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
					statusReason: messages.partiallyRecovered,
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
						description: messages.followUpTaskDescription(
							step.serviceIdentifier,
							detail,
						),
						priority: "high",
						serviceIdentifier: step.serviceIdentifier,
						title: messages.followUpTaskTitle(
							step.serviceIdentifier,
						),
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
			statusReason: messages.verificationFailed(status, detail),
			toolCallIdentifier: toolCall.identifier,
		})
	}

	private async recordFactsFromCall(
		incident: IncidentSnapshot,
		answers: ReadonlyArray<{
			readonly key: string
			readonly answer: string
			readonly confirmed?: boolean
		}>,
		mode: "simulated" | "live",
	): Promise<number> {
		const scenario = this.scenarioOf(incident)
		let confirmed = 0
		for (const answer of answers) {
			const question = scenario.engineerBriefing.questions.find(
				(candidate) => candidate.key === answer.key,
			)
			if (!question) {
				continue
			}
			const status = interpretAnswer(
				question,
				answer.answer,
				mode,
				answer.confirmed,
			)
			await this.incidentsService.recordFact(
				incident.runIdentifier,
				question.confirmsFact,
				status,
				`${this.configuration.demo.engineerName} (${mode})`,
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
		const incident = await this.runsService.getByRunIdentifier(
			approval.runIdentifier,
		)
		const messages = this.messagesFor(incident)
		switch (approval.status) {
			case "approved":
				await this.plansService.updateStep(
					plan.identifier,
					step.identifier,
					{
						status: "approved",
						statusReason: messages.approvedBy(
							approval.decidedBy,
							approval.comment,
						),
					},
				)
				return
			case "rejected":
				await this.plansService.updateStep(
					plan.identifier,
					step.identifier,
					{
						status: "rejected",
						statusReason: messages.rejectedBy(
							approval.decidedBy,
							approval.comment,
						),
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
						statusReason: messages.approvalExpiredRequestAgain,
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
		messages: AgentMessages,
	): Promise<void> {
		const recovered = incident.services
			.filter((service) => service.status === "healthy")
			.map((service) => service.name)
		const failing = incident.services
			.filter((service) => service.status !== "healthy")
			.map((service) => `${service.name} (${service.status})`)
		const nextStep = this.nextRunnableStep(plan)
		const nextDescription = waitingFor.length
			? messages.waitingFor(waitingFor)
			: nextStep
				? messages.nextStep(nextStep.title)
				: planFinished
					? messages.planFinished
					: messages.nothingRunnable
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
			summary: messages.cycleSummary(recovered, failing, nextDescription),
			title: "Agent cycle finished",
			type: "agent.cycle-finished",
		})
	}
}

function describeTrigger(
	trigger: AgentTrigger,
	messages: AgentMessages,
): string {
	switch (trigger.kind) {
		case "impact-detected":
			return messages.triggerImpact
		case "conditions-changed":
			return trigger.description
		case "tool-call-finished":
			return messages.triggerToolFinished(trigger.toolCallIdentifier)
		case "approval-decided":
			return messages.triggerApprovalDecided(trigger.approvalIdentifier)
		case "timeouts-expired":
			return trigger.description
		case "operator-requested":
			return messages.triggerOperator(trigger.operatorName)
		case "follow-up":
			return messages.triggerFollowUp
	}
}

function explainDecision(
	plan: PlanRecord,
	changeCount: number,
	messages: AgentMessages,
): string {
	const parts: string[] = []
	for (const priority of plan.priorities.filter(
		(candidate) => candidate.decision === "recover-now",
	)) {
		parts.push(
			messages.decisionRecoverNow(
				priority.rank,
				priority.serviceName,
				priority.reason,
			),
		)
	}
	for (const priority of plan.priorities.filter(
		(candidate) => candidate.decision === "postpone",
	)) {
		parts.push(
			messages.decisionPostponed(priority.serviceName, priority.reason),
		)
	}
	for (const assumption of plan.assumptions) {
		parts.push(assumption)
	}
	if (changeCount > 0) {
		parts.push(messages.decisionChanges(changeCount, plan.version - 1))
	}
	return parts.join(" | ")
}
