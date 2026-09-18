import { NEGATIVE_ANSWER_PATTERN } from "@agent/constants/agent.constant"
import { EngineerCallMode } from "@common/types/configuration.type"
import { FactStatus } from "@incidents/types/incident.type"
import { ScenarioEngineerQuestion } from "@scenarios/types/scenario.type"

export function interpretAnswer(
	question: ScenarioEngineerQuestion,
	answer: string,
	mode: EngineerCallMode,
): FactStatus {
	switch (mode) {
		case "simulated":
			return question.simulatedConfirms ? "confirmed" : "pending"
		case "live":
			return NEGATIVE_ANSWER_PATTERN.test(answer)
				? "pending"
				: "confirmed"
	}
}
