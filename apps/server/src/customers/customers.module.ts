import { CustomersController } from "@customers/controllers/customers.controller"
import { CustomerPrioritiesService } from "@customers/services/customer-priorities.service"
import { RunsModule } from "@incidents/runs.module"
import { Module } from "@nestjs/common"
import { RecoveryModule } from "@recovery/recovery.module"
import { ScenariosModule } from "@scenarios/scenarios.module"

@Module({
	controllers: [CustomersController],
	exports: [CustomerPrioritiesService],
	imports: [RunsModule, RecoveryModule, ScenariosModule],
	providers: [CustomerPrioritiesService],
})
export class CustomersModule {}
