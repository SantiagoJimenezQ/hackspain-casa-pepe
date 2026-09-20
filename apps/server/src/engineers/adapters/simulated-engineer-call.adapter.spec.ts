import "reflect-metadata"
import {
	AdapterCallRequest,
	EngineerQuestion,
} from "@engineers/types/engineer.type"
import { SimulatedEngineerCallAdapter } from "./simulated-engineer-call.adapter"

describe("simulated call evidence", () => {
	beforeEach(() => jest.useFakeTimers())
	afterEach(() => jest.useRealTimers())

	async function call(
		questions: EngineerQuestion[],
		enabled = false,
		mode = "simulated",
	) {
		const adapter = new SimulatedEngineerCallAdapter({
			engineerCall: { mode, simulatedAlwaysAuthorized: enabled },
			happyRobot: { simulatedCallDelayMilliseconds: 10 },
		} as never)
		const deliver = jest.fn().mockResolvedValue(undefined)
		await adapter.start(
			{
				call: { identifier: "call_test", questions },
				simulatedScript: {
					answersByKey: {
						capacity: "Capacity still unknown",
						snapshot: "Snapshot is recent",
					},
					summary: "Snapshot and routes confirmed; all ready",
				},
			} as unknown as AdapterCallRequest,
			deliver,
		)
		await jest.advanceTimersByTimeAsync(10)
		return deliver.mock.calls[0][1]
	}

	it("does not confirm facts from a canned summary when no questions were asked", async () => {
		const result = await call([])
		expect(result.answers).toEqual([])
		expect(result.summary).toContain("no technical facts or authorizations")
		expect(result.summary).not.toContain("all ready")
		expect(result.authorizations).toBeUndefined()
	})

	it("summarizes only questions answered, without claiming unasked readiness", async () => {
		const result = await call([
			{ key: "snapshot", question: "Snapshot age?" },
		])
		expect(result.answers).toEqual([
			{
				answer: "Snapshot is recent",
				key: "snapshot",
				question: "Snapshot age?",
			},
		])
		expect(result.summary).toBe("Snapshot age?: Snapshot is recent")
		expect(result.summary).not.toContain("routes")
	})

	it("keeps unknown question answers uncertain", async () => {
		const result = await call([
			{ key: "unknown", question: "Unscripted question?" },
		])
		expect(result.summary).toContain("no information")
		expect(result.answers[0].confirmed).toBeUndefined()
	})
	it("supplies explicitly simulated positive authorizations only when enabled", async () => {
		const result = await call([], true)
		for (const key of ["notifyAllClients", "trafficFailoverAuthorized"]) {
			expect(result.authorizations[key]).toEqual({
				rationale: expect.stringContaining("Simulated authorization"),
				value: true,
			})
		}
		expect(result.summary).toContain("SIMULATED_CALL_ALWAYS_AUTHORIZED")
		expect(result.answers).toEqual([])
	})
	it("does not synthesize authorization when used as a live-call fallback", async () => {
		const result = await call([], true, "live")
		expect(result.authorizations).toBeUndefined()
	})
})
