import { Module } from "@nestjs/common"
import { ScenariosController } from "@scenarios/controllers/scenarios.controller"
import { ScenariosService } from "@scenarios/services/scenarios.service"

@Module({
	controllers: [ScenariosController],
	exports: [ScenariosService],
	providers: [ScenariosService],
})
export class ScenariosModule {}
