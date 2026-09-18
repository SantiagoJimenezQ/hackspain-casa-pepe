import { Module } from "@nestjs/common"
import { ScenariosService } from "@scenarios/services/scenarios.service"

@Module({
	exports: [ScenariosService],
	providers: [ScenariosService],
})
export class ScenariosModule {}
