import { Module } from "@nestjs/common"
import { ScenariosService } from "@scenarios/services/scenarios.service"
import { SeededSimulationService } from "@scenarios/services/seeded-simulation.service"

@Module({
	exports: [ScenariosService, SeededSimulationService],
	providers: [ScenariosService, SeededSimulationService],
})
export class ScenariosModule {}
