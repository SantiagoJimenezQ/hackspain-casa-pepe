import { ActivityModule } from "@activity/activity.module"
import { ActivityEventEntity } from "@activity/entities/activity-event.entity"
import { AgentModule } from "@agent/agent.module"
import { LlmClientService } from "@agent/llm/llm-client.service"
import { ApprovalsModule } from "@approvals/approvals.module"
import { ApprovalEntity } from "@approvals/entities/approval.entity"
import { ApprovalsService } from "@approvals/services/approvals.service"
import { CommonModule } from "@common/common.module"
import { EngineersModule } from "@engineers/engineers.module"
import { EngineerCallEntity } from "@engineers/entities/engineer-call.entity"
import { IncomingCallEntity } from "@engineers/entities/incoming-call.entity"
import { IncidentEntity } from "@incidents/entities/incident.entity"
import { IncidentsModule } from "@incidents/incidents.module"
import { IncidentsService } from "@incidents/services/incidents.service"
import { RunsService } from "@incidents/services/runs.service"
import { LearningInsightEntity } from "@learning/entities/learning-insight.entity"
import { LearningModule } from "@learning/learning.module"
import { LearningService } from "@learning/services/learning.service"
import { RunReportService } from "@learning/services/run-report.service"
import { INestApplication } from "@nestjs/common"
import { EventEmitterModule } from "@nestjs/event-emitter"
import { Test } from "@nestjs/testing"
import { getRepositoryToken } from "@nestjs/typeorm"
import { PlanEntity } from "@plans/entities/plan.entity"
import { PlansModule } from "@plans/plans.module"
import { PlansService } from "@plans/services/plans.service"
import { PlanRecord } from "@plans/types/plan.type"
import { RecoveryActionEntity } from "@recovery/entities/recovery-action.entity"
import { RecoveryModule } from "@recovery/recovery.module"
import { InMemoryRepository } from "@root/testing/in-memory-repository"
import {
	createScriptedLlmClient,
	ScriptedLlmClient,
} from "@root/testing/scripted-llm.helper"
import { waitFor } from "@root/testing/wait-for.helper"
import {
	DEFAULT_SCENARIO_IDENTIFIER,
	SPANISH_SCENARIO_IDENTIFIER,
} from "@scenarios/constants/scenario.constant"
import { ScenariosModule } from "@scenarios/scenarios.module"
import { TaskEntity } from "@tasks/entities/task.entity"
import { TasksService } from "@tasks/services/tasks.service"
import { TasksModule } from "@tasks/tasks.module"
import { StatusPublicationEntity } from "@tools/entities/status-publication.entity"
import { ToolCallEntity } from "@tools/entities/tool-call.entity"
import { ToolTestEntity } from "@tools/testing/tool-test.entity"
import { ToolsModule } from "@tools/tools.module"

const ENTITIES = [
	ToolTestEntity,
	IncomingCallEntity,
	StatusPublicationEntity,
	IncidentEntity,
	ActivityEventEntity,
	PlanEntity,
	ApprovalEntity,
	TaskEntity,
	EngineerCallEntity,
	RecoveryActionEntity,
	ToolCallEntity,
	LearningInsightEntity,
]

jest.setTimeout(30000)

