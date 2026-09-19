import { AddressInfo } from "node:net"
import { ModelTestsController } from "@agent/controllers/model-tests.controller"
import { ModelTestsService } from "@agent/llm/model-tests.service"
import { AuthenticationModule } from "@authentication/authentication.module"
import { CommonModule } from "@common/common.module"
import { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"

describe("model diagnostic authentication", () => {
	let app: INestApplication
	let url: string
	const execute = jest.fn().mockResolvedValue({ ok: false, results: [] })
	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [ModelTestsController],
			imports: [AuthenticationModule, CommonModule],
			providers: [{ provide: ModelTestsService, useValue: { execute } }],
		}).compile()
		app = module.createNestApplication()
		app.setGlobalPrefix("api")
		await app.listen(0, "127.0.0.1")
		url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/agent/models/test`
	})
	afterAll(async () => {
		await app?.close()
	})
	beforeEach(() => execute.mockClear())
	it("rejects unauthenticated calls before contacting a provider", async () => {
		const response = await fetch(url, { method: "POST" })
		expect(response.status).toBe(401)
		expect(execute).not.toHaveBeenCalled()
	})
	it("returns diagnostic results without needing an active incident", async () => {
		const response = await fetch(url, {
			headers: { Authorization: `API ${process.env.API_KEY}` },
			method: "POST",
		})
		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({ ok: false, results: [] })
		expect(execute).toHaveBeenCalledTimes(1)
	})
})
