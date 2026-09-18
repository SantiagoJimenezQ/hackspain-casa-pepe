import { ActivityModule } from "@activity/activity.module"
import { ConfigurationService } from "@common/services/configuration.service"
import { IncidentsModule } from "@incidents/incidents.module"
import { HttpModule } from "@nestjs/axios"
import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { HTTPRecoveryAdapter } from "@recovery/adapters/http-recovery.adapter"
import { SimulatedRecoveryAdapter } from "@recovery/adapters/simulated-recovery.adapter"
import { RECOVERY_ADAPTER } from "@recovery/constants/recovery.constant"
import { RecoveryController } from "@recovery/controllers/recovery.controller"
import { RecoveryActionEntity } from "@recovery/entities/recovery-action.entity"
import { RecoveryService } from "@recovery/services/recovery.service"
import { RecoveryAdapter } from "@recovery/types/recovery.type"

@Module({
	controllers: [RecoveryController],
	exports: [RecoveryService],
	imports: [
		TypeOrmModule.forFeature([RecoveryActionEntity]),
		HttpModule,
		ActivityModule,
		IncidentsModule,
	],
	providers: [
		SimulatedRecoveryAdapter,
		HTTPRecoveryAdapter,
		{
			inject: [
				ConfigurationService,
				SimulatedRecoveryAdapter,
				HTTPRecoveryAdapter,
			],
			provide: RECOVERY_ADAPTER,
			useFactory: (
				configuration: ConfigurationService,
				simulated: SimulatedRecoveryAdapter,
				http: HTTPRecoveryAdapter,
			): RecoveryAdapter => {
				switch (configuration.recovery.mode) {
					case "simulated":
						return simulated
					case "http":
						return http
				}
			},
		},
		RecoveryService,
	],
})
export class RecoveryModule {}