describe("agent flow (integration with in-memory repositories)", () => {
	let application: INestApplication
	let incidentsService: IncidentsService
	let runsService: RunsService
	let plansService: PlansService
	let approvalsService: ApprovalsService
	let tasksService: TasksService
	let learningService: LearningService
	let runReportService: RunReportService
	let scriptedLlm: ScriptedLlmClient

	beforeAll(async () => {
		let builder = Test.createTestingModule({
			imports: [
				CommonModule,
				EventEmitterModule.forRoot({ wildcard: false }),
				ScenariosModule,
				IncidentsModule,
				ActivityModule,
				PlansModule,
				ApprovalsModule,
				TasksModule,
				EngineersModule,
				RecoveryModule,
				ToolsModule,
				LearningModule,
				AgentModule,
			],
		})
		for (const entity of ENTITIES) {
			builder = builder
				.overrideProvider(getRepositoryToken(entity))
				.useValue(new InMemoryRepository())
		}
		scriptedLlm = createScriptedLlmClient()
		builder = builder
			.overrideProvider(LlmClientService)
			.useValue(scriptedLlm)
		const moduleReference = await builder.compile()
		application = moduleReference.createNestApplication()
		await application.init()

		incidentsService = application.get(IncidentsService)
		runsService = application.get(RunsService)
		plansService = application.get(PlansService)
		approvalsService = application.get(ApprovalsService)
		tasksService = application.get(TasksService)
		learningService = application.get(LearningService)
		runReportService = application.get(RunReportService)
	})

	afterAll(async () => {
		await application?.close()
	})

	async function waitForPlanVersion(
		runIdentifier: string,
		version: number,
	): Promise<PlanRecord> {
		return waitFor(async () => {
			const plan = await plansService.findLatestPlan(runIdentifier)
			if (plan && plan.version >= version) {
				return plan
			}
			return null
		}, `plan version ${version}`)
	}

	async function waitForStepStatus(
		runIdentifier: string,
		stepIdentifier: string,
		status: string,
	): Promise<PlanRecord> {
		return waitFor(async () => {
			const plan = await plansService.findLatestPlan(runIdentifier)
			if (!plan) {
				return null
			}
			const step = plan.steps.find(
				(candidate) => candidate.identifier === stepIdentifier,
			)
			if (step && step.status === status) {
				return plan
			}
			return null
		}, `${stepIdentifier} to be ${status}`)
	}

	it("runs the whole demo: impact, call, twist, approval, recovery, verification and learning", async () => {
		await learningService.clear()
		const started = await incidentsService.startRun(
			SPANISH_SCENARIO_IDENTIFIER,
		)
		const runIdentifier = started.runIdentifier
		expect(started.status).toBe("normal")

		await incidentsService.applyHarnessEvent(
			{ type: "meteorite-impact" },
			"test",
		)
		const planOne = await waitForStepStatus(
			runIdentifier,
			"stp_contact-engineer",
			"completed",
		)
		expect(planOne.version).toBe(1)
		expect(planOne.summary.startsWith("Recuperar")).toBe(true)
		expect(
			planOne.priorities
				.filter((priority) => priority.decision === "recover-now")
				.map((priority) => priority.serviceIdentifier),
		).toEqual(["orders-database"])

		const incidentAfterCall =
			await runsService.getByRunIdentifier(runIdentifier)
		expect(incidentAfterCall.status).toBe("responding")
		expect(
			incidentAfterCall.facts.filter(
				(fact) => fact.status === "confirmed",
			).length,
		).toBe(4)
		expect(
			incidentAfterCall.facts.filter((fact) => fact.status === "pending")
				.length,
		).toBe(1)

		await waitForStepStatus(
			runIdentifier,
			"stp_orders-database_execute",
			"awaiting-approval",
		)
		const firstApprovals = await approvalsService.list(
			runIdentifier,
			"pending",
		)
		expect(firstApprovals).toHaveLength(1)
		expect(firstApprovals[0].planVersion).toBe(1)
		expect((await tasksService.list(runIdentifier)).length).toBe(2)

		await incidentsService.applyScenarioTwist()
		const planTwo = await waitForPlanVersion(runIdentifier, 2)
		expect(planTwo.capacity.resourceIdentifier).toBe("backup-bahrain")
		expect(planTwo.capacity.totalCapacity).toBe(12)
		expect(
			planTwo.priorities.find(
				(priority) => priority.serviceIdentifier === "package-tracking",
			)?.decision,
		).toBe("recover-now")
		expect(
			planTwo.priorities.find(
				(priority) => priority.serviceIdentifier === "events-stream",
			)?.decision,
		).toBe("recover-now")
		expect(
			planTwo.changesFromPrevious.some(
				(change) => change.kind === "capacity-changed",
			),
		).toBe(true)

		await waitForStepStatus(
			runIdentifier,
			"stp_orders-database_execute",
			"awaiting-approval",
		)
		const supersededApproval = await approvalsService.getByIdentifier(
			firstApprovals[0].identifier,
		)
		expect(supersededApproval.status).toBe("superseded")
		const [pendingApproval] = await approvalsService.list(
			runIdentifier,
			"pending",
		)
		expect(pendingApproval.planVersion).toBe(2)

		await approvalsService.decide({
			approvalIdentifier: pendingApproval.identifier,
			comment: "Adelante",
			decision: "approve",
			operatorName: "Luis",
		})
		await waitForStepStatus(
			runIdentifier,
			"stp_route-assignment_verify",
			"completed",
		)
		const finalPlan = await waitFor(async () => {
			const plan = await plansService.findLatestPlan(runIdentifier)
			return plan?.steps.every((step) => step.status === "completed")
				? plan
				: null
		}, "planned actions finishing")
		expect(finalPlan.status).toBe("active")
		expect(
			finalPlan.priorities.some(
				(priority) =>
					priority.decision === "waiting-for-dependency" ||
					priority.decision === "postpone",
			),
		).toBe(true)
		const statuses = Object.fromEntries(
			finalPlan.steps.map((step) => [step.identifier, step.status]),
		)
		expect(statuses["stp_orders-database_verify"]).toBe("completed")
		expect(statuses["stp_route-assignment_verify"]).toBe("completed")
		expect(statuses["stp_package-tracking_verify"]).toBe("completed")
		expect(statuses["stp_support-communication"]).toBe("completed")

		const finalIncident =
			await runsService.getByRunIdentifier(runIdentifier)
		const serviceStatuses = Object.fromEntries(
			finalIncident.services.map((service) => [
				service.identifier,
				service.status,
			]),
		)
		expect(finalIncident.status).toBe("partially-recovered")
		expect(finalIncident.backupRegion).toBe("me-south-1")
		expect(serviceStatuses).toEqual({
			"customer-notifications": "degraded",
			"driver-mobile-api": "healthy",
			"events-stream": "healthy",
			"orders-database": "healthy",
			"package-tracking": "healthy",
			"route-assignment": "healthy",
		})
		expect(
			finalIncident.resources.find(
				(resource) => resource.identifier === "backup-bahrain",
			)?.allocatedCapacity,
		).toBe(12)

		const report = await runReportService.build(runIdentifier)
		expect(report.planVersions).toHaveLength(2)
		expect(
			report.approvals.map((approval) => approval.status).sort(),
		).toEqual(["approved", "superseded"])
		expect(report.toolCalls.failed).toBe(0)
		expect(
			report.lessons.some((lesson) => lesson.includes("reported 4")),
		).toBe(true)
		const firstFlowCalls = scriptedLlm.calls.slice()
		expect(firstFlowCalls.length).toBeGreaterThan(0)
		expect(firstFlowCalls.map(({ call }) => call.function.name)).toEqual(
			expect.arrayContaining(["propose_plan", "execute_step"]),
		)
		expect(
			firstFlowCalls.some(
				({ call }) => call.function.name === "wait_for_input",
			),
		).toBe(true)
		expect(
			firstFlowCalls.some(({ messages }) =>
				messages.some((message) => message.role === "tool"),
			),
		).toBe(true)
		expect(new Set(firstFlowCalls.map(({ call }) => call.id)).size).toBe(
			firstFlowCalls.length,
		)
		expect(firstFlowCalls[0].currentState.input.language).toBe("es")
		expect(
			firstFlowCalls[0].currentState.input.incident,
		).not.toHaveProperty("simulation")
		expect(
			firstFlowCalls[0].currentState.input.briefing.questions[0],
		).not.toHaveProperty("simulatedAnswer")
	})

	it("uses the capacity learned in the previous run when planning a new one, in either language", async () => {
		const insight = await learningService.findCapacityInsight(
			DEFAULT_SCENARIO_IDENTIFIER,
			"backup-oman",
		)
		expect(insight?.confirmedCapacity).toBe(1)

		const restarted = await incidentsService.startRun(
			DEFAULT_SCENARIO_IDENTIFIER,
		)
		await incidentsService.applyHarnessEvent(
			{ type: "meteorite-impact" },
			"test",
		)
		const plan = await waitForPlanVersion(restarted.runIdentifier, 1)

		expect(plan.capacity.resourceIdentifier).toBe("backup-bahrain")
		expect(plan.capacity.totalCapacity).toBe(12)
		expect(plan.capacity.assumedCapacity).toBe(12)
		expect(
			plan.priorities.find(
				(priority) => priority.serviceIdentifier === "package-tracking",
			)?.decision,
		).toBe("recover-now")
		await waitForStepStatus(
			restarted.runIdentifier,
			"stp_contact-engineer",
			"completed",
		)
	})

	it("respects an operator rejection and keeps the service postponed in the revised plan", async () => {
		await learningService.clear()
		const started = await incidentsService.startRun(
			DEFAULT_SCENARIO_IDENTIFIER,
		)
		await incidentsService.applyHarnessEvent(
			{ type: "meteorite-impact" },
			"test",
		)
		await waitForStepStatus(
			started.runIdentifier,
			"stp_orders-database_execute",
			"awaiting-approval",
		)
		const [pending] = await approvalsService.list(
			started.runIdentifier,
			"pending",
		)

		await approvalsService.decide({
			approvalIdentifier: pending.identifier,
			comment: "Wait for the DBA",
			decision: "reject",
			operatorName: "Luis",
		})
		const revised = await waitForPlanVersion(started.runIdentifier, 2)

		const database = revised.priorities.find(
			(priority) => priority.serviceIdentifier === "orders-database",
		)
		expect(database?.decision).toBe("postpone")
		expect(database?.reason).toContain("Rejected by Luis")
		expect(
			revised.priorities
				.filter((priority) => priority.decision === "recover-now")
				.map((priority) => priority.serviceIdentifier),
		).toEqual(["events-stream"])
		expect(
			revised.priorities.find(
				(priority) => priority.serviceIdentifier === "route-assignment",
			)?.decision,
		).toBe("postpone")
		expect(
			(await approvalsService.list(started.runIdentifier, "pending"))
				.length,
		).toBe(0)
	})
})
