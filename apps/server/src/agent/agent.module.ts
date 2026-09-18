import { ActivityModule } from "@activity/activity.module"
import { AgentController } from "@agent/controllers/agent.controller"
import { OverviewController } from "@agent/controllers/overview.controller"
import { AgentService } from "@agent/services/agent.service"
import { AgentCycleStateService } from "@agent/services/agent-cycle-state.service"
import { ApprovalsModule } from "@approvals/approvals.module"
import { EngineersModule } from "@engineers/engineers.module"
import { IncidentsModule } from "@incidents/incidents.module"
import { Module } from "@nestjs/common"
import { PlansModule } from "@plans/plans.module"
import { RecoveryModule } from "@recovery/recovery.module"
import { TasksModule } from "@tasks/tasks.module"
import { ToolsModule } from "@tools/tools.module"

@Module({
	controllers: [AgentController, OverviewController],
	exports: [AgentService],
	imports: [
		IncidentsModule,
		PlansModule,
		ApprovalsModule,
		ToolsModule,
		TasksModule,
		EngineersModule,
		RecoveryModule,
		ActivityModule,
	],
	providers: [AgentCycleStateService, AgentService],
})
export class AgentModule {}
