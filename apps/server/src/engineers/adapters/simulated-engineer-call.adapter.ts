import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import { describeError } from "@common/helpers/external-response.helper"
import { ConfigurationService } from "@common/services/configuration.service"
import { EngineerCallMode } from "@common/types/configuration.type"
import {
	AdapterCallOutcome,
	AdapterCallRequest,
	DeliverCallResult,
	EngineerCallAdapter,
} from "@engineers/types/engineer.type"
import { Injectable, Logger } from "@nestjs/common"

@Injectable()
export class SimulatedEngineerCallAdapter implements EngineerCallAdapter {
	readonly mode: EngineerCallMode = "simulated"

	private readonly logger = new Logger(SimulatedEngineerCallAdapter.name)

	constructor(private readonly configuration: ConfigurationService) {}

	async start(
		request: AdapterCallRequest,
		deliverResult: DeliverCallResult,
	): Promise<AdapterCallOutcome> {
		const delay =
			this.configuration.happyRobot.simulatedCallDelayMilliseconds
		this.logger.log(LOG_MESSAGES.ENGINEERS.SIMULATED_CALL_SCHEDULED, {
			callIdentifier: request.call.identifier,
			delayMilliseconds: delay,
		})
		setTimeout(() => {
			const answers = request.call.questions.map((question) => {
				const {
					[question.key]:
						answer = "The engineer had no information about this",
				} = request.simulatedScript.answersByKey
				return {
					answer,
					key: question.key,
					question: question.question,
				}
			})
			deliverResult(request.call.identifier, {
				answers,
				outcome: "completed",
				summary: answers.length
					? answers
							.map(
								(answer) =>
									`${answer.question}: ${answer.answer}`,
							)
							.join("\n")
					: "Simulated call completed without questions; no technical facts or authorizations were obtained.",
				transcript: answers
					.map(
						(answer) =>
							`Agent: ${answer.question}\nEngineer: ${answer.answer}`,
					)
					.join("\n"),
			}).catch((error) => {
				this.logger.warn(
					LOG_MESSAGES.INCIDENTS.STALE_RESULT_IGNORED,
					describeError(error),
				)
			})
		}, delay)
		return {
			kind: "accepted",
			providerReference: `simulated:${request.call.identifier}`,
		}
	}
}
