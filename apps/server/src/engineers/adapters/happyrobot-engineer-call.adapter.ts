import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import { ConfigurationService } from "@common/services/configuration.service"
import { EngineerCallMode } from "@common/types/configuration.type"
import {
	HAPPYROBOT_DEFAULT_AFFECTED_SERVICES,
	HAPPYROBOT_DEFAULT_SEVERITY,
} from "@engineers/constants/engineer.constant"
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
	readonly provider = "happyrobot" as const

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
		const askAbout = request.call.questions
			.map(
				(question, index) =>
					`${index + 1}. [${question.key}] ${question.question}`,
			)
			.join("\n")
		const payload = {
			affected_services:
				request.incidentContext.servicesDown.join(", ") ||
				HAPPYROBOT_DEFAULT_AFFECTED_SERVICES,
			ask_about: askAbout,
			call_identifier: request.call.identifier,
			callback_url: request.callbackURL,
			contact_name: request.call.engineer.name,
			engineer_name: request.call.engineer.name,
			engineer_phone: request.call.engineer.phone,
			incident_description:
				request.incidentContext.incidentDescription ||
				request.call.purpose,
			incident_id: request.call.incidentIdentifier,
			incident_summary: request.call.purpose,
			outage_time: formatOutageTime(
				request.incidentContext.outageStartedAt,
			),
			phone_number: request.call.engineer.phone,
			services_down: request.incidentContext.servicesDown.join(", "),
			severity: HAPPYROBOT_DEFAULT_SEVERITY,
		}
		try {
			const isV2 = /\/api\/v2\/workflows\/[^/]+\/runs\/?$/u.test(
				new URL(triggerURL).pathname,
			)
			const response = await firstValueFrom(
				this.httpService.post<{ run_id?: string }>(
					triggerURL,
					isV2 ? { payload } : payload,
					{
						headers: {
							Authorization: `Bearer ${apiKey}`,
							"Content-Type": "application/json",
						},
						timeout:
							this.configuration.agent.toolTimeoutMilliseconds,
					},
				),
			)
			const runId = response.data?.run_id
			if (isV2 && (typeof runId !== "string" || !runId.trim())) {
				return {
					kind: "failed",
					reason: "HappyRobot did not return a run ID; check the provider before retrying",
				}
			}
			return {
				kind: "accepted",
				provider: "happyrobot",
				providerReference:
					typeof runId === "string" && runId.trim()
						? runId
						: request.call.identifier,
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

function formatOutageTime(timestamp: string | undefined): string {
	if (!timestamp || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp)) return ""
	const date = new Date(timestamp)
	if (Number.isNaN(date.getTime())) return ""
	return `${date.toISOString().slice(11, 16)} UTC`
}
