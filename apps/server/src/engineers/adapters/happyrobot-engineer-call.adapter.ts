import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import { ConfigurationService } from "@common/services/configuration.service"
import { EngineerCallMode } from "@common/types/configuration.type"
import {
	AdapterCallOutcome,
	AdapterCallRequest,
	DeliverCallResult,
	EngineerCallAdapter,
} from "@engineers/types/engineer.type"
import { HttpService } from "@nestjs/axios"
import { Injectable, Logger } from "@nestjs/common"
import { firstValueFrom } from "rxjs"

@Injectable()
export class HappyRobotEngineerCallAdapter implements EngineerCallAdapter {
	readonly mode: EngineerCallMode = "live"

	private readonly logger = new Logger(HappyRobotEngineerCallAdapter.name)

	constructor(
		private readonly configuration: ConfigurationService,
		private readonly httpService: HttpService,
	) {}

	async start(
		request: AdapterCallRequest,
		_deliverResult: DeliverCallResult,
	): Promise<AdapterCallOutcome> {
		const { apiKey, triggerURL } = this.configuration.happyRobot
		if (!triggerURL.length) {
			return {
				kind: "failed",
				reason: "HAPPYROBOT_TRIGGER_URL is not configured",
			}
		}
		const payload = {
			call_identifier: request.call.identifier,
			callback_url: request.callbackURL,
			engineer_name: request.call.engineer.name,
			engineer_phone: request.call.engineer.phone,
			engineer_role: request.call.engineer.role,
			incident_identifier: request.call.incidentIdentifier,
			purpose: request.call.purpose,
			questions: request.call.questions.map((question) => ({
				key: question.key,
				question: question.question,
			})),
			run_identifier: request.call.runIdentifier,
		}
		try {
			await firstValueFrom(
				this.httpService.post<unknown>(triggerURL, payload, {
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"Content-Type": "application/json",
					},
					timeout: this.configuration.agent.toolTimeoutMilliseconds,
				}),
			)
			return {
				kind: "accepted",
				providerReference: request.call.identifier,
			}
		} catch {
			const reason =
				"HappyRobot trigger failed or timed out; check the provider before retrying"
			this.logger.error(
				LOG_MESSAGES.ENGINEERS.HAPPYROBOT_REQUEST_FAILED,
				reason,
			)
			return { kind: "failed", reason }
		}
	}
}
