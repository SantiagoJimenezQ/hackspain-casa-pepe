import { Authorization } from "@authentication/decorators/authorization.decorator"
import { IntegrationsHealthIndicator } from "@health/providers/integrations-health.indicator"
import { Controller, Get } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"
import {
	HealthCheck,
	HealthCheckResult,
	HealthCheckService,
	TypeOrmHealthIndicator,
} from "@nestjs/terminus"

@ApiTags("Health")
@Controller("health")
export class HealthController {
	constructor(
		private readonly healthCheckService: HealthCheckService,
		private readonly databaseHealthIndicator: TypeOrmHealthIndicator,
		private readonly integrationsHealthIndicator: IntegrationsHealthIndicator,
	) {}

	@Get()
	@Authorization("public")
	@HealthCheck()
	@ApiOperation({
		summary:
			"Service liveness, database connectivity and integration modes",
	})
	check(): Promise<HealthCheckResult> {
		return this.healthCheckService.check([
			() => this.databaseHealthIndicator.pingCheck("database"),
			() => this.integrationsHealthIndicator.describe("integrations"),
		])
	}
}
