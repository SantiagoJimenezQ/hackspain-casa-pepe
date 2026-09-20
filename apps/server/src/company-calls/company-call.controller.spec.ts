import "reflect-metadata"
import { AddressInfo } from "node:net"
import { AuthenticationModule } from "@authentication/authentication.module"
import { CommonModule } from "@common/common.module"
import { ConfigurationService } from "@common/services/configuration.service"
import { INestApplication, ValidationPipe } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { CompanyCallController } from "./company-call.controller"
import { CompanyCallGuard } from "./company-call.guard"
import { CompanyCallService } from "./company-call.service"

describe("company call HTTP boundary", () => {
	let app: INestApplication
	let base: string
	const service = {
		initiate: jest.fn().mockResolvedValue({ sessionReference: "opaque" }),
		list: jest.fn().mockResolvedValue([]),
		receive: jest.fn().mockResolvedValue({
			accepted: true,
			outcomeIdentifier: "priority-1",
			status: "received",
		}),
	}
	const secret = "dedicated-inbound-secret"
	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [CompanyCallController],
			imports: [AuthenticationModule, CommonModule],
			providers: [
				CompanyCallGuard,
				{ provide: CompanyCallService, useValue: service },
			],
		}).compile()
		const config = module.get(ConfigurationService)
		jest.spyOn(config, "happyRobot", "get").mockReturnValue({
			...config.happyRobot,
			inboundWebhookSecret: secret,
		})
		app = module.createNestApplication()
		app.setGlobalPrefix("api")
		app.useGlobalPipes(
			new ValidationPipe({ transform: true, whitelist: true }),
		)
		await app.listen(0, "127.0.0.1")
		base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`
	})
	afterAll(async () => {
		await app?.close()
	})
	beforeEach(() => jest.clearAllMocks())
	const post = (path: string, body: unknown, token = secret) =>
		fetch(base + path, {
			body: JSON.stringify(body),
			headers: {
				"Content-Type": "application/json",
				"x-casa-pepe-webhook-secret": token,
			},
			method: "POST",
		})
	it("requires the dedicated secret", async () => {
		for (const path of ["initiation", "call-outcomes"])
			expect(
				(await post(`/webhooks/happyrobot/${path}`, {}, "wrong"))
					.status,
			).toBe(401)
		expect(service.initiate).not.toHaveBeenCalled()
		expect(service.receive).not.toHaveBeenCalled()
	})
	it("returns the specified initiation and receipt statuses", async () => {
		const r = await post("/webhooks/happyrobot/initiation", {
			conversationId: "happyrobot:run-1",
		})
		expect(r.status).toBe(200)
		expect(await r.json()).toEqual({ sessionReference: "opaque" })
		expect(
			(
				await post("/webhooks/happyrobot/call-outcomes", {
					outcome: {
						customerName: " Happy Robot ",
						kind: "priority-request",
						requestedPriority: "first",
					},
					schemaVersion: 1,
					sessionReference: "opaque",
				})
			).status,
		).toBe(202)
		expect(service.receive).toHaveBeenCalledWith(
			expect.objectContaining({
				outcome: expect.objectContaining({
					customerName: "Happy Robot",
				}),
			}),
		)
	})
	it.each([
		{},
		{ outcome: [], schemaVersion: 1, sessionReference: "opaque" },
		{
			outcome: {
				customerName: "HR",
				kind: "priority-request",
				requestedPriority: "first",
			},
			schemaVersion: "1",
			sessionReference: "opaque",
		},
		{
			outcome: {
				customerName: " ",
				kind: "priority-request",
				requestedPriority: "first",
			},
			schemaVersion: 1,
			sessionReference: "opaque",
		},
		{
			outcome: { kind: "capacity-report", reportedCapacity: 100 },
			schemaVersion: 1,
			sessionReference: "opaque",
		},
	])("rejects malformed or capacity payloads", async (body) => {
		expect(
			(await post("/webhooks/happyrobot/call-outcomes", body)).status,
		).toBe(400)
		expect(service.receive).not.toHaveBeenCalled()
	})
	it("protects the operator route", async () => {
		expect(
			(await fetch(`${base}/call-outcomes?runIdentifier=run-1`)).status,
		).toBe(401)
		expect(
			(
				await fetch(`${base}/call-outcomes?runIdentifier=run-1`, {
					headers: { Authorization: `API ${process.env.API_KEY}` },
				})
			).status,
		).toBe(200)
	})
})
