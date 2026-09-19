import { DecisionTimer, waitingMilliseconds } from "./decision-timing"

describe("decision timing", () => {
	it("M01 measures with injected monotonic time", () => {
		let now = 100
		const timer = new DecisionTimer(
			() => now,
			() => "fixed",
		)
		now = 350
		timer.modelFinished()
		now = 400
		expect(timer.finish()).toEqual({
			elapsedMilliseconds: 300,
			modelMilliseconds: 250,
			startedAt: "fixed",
		})
	})
	it("M02 unions overlapping waits and clips to the incident", () => {
		expect(
			waitingMilliseconds(
				[
					[100, 400],
					[200, 500],
				],
				0,
				1000,
			),
		).toBe(400)
		expect(
			waitingMilliseconds(
				[
					[-100, 100],
					[900, 1200],
				],
				0,
				1000,
			),
		).toBe(200)
	})
	it("M05 clamps clock anomalies", () => {
		let now = 100
		const timer = new DecisionTimer(() => now)
		now = 10
		expect(timer.finish().elapsedMilliseconds).toBe(0)
	})
})
