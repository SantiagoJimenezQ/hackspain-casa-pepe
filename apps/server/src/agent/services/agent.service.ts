import { ActivityService } from "@activity/services/activity.service"
import {
	AGENT_STALLED_RUN_MILLISECONDS,
	AGENT_TICK_INTERVAL_MILLISECONDS,
} from "@agent/constants/agent.constant"
import { AGENT_MESSAGES } from "@agent/constants/agent-messages.constant"
import { interpretAnswer } from "@agent/helpers/answer-interpretation.helper"
import {
	buildEngineerCallDraft,
	stepIdentifierFor,
} from "@agent/helpers/plan-builder.helper"
import { isPlanSettled } from "@agent/helpers/plan-completion.helper"
import { saveAndStart } from "@agent/llm/combined-plan"
import {
	LlmLoopActions,
	LlmLoopService,
	LlmLoopState,
	stateFingerprint,
} from "@agent/llm/llm-loop.service"
import { AgentCycleStateService } from "@agent/services/agent-cycle-state.service"
import {
	AgentStatus,
	AgentTrigger,
	CapacityAssumption,
	CycleOutcome,
	PlanBuildInput,
	PlanDraft,
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
import { IncidentEntity } from "@incidents/entities/incident.entity"
import { toIncidentSnapshot } from "@incidents/helpers/incident-state.helper"
import { IncidentsService } from "@incidents/services/incidents.service"
import { RunsService } from "@incidents/services/runs.service"
import {
	IncidentEventAppliedEvent,
	IncidentSnapshot,
} from "@incidents/types/incident.type"
import { LearningService } from "@learning/services/learning.service"
import { LearningInsightRecord } from "@learning/types/learning.type"
import { Injectable, Logger } from "@nestjs/common"
import { OnEvent } from "@nestjs/event-emitter"
import { Interval } from "@nestjs/schedule"
import { diffPlans } from "@plans/helpers/plan-diff.helper"
import { PlansService } from "@plans/services/plans.service"
import { PlanRecord, PlanStep } from "@plans/types/plan.type"
import { RecoveryService } from "@recovery/services/recovery.service"
import { ScenarioDefinition } from "@scenarios/types/scenario.type"
import { TasksService } from "@tasks/services/tasks.service"
import { TaskUpdatedEvent } from "@tasks/types/task.type"
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

@Injectable()
export class AgentService {
	private readonly stalledNudges = new Map<string, number>()

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
		private readonly llmLoop: LlmLoopService,
		private readonly tasksService: TasksService,
	) {}

	@OnEvent(DOMAIN_EVENTS.INCIDENT_RUN_DEACTIVATED)
	onRunDeactivated(event: { runIdentifier: string }): void {
		this.pendingChanges.delete(event.runIdentifier)
		this.cycleState.forget(event.runIdentifier)
	}

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
				const availableCapacity = applied.event.availableCapacity
				const limited =
					incident.resources.find(
						(resource) =>
							resource.totalCapacity === availableCapacity,
					) ?? incident.resources[0]
				const definition =
					scenario.resources.find(
						(resource) =>
							resource.identifier === limited.identifier,
					) ?? scenario.resources[0]
				await this.learningService.recordCapacityObservation(
					scenario.family,
					definition.identifier,
					definition.reportedCapacity,
					availableCapacity,
					incident.runIdentifier,
				)
				await this.requestCycle(incident.runIdentifier, {
					description: AGENT_MESSAGES[
						scenario.language
					].capacityConfirmed(
						availableCapacity,
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

	@OnEvent(DOMAIN_EVENTS.TASK_UPDATED, { async: true, promisify: true })
	async onTaskUpdated({ task }: TaskUpdatedEvent): Promise<void> {
		await this.requestCycle(task.runIdentifier, {
			description: `Task ${task.identifier} changed to ${task.status}; reassess its recorded evidence`,
			harnessEventIdentifier: task.identifier,
			kind: "conditions-changed",
		})
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
		// Sequential on purpose: a parallel sweep over every run exhausts the connection pool.
		for (const active of await this.runsService.listLiveEntities()) {
			await this.tickRun(active)
		}
	}

	private async tickRun(active: IncidentEntity): Promise<void> {
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
			return
		}
		await this.resumeStalledRun(active)
	}

	/**
	 * A cycle lost to a restart or a provider failure leaves the run idle with runnable work
	 * and no event left to resume it. Nothing else notices, so the tick nudges it, spaced out
	 * so a run the agent deliberately parked is not hammered.
	 */
	private async resumeStalledRun(active: IncidentEntity): Promise<void> {
		if (this.cycleState.get(active.runIdentifier).inProgress) {
			return
		}
		const nudgedAt = this.stalledNudges.get(active.runIdentifier) ?? 0
		if (Date.now() - nudgedAt < AGENT_STALLED_RUN_MILLISECONDS) {
			return
		}
		const plan = await this.plansService.findActivePlan(
			active.runIdentifier,
		)
		if (!plan) {
			return
		}
		const statusByIdentifier = new Map(
			plan.steps.map((step) => [step.identifier, step.status]),
		)
		const awaited = plan.steps.some(
			(step) =>
				step.status === "running" ||
				step.status === "awaiting-approval",
		)
		if (awaited) {
			return
		}
		const runnable = plan.steps.some(
			(step) =>
				step.status === "proposed" &&
				step.dependsOn.every(
					(dependency) =>
						statusByIdentifier.get(dependency) === "completed",
				),
		)
		if (!runnable) {
			return
		}
		this.stalledNudges.set(active.runIdentifier, Date.now())
		this.logger.warn(LOG_MESSAGES.AGENT.STALLED_RUN_RESUMED, {
			runIdentifier: active.runIdentifier,
		})
		await this.requestCycle(active.runIdentifier, { kind: "follow-up" })
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
			engine: "llm",
			engineerCallMode: this.engineersService.mode,
			incidentStatus: incident.status,
			lastCycleAt: state.lastCycleAt,
			lastCycleOutcome: state.lastOutcome,
			maximumCycles: this.configuration.agent.maximumCyclesPerRun,
			model: this.configuration.llm.model,
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
		await this.callEngineerImmediately(incident, messages)

		const actions: LlmLoopActions = {
			execute: async (identifier, expected) => {
				const fresh = await this.observeForLlm(runIdentifier, trigger)
				if (
					fresh.blocked ||
					stateFingerprint(fresh) !== stateFingerprint(expected)
				)
					throw new Error("State changed before dispatch; reassess")
				const plan = fresh.input.previousPlan
				const step = plan?.steps.find(
					(candidate) => candidate.identifier === identifier,
				)
				if (
					!plan ||
					plan.status !== "active" ||
					!step ||
					!RUNNABLE_STATUSES.includes(step.status) ||
					!step.dependsOn.every((id) =>
						plan.steps.some(
							(candidate) =>
								candidate.identifier === id &&
								candidate.status === "completed",
						),
					)
				)
					throw new Error(
						"Selected step is not runnable in the active plan",
					)
				await this.executeStep(
					fresh.input.incident,
					plan,
					step,
					messages,
				)
				const updated =
					await this.plansService.findLatestPlan(runIdentifier)
				await this.completePlanIfSettled(updated, runIdentifier)
				return this.plansService.findLatestPlan(runIdentifier)
			},
			investigate: (invocation) =>
				this.toolsService.execute({
					attempt: 1,
					decisionIdentifier: "",
					idempotencyKey: createPrefixedIdentifier("investigate"),
					incidentIdentifier: incident.identifier,
					invocation,
					planIdentifier: "",
					planStepIdentifier: "investigate",
					planVersion: 0,
					runIdentifier,
				}),
			observe: () => this.observeForLlm(runIdentifier, trigger),
			save: async (draft, expected) => {
				const input = expected.input
				const fresh = await this.observeForLlm(runIdentifier, trigger)
				if (
					fresh.blocked ||
					stateFingerprint(fresh) !== stateFingerprint(expected)
				)
					throw new Error(
						"State changed before plan persistence; investigate again",
					)
				if (!input.previousPlan)
					await this.incidentsService.markResponding(runIdentifier)
				return this.createPlanVersion(
					fresh.input.incident,
					fresh.input.previousPlan,
					input.triggeredBy,
					messages,
					draft,
				)
			},
		}
		actions.saveAndExecute = (draft, identifier, expected) =>
			saveAndStart(draft, identifier, expected, {
				execute: actions.execute,
				latest: () => this.plansService.findLatestPlan(runIdentifier),
				observe: actions.observe,
				save: actions.save,
			})
		const outcome = await this.llmLoop.run(actions)
		const finalPlan = await this.plansService.findLatestPlan(runIdentifier)
		if (!(await this.runsService.getByRunIdentifier(runIdentifier)).active)
			return { kind: "skipped", reason: "The run is no longer active" }
		await this.completePlanIfSettled(finalPlan, runIdentifier)
		if (
			outcome.kind === "completed" &&
			outcome.executedSteps >=
				this.configuration.agent.maximumStepsPerCycle &&
			finalPlan?.status === "active" &&
			finalPlan.steps.some(
				(step) =>
					RUNNABLE_STATUSES.includes(step.status) &&
					step.dependsOn.every((id) =>
						finalPlan.steps.some(
							(dependency) =>
								dependency.identifier === id &&
								dependency.status === "completed",
						),
					),
			)
		)
			this.cycleState.tryBegin(runIdentifier)
		return outcome
	}

	/**
	 * The on-call engineer is the only source for the pending facts and the phone takes about a
	 * minute to answer, so the run opens with the call instead of reaching it through the model:
	 * a plan holding just that step is persisted and dispatched before the first model turn, and
	 * the investigation then runs while it rings. Later cycles already have a plan and skip this.
	 */
	private async callEngineerImmediately(
		incident: IncidentSnapshot,
		messages: AgentMessages,
	): Promise<void> {
		const existing = await this.plansService.findLatestPlan(
			incident.runIdentifier,
		)
		const pendingFacts = incident.facts.filter(
			(fact) => fact.status === "pending",
		)
		if (existing || !pendingFacts.length) {
			return
		}
		const input = await this.buildLlmInput(
			incident,
			null,
			messages.triggerImpact,
			messages,
		)
		if (!input.briefing.questions.length) {
			return
		}
		await this.incidentsService.markResponding(incident.runIdentifier)
		const plan = await this.createPlanVersion(
			incident,
			null,
			messages.triggerImpact,
			messages,
			buildEngineerCallDraft(input),
		)
		this.logger.log(LOG_MESSAGES.AGENT.ENGINEER_CALL_DISPATCHED, {
			planVersion: plan.version,
			runIdentifier: incident.runIdentifier,
		})
		for (const step of plan.steps.filter(
			(candidate) => candidate.invocation.name === "call_engineer",
		)) {
			await this.executeStep(incident, plan, step, messages)
		}
	}

	private async completePlanIfSettled(
		plan: PlanRecord | null,
		runIdentifier: string,
	): Promise<void> {
		if (!plan || plan.status !== "active") return
		const tasks = await this.tasksService.list(runIdentifier)
		if (isPlanSettled(plan, tasks))
			await this.plansService.markCompleted(plan.identifier)
	}

	private async observeForLlm(
		runIdentifier: string,
		trigger: AgentTrigger,
	): Promise<LlmLoopState> {
		const [
			incident,
			previous,
			approvals,
			incomingCalls,
			calls,
			toolCalls,
			tasks,
		] = await Promise.all([
			this.runsService.getByRunIdentifier(runIdentifier),
			this.plansService.findLatestPlan(runIdentifier),
			this.approvalsService.list(runIdentifier),
			this.incomingCalls.list(runIdentifier),
			this.engineersService.list(runIdentifier),
			this.toolsService.list(runIdentifier),
			this.tasksService.list(runIdentifier),
		])
		const learning = await this.learningService.list(
			this.scenarioOf(incident).family,
		)
		const input = await this.buildLlmInput(
			incident,
			previous,
			describeTrigger(trigger, this.messagesFor(incident)),
			this.messagesFor(incident),
			approvals,
			learning,
		)
		return JSON.parse(
			JSON.stringify({
				blocked: incomingCalls.some(
					(call) => call.status === "pending",
				),
				evidence: {
					approvals,
					calls,
					engineerCall: {
						mode: this.engineersService.mode,
						provider: this.engineersService.provider,
						technicalQuestionsSupported:
							this.engineersService.mode === "simulated" ||
							this.engineersService.provider === "happyrobot",
					},
					incomingCalls,
					learning,
					recovery: { mode: this.recoveryService.mode },
					tasks,
					toolCalls: toolCalls.slice(-30),
				},
				input,
			}),
		) as LlmLoopState
	}

	private async buildLlmInput(
		incident: IncidentSnapshot,
		previous: PlanRecord | null,
		triggeredBy: string,
		messages: AgentMessages,
		approvals: ReadonlyArray<ApprovalRecord>,
		learning: ReadonlyArray<LearningInsightRecord>,
	): Promise<PlanBuildInput> {
		const scenario = this.scenarioOf(incident)
		const rejectedApprovals = approvals.filter(
			(approval) => approval.status === "rejected",
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
			learning,
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
		return input
	}

	private async createPlanVersion(
		incident: IncidentSnapshot,
		previous: PlanRecord | null,
		triggeredBy: string,
		messages: AgentMessages,
		draft: PlanDraft,
	): Promise<PlanRecord> {
		const selectedResource = incident.resources.find(
			(resource) =>
				resource.identifier === draft.capacity.resourceIdentifier,
		)
		if (
			selectedResource &&
			selectedResource.region !== incident.backupRegion
		) {
			await this.incidentsService.setBackupRegion(
				incident.runIdentifier,
				selectedResource.region,
			)
		}
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
			idempotencyKey: `save-plan:${decisionIdentifier}`,
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
		learning: ReadonlyArray<LearningInsightRecord>,
	): Promise<CapacityAssumption | null> {
		for (const resource of incident.resources) {
			if (resource.confirmed) {
				continue
			}
			const record = learning.find(
				(item) =>
					item.kind === "capacity-overstated" &&
					item.subject === resource.identifier,
			)
			const insight =
				record?.data.kind === "capacity-overstated"
					? { ...record.data, observations: record.observations }
					: null
			if (!insight) {
				continue
			}
			if (insight.confirmedCapacity >= resource.totalCapacity) {
				continue
			}
			return {
				assumedCapacity: insight.confirmedCapacity,
				observations: insight.observations,
				reportedCapacity: insight.reportedCapacity,
				resourceIdentifier: resource.identifier,
			}
		}
		return null
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
			case "check_services_status":
			case "prioritize_customers":
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
			case "services-status":
				await this.plansService.updateStep(
					plan.identifier,
					step.identifier,
					{
						attempts: step.attempts,
						resultSummary: messages.servicesChecked(
							output.healthyCount,
							output.totalCount,
							output.discrepancies,
						),
						status: "completed",
						statusReason: messages.informationGathered,
						toolCallIdentifier: toolCall.identifier,
					},
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
			case "customer-priorities":
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
