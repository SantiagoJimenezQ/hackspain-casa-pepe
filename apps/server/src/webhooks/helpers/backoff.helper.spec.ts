import {
	backoffMilliseconds,
	matchesEventType,
} from "@webhooks/helpers/backoff.helper"

describe("webhook backoff helper", () => {
	it("grows exponentially and caps at one minute", () => {
		expect(backoffMilliseconds(1)).toBe(2000)
		expect(backoffMilliseconds(3)).toBe(8000)
		expect(backoffMilliseconds(10)).toBe(60000)
	})

	it("matches every event when the subscription has no filter", () => {
		expect(matchesEventType([], "plan.created")).toBe(true)
		expect(matchesEventType(["plan.created"], "plan.created")).toBe(true)
		expect(matchesEventType(["plan.created"], "task.assigned")).toBe(false)
	})
})
