import { ActivityModule } from "@activity/activity.module"
import { ActivityEventEntity } from "@activity/entities/activity-event.entity"
import { IncidentEntity } from "@incidents/entities/incident.entity"
import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { CompanyCallController } from "./company-call.controller"
import { CompanyCallEntity } from "./company-call.entity"
import { CompanyCallGuard } from "./company-call.guard"
import { CompanyCallService } from "./company-call.service"
@Module({
	controllers: [CompanyCallController],
	exports: [CompanyCallService],
	imports: [
		ActivityModule,
		TypeOrmModule.forFeature([
			CompanyCallEntity,
			IncidentEntity,
			ActivityEventEntity,
		]),
	],
	providers: [CompanyCallService, CompanyCallGuard],
})
export class CompanyCallsModule {}
