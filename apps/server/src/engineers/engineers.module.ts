import { ActivityModule } from "@activity/activity.module"
import { ConfigurationService } from "@common/services/configuration.service"
import { HappyRobotEngineerCallAdapter } from "@engineers/adapters/happyrobot-engineer-call.adapter"
import { SimulatedEngineerCallAdapter } from "@engineers/adapters/simulated-engineer-call.adapter"
import { ENGINEER_CALL_ADAPTER } from "@engineers/constants/engineer.constant"
import { EngineersController } from "@engineers/controllers/engineers.controller"
import { EngineerCallEntity } from "@engineers/entities/engineer-call.entity"
import { EngineersService } from "@engineers/services/engineers.service"
import { EngineerCallAdapter } from "@engineers/types/engineer.type"
import { RunsModule } from "@incidents/runs.module"
import { HttpModule } from "@nestjs/axios"
import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"

@Module({
	controllers: [EngineersController],
	exports: [EngineersService],
	imports: [
		TypeOrmModule.forFeature([EngineerCallEntity]),
		HttpModule,
		ActivityModule,
		RunsModule,
	],
	providers: [
		SimulatedEngineerCallAdapter,
		HappyRobotEngineerCallAdapter,
		{
			inject: [
				ConfigurationService,
				SimulatedEngineerCallAdapter,
				HappyRobotEngineerCallAdapter,
			],
			provide: ENGINEER_CALL_ADAPTER,
			useFactory: (
				configuration: ConfigurationService,
				simulated: SimulatedEngineerCallAdapter,
				live: HappyRobotEngineerCallAdapter,
			): EngineerCallAdapter => {
				switch (configuration.happyRobot.mode) {
					case "simulated":
						return simulated
					case "live":
						return live
				}
			},
		},
		EngineersService,
	],
})
export class EngineersModule {}
