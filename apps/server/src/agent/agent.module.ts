import { ActivityModule } from "@activity/activity.module"
import { AgentController } from "@agent/controllers/agent.controller"
import { ModelTestsController } from "@agent/controllers/model-tests.controller"
import { OverviewController } from "@agent/controllers/overview.controller"
import { LlmClientService } from "@agent/llm/llm-client.service"
import { LlmLoopService } from "@agent/llm/llm-loop.service"
import { ModelTestsService } from "@agent/llm/model-tests.service"
import { SubagentRunnerService } from "@agent/llm/subagent-runner.service"
import { AgentService } from "@agent/services/agent.service"
import { AgentCycleStateService } from "@agent/services/agent-cycle-state.service"
import { ApprovalsModule } from "@approvals/approvals.module"
import { EngineersModule } from "@engineers/engineers.module"
import { IncidentsModule } from "@incidents/incidents.module"
import { LearningModule } from "@learning/learning.module"
import { HttpModule } from "@nestjs/axios"
import { Module } from "@nestjs/common"
import { PlansModule } from "@plans/plans.module"
import { RecoveryModule } from "@recovery/recovery.module"
import { TasksModule } from "@tasks/tasks.module"
import { ToolsModule } from "@tools/tools.module"

@Module({
	controllers: [AgentController, OverviewController, ModelTestsController],
	exports: [AgentService],
	imports: [
		HttpModule,
		IncidentsModule,
		PlansModule,
		ApprovalsModule,
		ToolsModule,
		TasksModule,
		EngineersModule,
		RecoveryModule,
		ActivityModule,
		LearningModule,
	],
	providers: [
		ModelTestsService,
		AgentCycleStateService,
		AgentService,
		LlmClientService,
		LlmLoopService,
		SubagentRunnerService,
	],
})
export class AgentModule {}
