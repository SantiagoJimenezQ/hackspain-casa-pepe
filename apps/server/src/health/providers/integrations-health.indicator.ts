import { ConfigurationService } from "@common/services/configuration.service"
import { Injectable } from "@nestjs/common"
import { HealthIndicator, HealthIndicatorResult } from "@nestjs/terminus"

@Injectable()
export class IntegrationsHealthIndicator extends HealthIndicator {
	constructor(private readonly configuration: ConfigurationService) {
		super()
	}

	describe(key: string): HealthIndicatorResult {
		return this.getStatus(key, true, {
			engineerCalls: this.configuration.happyRobot.mode,
			recoveryEnvironment: this.configuration.recovery.mode,
		})
	}
}
