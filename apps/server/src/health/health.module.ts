import { HealthController } from "@health/health.controller"
import { IntegrationsHealthIndicator } from "@health/providers/integrations-health.indicator"
import { Module } from "@nestjs/common"
import { TerminusModule } from "@nestjs/terminus"

@Module({
	controllers: [HealthController],
	imports: [TerminusModule],
	providers: [IntegrationsHealthIndicator],
})
export class HealthModule {}
