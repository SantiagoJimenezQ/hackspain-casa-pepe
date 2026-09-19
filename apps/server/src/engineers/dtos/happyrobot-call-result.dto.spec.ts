import "reflect-metadata"
import { plainToInstance } from "class-transformer"
import { validate } from "class-validator"
import { HappyRobotCallResultDTO } from "./happyrobot-call-result.dto"

const permission = (value: unknown) => ({
	rationale: "Explicit answer from the recipient",
	value,
})
const callback = (authorizations?: unknown) =>
	plainToInstance(HappyRobotCallResultDTO, {
		callIdentifier: "test",
		outcome: "completed",
		...(authorizations === undefined ? {} : { authorizations }),
	})
describe("HappyRobot permission validation", () => {
	it("preserves explicit refusal separately from an unknown answer", async () => {
		const body = callback({
			notifyAllClients: permission(false),
			trafficFailoverAuthorized: permission(null),
		})
		expect(await validate(body)).toEqual([])
		expect(body.authorizations?.notifyAllClients.value).toBe(false)
		expect(body.authorizations?.trafficFailoverAuthorized.value).toBeNull()
	})
	it.each(["true", "false", 1, 0, undefined])(
		"rejects non-boolean permission %s",
		async (value) => {
			expect(
				await validate(
					callback({
						notifyAllClients: permission(value),
						trafficFailoverAuthorized: permission(true),
					}),
				),
			).not.toHaveLength(0)
		},
	)
	it("requires both permission records when supplied", async () => {
		expect(
			await validate(callback({ notifyAllClients: permission(true) })),
		).not.toHaveLength(0)
	})
	it("accepts existing callbacks without permission evidence", async () => {
		expect(await validate(callback())).toEqual([])
	})
})
