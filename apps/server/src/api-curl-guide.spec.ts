import { AddressInfo } from "node:net"
import { ActivityModule } from "@activity/activity.module"
import { ActivityEventEntity } from "@activity/entities/activity-event.entity"
import { ActivityRecord } from "@activity/types/activity.type"
import { AgentModule } from "@agent/agent.module"
import { LlmClientService } from "@agent/llm/llm-client.service"
import { ApprovalsModule } from "@approvals/approvals.module"
import { ApprovalEntity } from "@approvals/entities/approval.entity"
import { ApprovalRecord } from "@approvals/types/approval.type"
import { AuthenticationModule } from "@authentication/authentication.module"
import { CommonModule } from "@common/common.module"
import { API_PREFIX } from "@common/constants/application.constant"
import { HTTPExceptionFilter } from "@common/filters/http-exception.filter"
import { Page } from "@common/types/pagination.type"
import { EngineersModule } from "@engineers/engineers.module"
import { EngineerCallEntity } from "@engineers/entities/engineer-call.entity"
import { IncomingCallEntity } from "@engineers/entities/incoming-call.entity"
import { HealthModule } from "@health/health.module"
import { IncidentEntity } from "@incidents/entities/incident.entity"
import { IncidentsModule } from "@incidents/incidents.module"
import { IncidentSnapshot } from "@incidents/types/incident.type"
import { LearningInsightEntity } from "@learning/entities/learning-insight.entity"
import { LearningModule } from "@learning/learning.module"
import { RunReport } from "@learning/types/learning.type"
import { INestApplication, ValidationPipe } from "@nestjs/common"
import { EventEmitterModule } from "@nestjs/event-emitter"
import { HealthCheckResult, TypeOrmHealthIndicator } from "@nestjs/terminus"
import { Test } from "@nestjs/testing"
import { getRepositoryToken } from "@nestjs/typeorm"
import { PlanEntity } from "@plans/entities/plan.entity"
import { PlansModule } from "@plans/plans.module"
import { CurrentPlanResponse, PlanRecord } from "@plans/types/plan.type"
import { RecoveryActionEntity } from "@recovery/entities/recovery-action.entity"
import { RecoveryModule } from "@recovery/recovery.module"
import { ReplaysModule } from "@replays/replays.module"
import { ApprovalScenariosFixture } from "@root/testing/approval-scenarios.fixture"
import { InMemoryRepository } from "@root/testing/in-memory-repository"
import {
	createScriptedLlmClient,
	ScriptedLlmClient,
} from "@root/testing/scripted-llm.helper"
import { waitFor } from "@root/testing/wait-for.helper"
import { ScenariosModule } from "@scenarios/scenarios.module"
import { ScenariosService } from "@scenarios/services/scenarios.service"
import {
	ScenarioDefinition,
	ScenarioSummary,
} from "@scenarios/types/scenario.type"
import { TaskEntity } from "@tasks/entities/task.entity"
import { TasksModule } from "@tasks/tasks.module"
import { TaskRecord } from "@tasks/types/task.type"
import { StatusPublicationEntity } from "@tools/entities/status-publication.entity"
import { ToolCallEntity } from "@tools/entities/tool-call.entity"
import { ToolTestEntity } from "@tools/testing/tool-test.entity"
import { ToolsModule } from "@tools/tools.module"
import { ToolDefinitionView } from "@tools/types/tool.type"
import { CompanyCallEntity } from "./company-calls/company-call.entity"

