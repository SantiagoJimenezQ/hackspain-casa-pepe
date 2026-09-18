import { createApplicationConfiguration } from "@common/configuration/configuration.factory"
import { EnvironmentVariables } from "@common/configuration/environment-variables.class"
import {
	AgentConfiguration,
	ApplicationConfiguration,
	AuthenticationConfiguration,
	DatabaseConfiguration,
	DemoConfiguration,
	HappyRobotConfiguration,
	RecoveryConfiguration,
	RuntimeConfiguration,
	WebhooksConfiguration,
} from "@common/types/configuration.type"
import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"

@Injectable()
export class ConfigurationService {
	private readonly configuration: ApplicationConfiguration

	constructor(configService: ConfigService<EnvironmentVariables, true>) {
		const variables = new EnvironmentVariables()
		for (const key of Object.keys(variables) as Array<
			keyof EnvironmentVariables
		>) {
			Object.assign(variables, {
				[key]: configService.get(key, { infer: true }),
			})
		}
		this.configuration = createApplicationConfiguration(variables)
	}

	get all(): ApplicationConfiguration {
		return this.configuration
	}

	get runtime(): RuntimeConfiguration {
		return this.configuration.runtime
	}

	get database(): DatabaseConfiguration {
		return this.configuration.database
	}

	get authentication(): AuthenticationConfiguration {
		return this.configuration.authentication
	}

	get webhooks(): WebhooksConfiguration {
		return this.configuration.webhooks
	}

	get happyRobot(): HappyRobotConfiguration {
		return this.configuration.happyRobot
	}

	get recovery(): RecoveryConfiguration {
		return this.configuration.recovery
	}

	get demo(): DemoConfiguration {
		return this.configuration.demo
	}

	get agent(): AgentConfiguration {
		return this.configuration.agent
	}
}
