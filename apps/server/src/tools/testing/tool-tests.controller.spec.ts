import { AddressInfo } from "node:net"
import { AuthenticationModule } from "@authentication/authentication.module"
import { CommonModule } from "@common/common.module"
import { API_PREFIX } from "@common/constants/application.constant"
import { HTTPExceptionFilter } from "@common/filters/http-exception.filter"
import { INestApplication, ValidationPipe } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { ToolTestsController } from "@tools/testing/tool-tests.controller"
import { ToolTestsService } from "@tools/testing/tool-tests.service"
import { HappyRobotSecretGuard } from "@webhooks/guards/inbound-secret.guard"

type HTTPResult<Body> = {
	readonly body: Body
	readonly status: number
}

type RequestOptions = {
	readonly auth?: boolean
	readonly body?: unknown
	readonly headers?: Record<string, string>
	readonly method?: string
}

const API_KEY = process.env.API_KEY ?? ""
const HAPPYROBOT_WEBHOOK_SECRET = process.env.HAPPYROBOT_WEBHOOK_SECRET ?? ""

async function request<Body>(
	baseURL: string,
	path: string,
	options: RequestOptions = {},
): Promise<HTTPResult<Body>> {
	const headers: Record<string, string> = {
		...(options.auth === false ? {} : { Authorization: `API ${API_KEY}` }),
		...(options.headers ?? {}),
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

function happyRobotCallback(identifier: string) {
	return {
		answers: [
			{
				answer: "The synthetic callback confirms the test call.",
				confirmed: true,
				key: "backup_capacity",
			},
		],
		callIdentifier: identifier,
		outcome: "completed",
		summary: "Synthetic tool-test callback",
		transcript: "Synthetic transcript",
	}
}

describe("tool tests HTTP controller", () => {
	let application: INestApplication
	let baseURL: string
	let toolTestsService: {
		readonly catalog: jest.Mock
		readonly completeCall: jest.Mock
		readonly execute: jest.Mock
		readonly get: jest.Mock
	}

	beforeAll(async () => {
		toolTestsService = {
			catalog: jest.fn().mockResolvedValue([
				{
					description: "Send a synthetic incident email",
					liveAvailable: true,
					modes: ["simulated", "live"],
					tool: "send_incident_email",
				},
				{
					description: "Call a synthetic on-call engineer",
					liveAvailable: false,
					modes: ["simulated", "live"],
					tool: "call_engineer",
				},
			]),
			completeCall: jest.fn().mockResolvedValue({ accepted: true }),
			execute: jest.fn().mockResolvedValue({
				createdAt: "2026-09-19T10:00:00.000Z",
				detail: "Synthetic email accepted",
				error: null,
				finishedAt: "2026-09-19T10:00:00.000Z",
				identifier: "tool-test-email-1",
				mode: "simulated",
				providerReference: "",
				result: { accepted: true },
				status: "succeeded",
				tool: "send_incident_email",
			}),
			get: jest.fn().mockResolvedValue({
				createdAt: "2026-09-19T10:00:00.000Z",
				detail: "Synthetic email accepted",
				error: null,
				finishedAt: "2026-09-19T10:00:00.000Z",
				identifier: "tool-test-email-1",
				mode: "simulated",
				providerReference: "",
				result: { accepted: true },
				status: "succeeded",
				tool: "send_incident_email",
			}),
		}

		const moduleReference = await Test.createTestingModule({
			controllers: [ToolTestsController],
			imports: [AuthenticationModule, CommonModule],
			providers: [
				{ provide: ToolTestsService, useValue: toolTestsService },
				HappyRobotSecretGuard,
			],
		}).compile()

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

	beforeEach(() => {
		jest.clearAllMocks()
	})

	it("serves the authenticated catalog and result over HTTP", async () => {
		const catalog = await request(baseURL, "/api/tools/tests")
		expect(catalog.status).toBe(200)
		expect(catalog.body).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ tool: "send_incident_email" }),
			]),
		)

		const created = await request(baseURL, "/api/tools/tests", {
			body: {
				idempotencyKey: "http-email-test-1",
				mode: "simulated",
				tool: "send_incident_email",
			},
			method: "POST",
		})
		expect(created.status).toBe(201)
		expect(created.body).toEqual(
			expect.objectContaining({
				identifier: "tool-test-email-1",
				status: "succeeded",
			}),
		)

		const result = await request(
			baseURL,
			"/api/tools/tests/tool-test-email-1",
		)
		expect(result.status).toBe(200)
		expect(result.body).toEqual(
			expect.objectContaining({ identifier: "tool-test-email-1" }),
		)
		expect(toolTestsService.catalog).toHaveBeenCalledTimes(1)
		expect(toolTestsService.execute).toHaveBeenCalledWith({
			idempotencyKey: "http-email-test-1",
			mode: "simulated",
			tool: "send_incident_email",
		})
		expect(toolTestsService.get).toHaveBeenCalledWith("tool-test-email-1")
	})

	it("accepts a nested engineer request through the authenticated HTTP boundary", async () => {
		const response = await request(baseURL, "/api/tools/tests", {
			body: {
				engineer: {
					name: "Marta Ruiz",
					phone: "+34600000000",
				},
				idempotencyKey: "http-call-test-1",
				mode: "simulated",
				tool: "call_engineer",
			},
			method: "POST",
		})

		expect(response.status).toBe(201)
		expect(toolTestsService.execute).toHaveBeenCalledWith({
			engineer: {
				name: "Marta Ruiz",
				phone: "+34600000000",
			},
			idempotencyKey: "http-call-test-1",
			mode: "simulated",
			tool: "call_engineer",
		})
	})

	it.each([
		["without an API key", {}],
		[
			"with a wrong API key",
			{ headers: { Authorization: "API wrong-key" } },
		],
	])("rejects authenticated routes %s", async (_description, options) => {
		const response = await request<unknown>(baseURL, "/api/tools/tests", {
			...options,
			auth: false,
		})

		expect(response.status).toBe(401)
		expect(toolTestsService.catalog).not.toHaveBeenCalled()
	})

	it.each([
		[
			"an unsupported tool",
			{
				idempotencyKey: "invalid-tool",
				mode: "simulated",
				tool: "delete_everything",
			},
		],
		[
			"a missing idempotency key",
			{
				mode: "simulated",
				tool: "send_incident_email",
			},
		],
		[
			"invalid nested engineer fields",
			{
				engineer: {
					name: 42,
					phone: "not-an-e164-phone",
				},
				idempotencyKey: "invalid-engineer",
				mode: "simulated",
				tool: "call_engineer",
			},
		],
	])("rejects %s before invoking the service", async (_description, body) => {
		const response = await request<unknown>(baseURL, "/api/tools/tests", {
			body,
			method: "POST",
		})

		expect(response.status).toBe(400)
		expect(toolTestsService.execute).not.toHaveBeenCalled()
	})

	it("accepts a HappyRobot callback with its secret and without an operator API key", async () => {
		const callback = await request(
			baseURL,
			"/api/tools/tests/callbacks/happyrobot",
			{
				auth: false,
				body: happyRobotCallback("tool-test-call-1"),
				headers: {
					"x-happyrobot-signature": HAPPYROBOT_WEBHOOK_SECRET,
				},
				method: "POST",
			},
		)

		expect(callback.status).toBe(202)
		expect(callback.body).toEqual({ accepted: true })
		expect(toolTestsService.completeCall).toHaveBeenCalledWith(
			happyRobotCallback("tool-test-call-1"),
		)
	})

	it("keeps boolean/null permissions and interim phase through HTTP validation", async () => {
		const body = {
			...happyRobotCallback("tool-test-call-permissions"),
			authorizations: {
				notifyAllClients: { rationale: "Refused", value: false },
				trafficFailoverAuthorized: {
					rationale: "Unanswered",
					value: null,
				},
			},
			phase: "authorization",
		}
		const response = await request(
			baseURL,
			"/api/tools/tests/callbacks/happyrobot",
			{
				auth: false,
				body,
				headers: {
					"x-happyrobot-signature": HAPPYROBOT_WEBHOOK_SECRET,
				},
				method: "POST",
			},
		)
		expect(response.status).toBe(202)
		expect(toolTestsService.completeCall).toHaveBeenCalledWith(body)
	})

	it("rejects textual permission booleans at the HTTP boundary", async () => {
		const response = await request(
			baseURL,
			"/api/tools/tests/callbacks/happyrobot",
			{
				auth: false,
				body: {
					...happyRobotCallback("tool-test-bad-permissions"),
					authorizations: {
						notifyAllClients: {
							rationale: "Not a JSON boolean",
							value: "false",
						},
						trafficFailoverAuthorized: {
							rationale: "Unknown",
							value: null,
						},
					},
				},
				headers: {
					"x-happyrobot-signature": HAPPYROBOT_WEBHOOK_SECRET,
				},
				method: "POST",
			},
		)
		expect(response.status).toBe(400)
		expect(toolTestsService.completeCall).not.toHaveBeenCalled()
	})

	it("rejects a callback with a missing or wrong secret even when no operator key is supplied", async () => {
		const callback = await request<unknown>(
			baseURL,
			"/api/tools/tests/callbacks/happyrobot",
			{
				auth: false,
				body: happyRobotCallback("tool-test-call-2"),
				headers: { "x-happyrobot-signature": "wrong-secret" },
				method: "POST",
			},
		)

		expect(callback.status).toBe(401)
		expect(toolTestsService.completeCall).not.toHaveBeenCalled()
	})
})
