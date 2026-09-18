import { ActivityModule } from "@activity/activity.module"
import { ApprovalsModule } from "@approvals/approvals.module"
import { RunsModule } from "@incidents/runs.module"
import { LearningController } from "@learning/controllers/learning.controller"
import { LearningInsightEntity } from "@learning/entities/learning-insight.entity"
import { LearningService } from "@learning/services/learning.service"
import { RunReportService } from "@learning/services/run-report.service"
import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { PlansModule } from "@plans/plans.module"
import { ToolsModule } from "@tools/tools.module"

@Module({
	controllers: [LearningController],
	exports: [LearningService, RunReportService],
	imports: [TypeOrmModule.forFeature([LearningInsightEntity]), RunsModule, ActivityModule, PlansModule, ApprovalsModule, ToolsModule],
	providers: [LearningService, RunReportService],
})
export class LearningModule {}
