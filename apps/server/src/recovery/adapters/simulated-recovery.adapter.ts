import { ConfigurationService } from "@common/services/configuration.service"
import { RecoveryMode } from "@common/types/configuration.type"
import { RunsService } from "@incidents/services/runs.service"
import { Injectable } from "@nestjs/common"
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

	constructor(
		private readonly configuration: ConfigurationService,
		private readonly runsService: RunsService,
	) {}

	async execute(
		request: AdapterExecuteRequest,
		deliverResult: DeliverRecoveryResult,
	): Promise<AdapterExecuteOutcome> {
		setTimeout(() => {
			void deliverResult(request.action.identifier, {
				detail: request.simulatedScript.detail,
				outcome: request.simulatedScript.outcome,
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
