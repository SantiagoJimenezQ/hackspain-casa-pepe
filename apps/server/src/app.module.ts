import { ActivityModule } from "@activity/activity.module"
import { AgentModule } from "@agent/agent.module"
import { ApprovalsModule } from "@approvals/approvals.module"
import { AuthenticationModule } from "@authentication/authentication.module"
import { CommonModule } from "@common/common.module"
import { DatabaseModule } from "@common/database/database.module"
import { EngineersModule } from "@engineers/engineers.module"
import { HealthModule } from "@health/health.module"
import { IncidentsModule } from "@incidents/incidents.module"
import { LearningModule } from "@learning/learning.module"
import { Module } from "@nestjs/common"
import { EventEmitterModule } from "@nestjs/event-emitter"
import { ScheduleModule } from "@nestjs/schedule"
import { PlansModule } from "@plans/plans.module"
import { RecoveryModule } from "@recovery/recovery.module"
import { ReplaysModule } from "@replays/replays.module"
import { ScenariosModule } from "@scenarios/scenarios.module"
import { TasksModule } from "@tasks/tasks.module"
import { ToolsModule } from "@tools/tools.module"
import { WebhooksModule } from "@webhooks/webhooks.module"

@Module({
	imports: [
		CommonModule,
		DatabaseModule,
		EventEmitterModule.forRoot({ wildcard: false }),
		ScheduleModule.forRoot(),
		AuthenticationModule,
		HealthModule,
		ScenariosModule,
		IncidentsModule,
		ActivityModule,
		PlansModule,
		ApprovalsModule,
		TasksModule,
		EngineersModule,
		RecoveryModule,
		ToolsModule,
		LearningModule,
		AgentModule,
		WebhooksModule,
		ReplaysModule,
	],
})
export class AppModule {}
