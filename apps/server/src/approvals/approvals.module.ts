import { ActivityModule } from "@activity/activity.module"
import { ApprovalsController } from "@approvals/controllers/approvals.controller"
import { ApprovalEntity } from "@approvals/entities/approval.entity"
import { ApprovalsService } from "@approvals/services/approvals.service"
import { RunsModule } from "@incidents/runs.module"
import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { PlansModule } from "@plans/plans.module"

@Module({
	controllers: [ApprovalsController],
	exports: [ApprovalsService],
	imports: [
		TypeOrmModule.forFeature([ApprovalEntity]),
		ActivityModule,
		PlansModule,
		RunsModule,
	],
	providers: [ApprovalsService],
})
export class ApprovalsModule {}