const ENTITIES = [
	CompanyCallEntity,
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

type RequestOptions = {
	readonly auth?: boolean
	readonly body?: unknown
	readonly method?: string
}

type HTTPResult<Body> = {
	readonly body: Body
	readonly status: number
}

type HealthResponse = HealthCheckResult & {
	readonly info: {
		readonly database: { readonly status: string }
		readonly integrations: {
			readonly status: string
			readonly engineerCalls: string
			readonly recoveryEnvironment: string
		}
	}
}

const API_KEY = process.env.API_KEY ?? ""

async function request<Body>(
	baseURL: string,
	path: string,
	options: RequestOptions = {},
): Promise<HTTPResult<Body>> {
	const headers: Record<string, string> = {}
	if (options.auth !== false) {
		headers.Authorization = `API ${API_KEY}`
	}
	if (options.body !== undefined) {
		headers["Content-Type"] = "application/json"
	}
	const response = await fetch(`${baseURL}${path}`, {
		body:
			options.body === undefined
				? undefined
				: JSON.stringify(options.body),
		headers,
		method: options.method ?? "GET",
	})
	const text = await response.text()
	const body = text ? (JSON.parse(text) as Body) : (undefined as Body)
	return { body, status: response.status }
}

async function waitForJSON<Body>(
	baseURL: string,
	path: string,
	predicate: (body: Body) => boolean,
	description: string,
): Promise<Body> {
	return waitFor(async () => {
		const response = await request<Body>(baseURL, path)
		if (response.status < 200 || response.status >= 300) {
			return null
		}
		return predicate(response.body) ? response.body : null
	}, description)
}

async function startManualRun(baseURL: string): Promise<IncidentSnapshot> {
	const cleared = await request<{ readonly removed: number }>(
		baseURL,
		"/api/learning/insights",
		{ method: "DELETE" },
	)
	expect(cleared.status).toBe(200)
	expect(cleared.body.removed).toBeGreaterThanOrEqual(0)

	const started = await request<IncidentSnapshot>(
		baseURL,
		"/api/demo/start",
		{
			body: {
				automaticEvents: false,
				mode: "manual",
				scenarioIdentifier: "meteorite-me-south-1",
				seed: 42,
			},
			method: "POST",
		},
	)
	expect(started.status).toBe(201)
	expect(started.body.status).toBe("normal")
	expect(
		started.body.services.every((service) => service.status === "healthy"),
	).toBe(true)
	return started.body
}

describe("API curl walkthrough contract", () => {
	jest.setTimeout(30000)
	let application: INestApplication
	let baseURL: string
	let scriptedLlm: ScriptedLlmClient

	beforeAll(async () => {
		let builder = Test.createTestingModule({
			imports: [
				CommonModule,
				EventEmitterModule.forRoot({ wildcard: false }),
				AuthenticationModule,
				HealthModule,
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
				ReplaysModule,
			],
		})
		builder = builder
			.overrideProvider(ScenariosService)
			.useClass(ApprovalScenariosFixture)
		for (const entity of ENTITIES) {
			builder = builder
				.overrideProvider(getRepositoryToken(entity))
				.useValue(new InMemoryRepository())
		}
		builder = builder.overrideProvider(TypeOrmHealthIndicator).useValue({
			pingCheck: jest.fn().mockResolvedValue({
				database: { status: "up" },
			}),
		})
		scriptedLlm = createScriptedLlmClient()
		builder = builder
			.overrideProvider(LlmClientService)
			.useValue(scriptedLlm)
		const moduleReference = await builder.compile()

		application = moduleReference.createNestApplication()
		application.setGlobalPrefix(API_PREFIX)
		application.useGlobalPipes(
			new ValidationPipe({
				forbidUnknownValues: false,
				transform: true,
				transformOptions: {
					enableImplicitConversion: false,
					exposeDefaultValues: true,
				},
				whitelist: true,
			}),
		)
		application.useGlobalFilters(new HTTPExceptionFilter())
		await application.init()
		await application.listen(0, "127.0.0.1")

		const address = application.getHttpServer().address() as AddressInfo
		baseURL = `http://127.0.0.1:${address.port}`
	})

	afterAll(async () => {
		await application?.close()
	})

	it("covers health, authentication, and run-independent discovery", async () => {
		const health = await request<HealthResponse>(baseURL, "/api/health", {
			auth: false,
		})
		expect(health.status).toBe(200)
		expect(health.body.status).toBe("ok")
		expect(health.body.info.database.status).toBe("up")
		expect(health.body.info.integrations.engineerCalls).toBe("simulated")
		expect(health.body.info.integrations.recoveryEnvironment).toBe(
			"simulated",
		)

		const unauthenticated = await request(baseURL, "/api/scenarios", {
			auth: false,
		})
		expect(unauthenticated.status).toBe(401)

		const scenarios = await request<ReadonlyArray<ScenarioSummary>>(
			baseURL,
			"/api/scenarios",
		)
		expect(scenarios.status).toBe(200)
		expect(scenarios.body.map((scenario) => scenario.identifier)).toContain(
			"meteorite-me-south-1",
		)

		const scenario = await request<ScenarioDefinition>(
			baseURL,
			"/api/scenarios/meteorite-me-south-1",
		)
		expect(scenario.status).toBe(200)
		expect(scenario.body.resources[0].identifier).toBe("backup-oman")

		const tools = await request<ReadonlyArray<ToolDefinitionView>>(
			baseURL,
			"/api/tools",
		)
		expect(tools.status).toBe(200)
		expect(tools.body.map((tool) => tool.name)).toEqual(
			expect.arrayContaining([
				"call_engineer",
				"execute_recovery",
				"verify_recovery",
			]),
		)
	})

	it("tests communication tools without creating or changing an incident", async () => {
		const runsBefore = await request(baseURL, "/api/incidents/runs")
		for (const tool of ["send_incident_email", "call_engineer"]) {
			const response = await request<{
				identifier: string
				status: string
				mode: string
			}>(baseURL, "/api/tools/tests", {
				body: { idempotencyKey: `no-incident-${tool}`, tool },
				method: "POST",
			})
			expect(response.status).toBe(201)
			expect(response.body.status).toBe("succeeded")
			expect(response.body.mode).toBe("simulated")
			const polled = await request(
				baseURL,
				`/api/tools/tests/${response.body.identifier}`,
			)
			expect(polled.body).toEqual(response.body)
		}
		expect((await request(baseURL, "/api/incidents/runs")).body).toEqual(
			runsBefore.body,
		)

		await startManualRun(baseURL)
		const paths = [
			"/api/incidents/current",
			"/api/plans",
			"/api/activity",
			"/api/tools/calls",
			"/api/engineers/calls",
			"/api/agent/status",
		]
		const before = await Promise.all(
			paths.map((path) => request(baseURL, path)),
		)
		for (const tool of ["send_incident_email", "call_engineer"]) {
			const response = await request(baseURL, "/api/tools/tests", {
				body: { idempotencyKey: `active-incident-${tool}`, tool },
				method: "POST",
			})
			expect(response.status).toBe(201)
		}
		const after = await Promise.all(
			paths.map((path) => request(baseURL, path)),
		)
		expect(after).toEqual(before)
	})

	it("runs the mandatory curl walkthrough through the real HTTP boundary", async () => {
		const started = await startManualRun(baseURL)
		const runIdentifier = started.runIdentifier

		const agentStatus = await request(baseURL, "/api/agent/status")
		expect(agentStatus.status).toBe(200)
		expect(agentStatus.body).toEqual(
			expect.objectContaining({
				engineerCallMode: "simulated",
				recoveryMode: "simulated",
			}),
		)

		const overview = await request<{
			readonly revision: string
			readonly incident: IncidentSnapshot
			readonly plan: { readonly kind: string }
		}>(baseURL, `/api/overview?runIdentifier=${runIdentifier}`)
		expect(overview.status).toBe(200)
		expect(overview.body.incident.runIdentifier).toBe(runIdentifier)
		expect(overview.body.plan.kind).toBe("none")
		expect(overview.body.revision).toMatch(/^[a-f0-9]{64}$/)
		const unchanged = await request(
			baseURL,
			`/api/overview?runIdentifier=${runIdentifier}&knownRevision=${overview.body.revision}`,
		)
		expect(unchanged.status).toBe(200)
		expect(unchanged.body).toEqual({
			revision: overview.body.revision,
			unchanged: true,
		})
		expect(
			(
				await request(
					baseURL,
					`/api/overview?knownRevision=${"x".repeat(65)}`,
				)
			).status,
		).toBe(400)

		const initialPlan = await request<CurrentPlanResponse>(
			baseURL,
			`/api/plans/current?runIdentifier=${runIdentifier}`,
		)
		expect(initialPlan.status).toBe(200)
		expect(initialPlan.body.kind).toBe("none")

		const impact = await request(baseURL, "/api/demo/impact", {
			method: "POST",
		})
		expect(impact.status).toBe(200)

		const firstApprovals = await waitForJSON(
			baseURL,
			`/api/approvals?runIdentifier=${runIdentifier}&status=pending`,
			(body: ReadonlyArray<ApprovalRecord>) => body.length > 0,
			"first pending approval",
		)
		const oldApprovalID = firstApprovals[0].identifier
		const oldVersion = firstApprovals[0].planVersion

		const calls = await request(
			baseURL,
			`/api/engineers/calls?runIdentifier=${runIdentifier}`,
		)
		expect(calls.status).toBe(200)
		expect(Array.isArray(calls.body)).toBe(true)

		const initialPlanAfterImpact = await waitForJSON<CurrentPlanResponse>(
			baseURL,
			`/api/plans/current?runIdentifier=${runIdentifier}`,
			(body) =>
				body.kind === "plan" &&
				body.plan.version === oldVersion &&
				body.plan.priorities
					.filter((priority) => priority.decision === "recover-now")
					.map((priority) => priority.serviceIdentifier)
					.join(",") === "orders-database",
			"initial recovery plan",
		)
		expect(initialPlanAfterImpact.kind).toBe("plan")
		const approval = await request<ApprovalRecord>(
			baseURL,
			`/api/approvals/${oldApprovalID}`,
		)
		expect(approval.status).toBe(200)
		expect(approval.body.planVersion).toBe(oldVersion)

		const tasks = await request<ReadonlyArray<TaskRecord>>(
			baseURL,
			`/api/tasks?runIdentifier=${runIdentifier}`,
		)
		expect(tasks.status).toBe(200)
		expect(tasks.body).toHaveLength(2)

		const twist = await request(baseURL, "/api/demo/twist", {
			method: "POST",
		})
		expect(twist.status).toBe(200)

		const revised = await waitForJSON<CurrentPlanResponse>(
			baseURL,
			`/api/plans/current?runIdentifier=${runIdentifier}`,
			(body) =>
				body.kind === "plan" &&
				body.plan.version > oldVersion &&
				body.plan.capacity.totalCapacity === 12,
			"revised plan after capacity twist",
		)
		expect(revised.kind).toBe("plan")
		if (revised.kind !== "plan") {
			throw new Error("Expected a revised plan")
		}
		expect(revised.plan.changesFromPrevious).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "capacity-changed" }),
			]),
		)
		expect(
			revised.plan.priorities.find(
				(priority) => priority.serviceIdentifier === "package-tracking",
			)?.decision,
		).toBe("recover-now")
		expect(
			revised.plan.priorities.find(
				(priority) => priority.serviceIdentifier === "events-stream",
			)?.decision,
		).toBe("recover-now")

		const superseded = await waitForJSON<ApprovalRecord>(
			baseURL,
			`/api/approvals/${oldApprovalID}`,
			(body) => body.status === "superseded",
			"old approval to be superseded",
		)
		expect(superseded.status).toBe("superseded")
		const staleDecision = await request(
			baseURL,
			`/api/approvals/${oldApprovalID}/decision`,
			{
				body: {
					comment: "Stale approval test",
					decision: "approve",
					operatorName: "CI tester",
				},
				method: "POST",
			},
		)
		expect(staleDecision.status).toBe(409)

		const replacementApprovals = await waitForJSON(
			baseURL,
			`/api/approvals?runIdentifier=${runIdentifier}&status=pending`,
			(body: ReadonlyArray<ApprovalRecord>) =>
				body.some((candidate) => candidate.planVersion > oldVersion),
			"replacement approval",
		)
		const replacement = replacementApprovals.find(
			(candidate) => candidate.planVersion > oldVersion,
		)
		expect(replacement).toBeDefined()
		if (!replacement) {
			throw new Error("Expected a replacement approval")
		}

		const approved = await request<ApprovalRecord>(
			baseURL,
			`/api/approvals/${replacement.identifier}/decision`,
			{
				body: {
					comment: "Approve simulated database failover",
					decision: "approve",
					operatorName: "CI tester",
				},
				method: "POST",
			},
		)
		expect(approved.status).toBe(200)
		expect(approved.body.status).toBe("approved")

		const completed = await waitForJSON<CurrentPlanResponse>(
			baseURL,
			`/api/plans/current?runIdentifier=${runIdentifier}`,
			(body) =>
				body.kind === "plan" &&
				body.plan.version >= 4 &&
				body.plan.status === "active" &&
				body.plan.steps.every((step) => step.status === "completed") &&
				body.plan.steps.some(
					(step) =>
						step.identifier === "stp_route-assignment_verify" &&
						step.status === "completed",
				),
			"finished actions with unresolved recovery priorities",
		)
		expect(completed.kind).toBe("plan")

		const incident = await request<IncidentSnapshot>(
			baseURL,
			`/api/incidents/runs/${runIdentifier}`,
		)
		expect(incident.status).toBe(200)
		expect(incident.body.status).toBe("partially-recovered")
		expect(
			incident.body.services.find(
				(service) => service.identifier === "orders-database",
			)?.status,
		).toBe("healthy")
		expect(
			incident.body.services.find(
				(service) => service.identifier === "route-assignment",
			)?.status,
		).toBe("healthy")
		expect(
			incident.body.services.find(
				(service) => service.identifier === "package-tracking",
			)?.status,
		).toBe("healthy")

		const recovery = await request(
			baseURL,
			`/api/recovery/actions?runIdentifier=${runIdentifier}`,
		)
		expect(recovery.status).toBe(200)
		expect(Array.isArray(recovery.body)).toBe(true)

		const toolCalls = await request(
			baseURL,
			`/api/tools/calls?runIdentifier=${runIdentifier}`,
		)
		expect(toolCalls.status).toBe(200)
		expect(Array.isArray(toolCalls.body)).toBe(true)

		const report = await request<RunReport>(
			baseURL,
			`/api/learning/reports/${runIdentifier}`,
		)
		expect(report.status).toBe(200)
		expect(report.body.planVersions).toHaveLength(4)
		expect(report.body.approvals.map((item) => item.status).sort()).toEqual(
			["approved", "superseded"],
		)

		const insights = await request(baseURL, "/api/learning/insights")
		expect(insights.status).toBe(200)
		expect(Array.isArray(insights.body)).toBe(true)

		const plans = await request<ReadonlyArray<PlanRecord>>(
			baseURL,
			`/api/plans?runIdentifier=${runIdentifier}`,
		)
		expect(plans.status).toBe(200)
		expect(plans.body).toHaveLength(4)

		const activity = await request<Page<ActivityRecord>>(
			baseURL,
			`/api/activity?runIdentifier=${runIdentifier}&afterSequence=0&limit=500`,
		)
		expect(activity.status).toBe(200)
		expect(activity.body.items.length).toBeGreaterThan(0)
		expect(scriptedLlm.calls.length).toBeGreaterThan(0)
		expect(scriptedLlm.calls.map(({ call }) => call.function.name)).toEqual(
			expect.arrayContaining(["propose_plan", "execute_step"]),
		)
		expect(
			scriptedLlm.calls.some(({ messages }) =>
				messages.some((message) => message.role === "tool"),
			),
		).toBe(true)
		expect(
			scriptedLlm.calls.every(({ call }) =>
				call.id.startsWith("script-fixture"),
			),
		).toBe(true)
	})

	it("covers task updates, manual cycles, and invalid harness input", async () => {
		const started = await startManualRun(baseURL)
		const runIdentifier = started.runIdentifier

		const invalidEvent = await request(baseURL, "/api/demo/events", {
			body: {
				availableCapacity: -1,
				type: "capacity-limited",
			},
			method: "POST",
		})
		expect(invalidEvent.status).toBe(400)

		const impact = await request(baseURL, "/api/demo/impact", {
			method: "POST",
		})
		expect(impact.status).toBe(200)

		const openTasks = await waitForJSON(
			baseURL,
			`/api/tasks?runIdentifier=${runIdentifier}&status=open`,
			(body: ReadonlyArray<TaskRecord>) => body.length > 0,
			"open task",
		)
		const taskID = openTasks[0].identifier

		const inProgress = await request<TaskRecord>(
			baseURL,
			`/api/tasks/${taskID}/status`,
			{
				body: {
					note: "Investigating",
					status: "in-progress",
					updatedBy: "CI tester",
				},
				method: "PATCH",
			},
		)
		expect(inProgress.status).toBe(200)
		expect(inProgress.body.status).toBe("in-progress")

		const done = await request<TaskRecord>(
			baseURL,
			`/api/tasks/${taskID}/status`,
			{
				body: {
					note: "Test task completed",
					status: "done",
					updatedBy: "CI tester",
				},
				method: "PATCH",
			},
		)
		expect(done.status).toBe(200)
		expect(done.body.status).toBe("done")

		const cycle = await request<{ readonly kind: string }>(
			baseURL,
			"/api/agent/cycle",
			{
				body: { operatorName: "CI tester" },
				method: "POST",
			},
		)
		expect(cycle.status).toBe(200)
		expect(["completed", "failed", "limit-reached", "skipped"]).toContain(
			cycle.body.kind,
		)
	})

	it("covers deterministic seeded simulation controls", async () => {
		const started = await request<IncidentSnapshot>(
			baseURL,
			"/api/demo/start",
			{
				body: {
					automaticEvents: false,
					difficulty: "medium",
					maxConcurrentDisruptions: 2,
					mode: "randomized",
					scenarioIdentifier: "meteorite-me-south-1",
					seed: 42,
				},
				method: "POST",
			},
		)
		expect(started.status).toBe(201)
		const runIdentifier = started.body.runIdentifier

		const impact = await request(baseURL, "/api/demo/impact", {
			method: "POST",
		})
		expect(impact.status).toBe(200)

		const paused = await request<IncidentSnapshot>(
			baseURL,
			"/api/demo/pause",
			{
				method: "POST",
			},
		)
		expect(paused.status).toBe(200)
		expect(paused.body.simulation.paused).toBe(true)

		const advanced = await request<IncidentSnapshot>(
			baseURL,
			"/api/demo/advance",
			{
				body: { minutes: 5 },
				method: "POST",
			},
		)
		expect(advanced.status).toBe(200)
		expect(advanced.body.runIdentifier).toBe(runIdentifier)
		expect(advanced.body.simulation.elapsedMinutes).toBe(5)

		const resumed = await request<IncidentSnapshot>(
			baseURL,
			"/api/demo/resume",
			{ method: "POST" },
		)
		expect(resumed.status).toBe(200)
		expect(resumed.body.simulation.paused).toBe(false)

		const pausedAgain = await request<IncidentSnapshot>(
			baseURL,
			"/api/demo/pause",
			{ method: "POST" },
		)
		expect(pausedAgain.status).toBe(200)
		expect(pausedAgain.body.simulation.paused).toBe(true)
	})

	it("records a paused cycle when the configured LLM provider fails", async () => {
		const started = await startManualRun(baseURL)
		scriptedLlm.clear()
		scriptedLlm.failNextCall()

		const impact = await request(baseURL, "/api/demo/impact", {
			method: "POST",
		})
		expect(impact.status).toBe(200)

		const activity = await waitForJSON<Page<ActivityRecord>>(
			baseURL,
			`/api/activity?runIdentifier=${started.runIdentifier}&afterSequence=0&limit=500`,
			(body) =>
				body.items.some((item) => item.type === "agent.llm-failed"),
			"LLM failure activity",
		)
		expect(
			activity.items.some(
				(item) =>
					item.type === "agent.llm-failed" &&
					item.summary.includes("Autonomous decisions paused"),
			),
		).toBe(true)

		// The engineer call does not depend on the model: it is dispatched before the first
		// turn, so even a dead provider leaves an opening plan holding that call and nothing else.
		const plans = await request<ReadonlyArray<PlanRecord>>(
			baseURL,
			`/api/plans?runIdentifier=${started.runIdentifier}`,
		)
		expect(plans.status).toBe(200)
		const opening = plans.body.find((candidate) => candidate.version === 1)
		expect(opening?.steps.map((step) => step.invocation.name)).toEqual([
			"call_engineer",
		])
	})
})
