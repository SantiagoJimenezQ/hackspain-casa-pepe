import { LlmClientService } from "@agent/llm/llm-client.service"
import { CustomersController } from "@customers/controllers/customers.controller"
import { CustomerPrioritiesService } from "@customers/services/customer-priorities.service"
import { CustomerRankingLlmService } from "@customers/services/customer-ranking-llm.service"
import { RunsModule } from "@incidents/runs.module"
import { HttpModule } from "@nestjs/axios"
import { Module } from "@nestjs/common"
import { RecoveryModule } from "@recovery/recovery.module"
import { ScenariosModule } from "@scenarios/scenarios.module"

@Module({
	controllers: [CustomersController],
	exports: [CustomerPrioritiesService],
	imports: [HttpModule, RunsModule, RecoveryModule, ScenariosModule],
	providers: [
		CustomerPrioritiesService,
		CustomerRankingLlmService,
		LlmClientService,
	],
})
export class CustomersModule {}
