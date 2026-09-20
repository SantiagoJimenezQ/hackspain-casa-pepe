import { randomBytes } from "node:crypto"
import { AddressInfo } from "node:net"
import { ActivityService } from "@activity/services/activity.service"
import { LlmClientService } from "@agent/llm/llm-client.service"
import { ApprovalEntity } from "@approvals/entities/approval.entity"
import { validateEnvironmentVariables } from "@common/configuration/configuration.factory"
import { ConfigurationService } from "@common/services/configuration.service"
import { EngineerCallEntity } from "@engineers/entities/engineer-call.entity"
import { IncomingCallEntity } from "@engineers/entities/incoming-call.entity"
import { IncidentEntity } from "@incidents/entities/incident.entity"
import { LearningService } from "@learning/services/learning.service"
import { INestApplication, ValidationPipe } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Test } from "@nestjs/testing"
import { PlanEntity } from "@plans/entities/plan.entity"
import { AppModule } from "@root/app.module"
import { TaskEntity } from "@tasks/entities/task.entity"
import { ToolCallEntity } from "@tools/entities/tool-call.entity"
import { DataSource, EntityTarget, ObjectLiteral } from "typeorm"
import { sessionIdForToken } from "./browser-session"

// Dedicated disposable PostgreSQL only. No shared Supabase credentials or provider calls.
const databaseURL = process.env.BROWSER_SESSION_TEST_DATABASE_URL
const describeDatabase = databaseURL ? describe : describe.skip

