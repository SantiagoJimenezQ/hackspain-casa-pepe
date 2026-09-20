import { APIKeyGuard } from "@authentication/guards/api-key.guard"
import { ExecutionContext, UnauthorizedException } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { DataSource } from "typeorm"
import { BrowserSessionGuard } from "./browser-session.guard"

describe("browser session guard", () => {
	const database = { getRepository: jest.fn() }
	const apiKey = { canActivate: jest.fn(() => true) }
	const guard = new BrowserSessionGuard(
		new Reflector(),
		database as unknown as DataSource,
		apiKey as unknown as APIKeyGuard,
	)
	function context(token?: unknown): ExecutionContext {
		return {
			getClass: () => class Controller {},
			getHandler: () => () => {},
			switchToHttp: () => ({
				getRequest: () => ({
					headers:
						token === undefined
							? {}
							: { "x-casa-pepe-session": token },
					params: {},
					query: {},
				}),
			}),
		} as unknown as ExecutionContext
	}
	beforeEach(() => {
		jest.clearAllMocks()
		apiKey.canActivate.mockImplementation(() => true)
	})
	it.each([undefined, "", "legacy", "a".repeat(63), ["a".repeat(64)]])(
		"rejects invalid session %s before database access",
		async (token) => {
			await expect(
				guard.canActivate(context(token)),
			).rejects.toBeInstanceOf(UnauthorizedException)
			expect(database.getRepository).not.toHaveBeenCalled()
		},
	)
	it("checks the API key before looking up identifiers", async () => {
		apiKey.canActivate.mockImplementation(() => {
			throw new UnauthorizedException()
		})
		await expect(
			guard.canActivate(context("a".repeat(64))),
		).rejects.toBeInstanceOf(UnauthorizedException)
		expect(database.getRepository).not.toHaveBeenCalled()
	})
	it("accepts an anonymous token without exposing its digest", async () => {
		await expect(guard.canActivate(context("a".repeat(64)))).resolves.toBe(
			true,
		)
	})
})
