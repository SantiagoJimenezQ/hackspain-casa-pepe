import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import {
	describeError,
	parseExternalResponse,
} from "@common/helpers/external-response.helper"
import { ConfigurationService } from "@common/services/configuration.service"
import { RecoveryMode } from "@common/types/configuration.type"
import { HttpService } from "@nestjs/axios"
import { Injectable, Logger } from "@nestjs/common"
import { RECOVERY_INTEGRATION_NAME } from "@recovery/constants/recovery.constant"
import {
	RecoveryEnvironmentActionResponseDTO,
	RecoveryEnvironmentHealthResponseDTO,
} from "@recovery/dtos/recovery-environment-response.dto"
import {
	AdapterExecuteOutcome,
	AdapterExecuteRequest,
	DeliverRecoveryResult,
	RecoveryAdapter,
	VerificationResult,
} from "@recovery/types/recovery.type"
import { firstValueFrom } from "rxjs"

@Injectable()
export class HTTPRecoveryAdapter implements RecoveryAdapter {
	readonly mode: RecoveryMode = "http"

	private readonly logger = new Logger(HTTPRecoveryAdapter.name)

	constructor(
		private readonly configuration: ConfigurationService,
		private readonly httpService: HttpService,
	) {}

	async execute(
		request: AdapterExecuteRequest,
		_deliverResult: DeliverRecoveryResult,
	): Promise<AdapterExecuteOutcome> {
		const { environmentURL } = this.configuration.recovery
		try {
			const response = await firstValueFrom(
				this.httpService.post<unknown>(
					`${environmentURL}/recovery/actions`,
					{
						actionDescription: request.action.actionDescription,
						actionIdentifier: request.action.identifier,
						actionKind: request.action.actionKind,
						callbackURL: request.callbackURL,
						capacityUnits: request.action.capacityUnits,
						runIdentifier: request.action.runIdentifier,
						serviceIdentifier: request.action.serviceIdentifier,
					},
					{
						headers: this.headers(),
						timeout:
							this.configuration.agent.toolTimeoutMilliseconds,
					},
				),
			)
			const body = parseExternalResponse(
				RECOVERY_INTEGRATION_NAME,
				RecoveryEnvironmentActionResponseDTO,
				response.data,
			)
			switch (body.status) {
				case "accepted":
					return {
						kind: "accepted",
						providerReference: body.reference,
					}
				case "succeeded":
					return {
						kind: "completed",
						result: { detail: body.detail, outcome: "success" },
					}
				case "partial":
					return {
						kind: "completed",
						result: { detail: body.detail, outcome: "partial" },
					}
				case "failed":
					return {
						kind: "completed",
						result: { detail: body.detail, outcome: "failure" },
					}
			}
		} catch (error) {
			const reason = describeError(error)
			this.logger.error(
				LOG_MESSAGES.RECOVERY.ENVIRONMENT_REQUEST_FAILED,
				reason,
			)
			return { kind: "failed", reason }
		}
	}

	async verify(
		_runIdentifier: string,
		serviceIdentifier: string,
	): Promise<VerificationResult> {
		const { environmentURL } = this.configuration.recovery
		try {
			const response = await firstValueFrom(
				this.httpService.get<unknown>(
					`${environmentURL}/recovery/services/${serviceIdentifier}/health`,
					{
						headers: this.headers(),
						timeout:
							this.configuration.agent.toolTimeoutMilliseconds,
					},
				),
			)
			const body = parseExternalResponse(
				RECOVERY_INTEGRATION_NAME,
				RecoveryEnvironmentHealthResponseDTO,
				response.data,
			)
			return {
				detail: body.detail,
				mode: "http",
				serviceIdentifier,
				status: body.status,
				verified: body.status === "healthy",
			}
		} catch (error) {
			const reason = describeError(error)
			this.logger.error(
				LOG_MESSAGES.RECOVERY.ENVIRONMENT_REQUEST_FAILED,
				reason,
			)
			return {
				detail: `Verification request failed: ${reason}`,
				mode: "http",
				serviceIdentifier,
				status: "down",
				verified: false,
			}
		}
	}

	private headers(): Record<string, string> {
		return {
			Authorization: `Bearer ${this.configuration.recovery.environmentAPIKey}`,
			"Content-Type": "application/json",
		}
	}
}
