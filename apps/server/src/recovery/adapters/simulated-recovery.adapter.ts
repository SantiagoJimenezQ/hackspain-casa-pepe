import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import { describeError } from "@common/helpers/external-response.helper"
import { ConfigurationService } from "@common/services/configuration.service"
import { RecoveryMode } from "@common/types/configuration.type"
import { RunsService } from "@incidents/services/runs.service"
import { Injectable, Logger } from "@nestjs/common"
import {
	AdapterExecuteOutcome,
	AdapterExecuteRequest,
	DeliverRecoveryResult,
	RecoveryAdapter,
	VerificationResult,
} from "@recovery/types/recovery.type"

@Injectable()
export class SimulatedRecoveryAdapter implements RecoveryAdapter {
	readonly mode: RecoveryMode = "simulated"

	private readonly logger = new Logger(SimulatedRecoveryAdapter.name)

	constructor(
		private readonly configuration: ConfigurationService,
		private readonly runsService: RunsService,
	) {}

	async execute(
		request: AdapterExecuteRequest,
		deliverResult: DeliverRecoveryResult,
	): Promise<AdapterExecuteOutcome> {
		setTimeout(() => {
			deliverResult(request.action.identifier, {
				detail: request.simulatedScript.detail,
				outcome: request.simulatedScript.outcome,
			}).catch((error) => {
				this.logger.warn(
					LOG_MESSAGES.INCIDENTS.STALE_RESULT_IGNORED,
					describeError(error),
				)
			})
		}, this.configuration.recovery.simulatedDelayMilliseconds)
		return {
			kind: "accepted",
			providerReference: `simulated:${request.action.identifier}`,
		}
	}

	async verify(
		runIdentifier: string,
		serviceIdentifier: string,
	): Promise<VerificationResult> {
		const incident =
			await this.runsService.getByRunIdentifier(runIdentifier)
		const service = incident.services.find(
			(candidate) => candidate.identifier === serviceIdentifier,
		)
		if (!service) {
			return {
				detail: "Unknown service",
				mode: "simulated",
				serviceIdentifier,
				status: "down",
				verified: false,
			}
		}
		return {
			detail: `Simulated health check: ${service.statusReason}`,
			mode: "simulated",
			serviceIdentifier,
			status: service.status,
			verified: service.status === "healthy",
		}
	}
}
