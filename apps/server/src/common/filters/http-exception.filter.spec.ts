import { ArgumentsHost, BadRequestException, Logger } from "@nestjs/common"
import { HTTPExceptionFilter } from "./http-exception.filter"

describe("HappyRobot rejection logging", () => {
	const warn = jest
		.spyOn(Logger.prototype, "warn")
		.mockImplementation(() => {})
	afterEach(() => warn.mockClear())
	afterAll(() => warn.mockRestore())

	function reject(url: string, exception: BadRequestException) {
		const json = jest.fn()
		const status = jest.fn().mockReturnValue({ json })
		const host = {
			switchToHttp: () => ({
				getRequest: () => ({
					body: { reason: "private conversation" },
					headers: { authorization: "secret-header" },
					method: "POST",
					url,
				}),
				getResponse: () => ({ status }),
			}),
		} as ArgumentsHost
		new HTTPExceptionFilter().catch(exception, host)
		return { json, status }
	}

	it.each(["", "/initiation", "/call-outcomes"])(
		"logs validation constraints for the %s endpoint without request contents",
		(suffix) => {
			const { status, json } = reject(
				`/api/webhooks/happyrobot${suffix}?token=secret-query`,
				new BadRequestException(["sessionReference must be a string"]),
			)
			expect(status).toHaveBeenCalledWith(400)
			expect(warn).toHaveBeenCalledWith("HappyRobot webhook rejected", {
				correlationIdentifier: expect.any(String),
				details: ["sessionReference must be a string"],
				method: "POST",
				path: `/api/webhooks/happyrobot${suffix}`,
				reason: "Validation failed",
				statusCode: 400,
			})
			expect(JSON.stringify(warn.mock.calls)).not.toMatch(
				/secret|private conversation/,
			)
			expect(json.mock.calls[0][0].correlationIdentifier).toBe(
				warn.mock.calls[0][1].correlationIdentifier,
			)
		},
	)

	it("does not log parser messages that may contain request data", () => {
		reject(
			"/api/webhooks/happyrobot",
			new BadRequestException('Invalid JSON "private conversation"'),
		)
		expect(JSON.stringify(warn.mock.calls)).not.toContain(
			"private conversation",
		)
		expect(warn).toHaveBeenCalledWith(
			"HappyRobot webhook rejected",
			expect.objectContaining({ reason: "Bad request" }),
		)
	})

	it("does not add logging to unrelated routes", () => {
		reject("/api/demo/start", new BadRequestException(["invalid"]))
		expect(warn).not.toHaveBeenCalled()
	})
})