describeDatabase("anonymous browser isolation against PostgreSQL", () => {
	let app: INestApplication
	let database: DataSource
	let base: string
	const a = randomBytes(32).toString("hex")
	const b = randomBytes(32).toString("hex")
	const provider = jest
		.fn()
		.mockRejectedValue(
			new Error("Provider deliberately disabled in isolation tests"),
		)
	async function request(
		path: string,
		token?: string,
		method = "GET",
		body?: unknown,
	) {
		const response = await fetch(`${base}${path}`, {
			body: body === undefined ? undefined : JSON.stringify(body),
			headers: {
				Authorization: `API ${process.env.API_KEY}`,
				"Content-Type": "application/json",
				...(token ? { "x-casa-pepe-session": token } : {}),
			},
			method,
		})
		const text = await response.text()
		return { body: text ? JSON.parse(text) : null, status: response.status }
	}
	const start = (token: string) =>
		request("/demo/start", token, "POST", {
			automaticEvents: false,
			scenarioIdentifier: "meteorite-me-south-1",
		})
	beforeAll(async () => {
		const url = new URL(databaseURL ?? "")
		if (
			!["localhost", "127.0.0.1"].includes(url.hostname) ||
			!url.pathname.includes("test")
		)
			throw new Error("A disposable local test database is required")
		const config = new ConfigurationService(
			new ConfigService(
				validateEnvironmentVariables({
					...process.env,
					DATABASE_POOL_MAXIMUM: 6,
					SUPABASE_DATABASE_URL: databaseURL,
				}),
			),
		)
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(ConfigurationService)
			.useValue(config)
			.overrideProvider(LlmClientService)
			.useValue({ complete: provider })
			.compile()
		app = module.createNestApplication({ logger: false })
		app.setGlobalPrefix("api")
		app.useGlobalPipes(
			new ValidationPipe({ transform: true, whitelist: true }),
		)
		await app.listen(0, "127.0.0.1")
		database = app.get(DataSource)
		base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`
	}, 30000)
	afterAll(async () => {
		await app?.close()
	})

	it("requires a session and does not adopt another browser's active run", async () => {
		expect((await request("/incidents/current")).status).toBe(401)
		expect((await request("/incidents/current", "invalid")).status).toBe(
			401,
		)
		const first = await start(a)
		expect(first.status).toBe(201)
		expect((await request("/incidents/current", b)).status).toBe(409)
		const second = await start(b)
		expect(second.status).toBe(201)
		expect(second.body.runIdentifier).not.toBe(first.body.runIdentifier)
		expect(
			(await request("/incidents/current", a)).body.runIdentifier,
		).toBe(first.body.runIdentifier)
		const rows = await database
			.getRepository(IncidentEntity)
			.findBy({ browserSessionId: sessionIdForToken(a) })
		expect(rows.length).toBeGreaterThan(0)
		expect(JSON.stringify(rows)).not.toContain(a)
	})

	it("rejects foreign identifiers in reads, controls, reports, replays and streams", async () => {
		const run = (await request("/incidents/current", a)).body.runIdentifier
		for (const [path, method, body] of [
			[`/overview?runIdentifier=${run}`, "GET"],
			[`/incidents/runs/${run}`, "GET"],
			[`/learning/reports/${run}`, "GET"],
			[`/activity/llm?runIdentifier=${run}`, "GET"],
			[`/activity/stream?runIdentifier=${run}`, "GET"],
			[`/demo/reset?runIdentifier=${run}`, "POST"],
			[`/demo/impact?runIdentifier=${run}`, "POST"],
			["/replays", "POST", { sourceRunIdentifier: run }],
			[
				"/engineers/incoming-calls/simulate",
				"POST",
				{ runIdentifier: run },
			],
		] as const)
			expect((await request(path, b, method, body)).status).toBe(404)
		const runs = (await request("/incidents/runs", b)).body
		expect(
			runs.some(
				(item: { runIdentifier: string }) => item.runIdentifier === run,
			),
		).toBe(false)
	})

	it("checks ownership of child records before allowing reads or mutations", async () => {
		const run = (await request("/incidents/current", a)).body.runIdentifier
		const resources: [EntityTarget<ObjectLiteral>, string, string][] = [
			[ApprovalEntity, "/approvals/RESOURCE/decision", "POST"],
			[ApprovalEntity, "/approvals/RESOURCE", "GET"],
			[PlanEntity, "/plans/RESOURCE", "GET"],
			[TaskEntity, "/tasks/RESOURCE/status", "PATCH"],
			[EngineerCallEntity, "/engineers/calls/RESOURCE", "GET"],
			[ToolCallEntity, "/tools/calls/RESOURCE", "GET"],
			[
				IncomingCallEntity,
				"/engineers/incoming-calls/RESOURCE/confirm",
				"POST",
			],
		]
		for (const [entity, path, method] of resources) {
			const identifier = `test-${randomBytes(12).toString("hex")}`
			const record: ObjectLiteral = {}
			for (const column of database.getMetadata(entity).columns) {
				record[column.propertyName] =
					column.type === "jsonb"
						? []
						: column.type === "boolean"
							? false
							: column.type === "integer"
								? 0
								: ""
			}
			Object.assign(record, { identifier, runIdentifier: run })
			await database.getRepository(entity).insert(record)
			expect(
				(
					await request(
						path.replace("RESOURCE", identifier),
						b,
						method,
						method === "GET" ? undefined : {},
					)
				).status,
			).toBe(404)
		}
	})

	it("serializes simultaneous starts and keeps the other browser active", async () => {
		const other = (await request("/incidents/current", b)).body
			.runIdentifier
		const results = await Promise.all([start(a), start(a), start(a)])
		expect(results.map((result) => result.status)).toEqual([201, 201, 201])
		const active = await database
			.getRepository(IncidentEntity)
			.findBy({ active: true, browserSessionId: sessionIdForToken(a) })
		expect(active).toHaveLength(1)
		expect(
			(await request("/incidents/current", b)).body.runIdentifier,
		).toBe(other)
		const reset = await request("/demo/reset", a, "POST")
		expect(reset.status).toBe(200)
		expect(reset.body.runIdentifier).not.toBe(active[0].runIdentifier)
		expect(
			(await request("/incidents/current", b)).body.runIdentifier,
		).toBe(other)
		const old = await database
			.getRepository(IncidentEntity)
			.findOneByOrFail({ runIdentifier: active[0].runIdentifier })
		expect(old.active).toBe(false)
	})

	it("isolates learning written by background work and clearing it", async () => {
		const ra = (await request("/incidents/current", a)).body.runIdentifier
		const rb = (await request("/incidents/current", b)).body.runIdentifier
		const learning = app.get(LearningService)
		// No HTTP/ALS context: callbacks and timers must derive ownership from the explicit run.
		await learning.recordCapacityObservation(
			"scenario",
			"resource",
			8,
			2,
			ra,
		)
		await learning.recordCapacityObservation(
			"scenario",
			"resource",
			8,
			4,
			rb,
		)
		expect(
			(await learning.findCapacityInsight("scenario", "resource", ra))
				?.confirmedCapacity,
		).toBe(2)
		expect(
			(await learning.findCapacityInsight("scenario", "resource", rb))
				?.confirmedCapacity,
		).toBe(4)
		expect((await request("/learning/insights", a)).body).toHaveLength(1)
		expect((await request("/learning/insights", b)).body).toHaveLength(1)
		expect(
			(await request("/learning/insights", a, "DELETE")).body.removed,
		).toBe(1)
		expect((await request("/learning/insights", b)).body).toHaveLength(1)
	})

	it("streams only the resolved browser run even without a run query", async () => {
		const own = (await request("/incidents/current", a)).body
		const foreign = (await request("/incidents/current", b)).body
		const abort = new AbortController()
		const response = await fetch(`${base}/activity/stream`, {
			headers: {
				Authorization: `API ${process.env.API_KEY}`,
				"x-casa-pepe-session": a,
			},
			signal: abort.signal,
		})
		expect(response.status).toBe(200)
		if (!response.body) throw new Error("Missing stream")
		const reader = response.body.getReader()
		let text = ""
		try {
			const activity = app.get(ActivityService)
			for (const [incident, marker] of [
				[foreign, "foreign-isolation-marker"],
				[own, "own-isolation-marker"],
			] as const) {
				await activity.record({
					correlation: {},
					incidentIdentifier: incident.identifier,
					payload: {},
					runIdentifier: incident.runIdentifier,
					simulated: true,
					source: "harness",
					summary: marker,
					title: marker,
					type: "fact.recorded",
				})
			}
			const deadline = setTimeout(() => abort.abort(), 5000)
			try {
				while (!text.includes("own-isolation-marker")) {
					const chunk = await reader.read()
					if (chunk.done) break
					text += new TextDecoder().decode(chunk.value)
				}
			} finally {
				clearTimeout(deadline)
			}
			expect(text).toContain("own-isolation-marker")
			expect(text).not.toContain("foreign-isolation-marker")
		} finally {
			abort.abort()
			await reader.cancel().catch(() => {})
		}
	})

	it("routes authenticated callbacks to the original run and rejects them after reset", async () => {
		const runIdentifier = (await request("/incidents/current", a)).body
			.runIdentifier
		const payload = {
			callerName: "Synthetic test",
			providerCallIdentifier: `test-${Date.now()}`,
			reportedCapacity: 3,
			runIdentifier,
			summary: "Capacity report",
		}
		const deliver = () =>
			fetch(`${base}/webhooks/happyrobot/incoming`, {
				body: JSON.stringify(payload),
				headers: {
					"Content-Type": "application/json",
					"x-happyrobot-signature":
						process.env.HAPPYROBOT_WEBHOOK_SECRET ?? "",
				},
				method: "POST",
			})
		const received = await deliver()
		expect(received.status).toBe(202)
		const call = await received.json()
		expect(call.runIdentifier).toBe(runIdentifier)
		const otherCalls = (await request("/engineers/incoming-calls", b)).body
		expect(
			otherCalls.some(
				(item: { identifier: string }) =>
					item.identifier === call.identifier,
			),
		).toBe(false)
		await request("/demo/reset", a, "POST")
		expect((await deliver()).status).toBe(409)
	})

	it("keeps administration off browser sessions and public status explicitly run-scoped", async () => {
		expect((await request("/tools/tests", a)).status).toBe(403)
		expect((await request("/webhooks/subscriptions", a)).status).toBe(403)
		expect((await request("/tools/tests")).status).toBe(200)
		expect((await request("/status/public")).body).toBeNull()
	})
})
