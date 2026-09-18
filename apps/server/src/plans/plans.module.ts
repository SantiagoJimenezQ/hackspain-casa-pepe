import { ActivityModule } from "@activity/activity.module"
import { RunsModule } from "@incidents/runs.module"
import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { PlansController } from "@plans/controllers/plans.controller"
import { PlanEntity } from "@plans/entities/plan.entity"
import { PlansService } from "@plans/services/plans.service"

@Module({
	controllers: [PlansController],
	exports: [PlansService],
	imports: [
		TypeOrmModule.forFeature([PlanEntity]),
		ActivityModule,
		RunsModule,
	],
	providers: [PlansService],
})
export class PlansModule {}
