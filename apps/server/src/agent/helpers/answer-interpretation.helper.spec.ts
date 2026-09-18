import { interpretAnswer } from "@agent/helpers/answer-interpretation.helper"
import { METEORITE_SCENARIO } from "@scenarios/constants/meteorite-scenario.constant"

describe("interpretAnswer", () => {
	const [snapshotQuestion, , capacityQuestion] =
		METEORITE_SCENARIO.engineerBriefing.questions

	it("uses the scripted interpretation in simulated mode", () => {
		expect(interpretAnswer(snapshotQuestion, "anything", "simulated")).toBe(
			"confirmed",
		)
		expect(interpretAnswer(capacityQuestion, "anything", "simulated")).toBe(
			"pending",
		)
	})

	it("keeps a fact pending when a live answer expresses doubt", () => {
		expect(
			interpretAnswer(
				capacityQuestion,
				"Yes, twelve units are reserved for us",
				"live",
			),
		).toBe("confirmed")
		expect(
			interpretAnswer(
				capacityQuestion,
				"I am not sure, let me check",
				"live",
			),
		).toBe("pending")
	})
})
