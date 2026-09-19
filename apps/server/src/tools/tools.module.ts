import { ActivityModule } from "@activity/activity.module"
import { ApprovalsModule } from "@approvals/approvals.module"
import { EngineersModule } from "@engineers/engineers.module"
import { IncidentsModule } from "@incidents/incidents.module"
import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { PlansModule } from "@plans/plans.module"
import { RecoveryModule } from "@recovery/recovery.module"
import { TasksModule } from "@tasks/tasks.module"
import { PublicStatusController } from "@tools/controllers/public-status.controller"
import { ToolsController } from "@tools/controllers/tools.controller"
import { StatusPublicationEntity } from "@tools/entities/status-publication.entity"
import { ToolCallEntity } from "@tools/entities/tool-call.entity"
import { AssignTaskTool } from "@tools/implementations/assign-task.tool"
import { CheckServicesStatusTool } from "@tools/implementations/check-services-status.tool"
import {
	CommunicationToolsService,
	PublishStatusUpdateTool,
	SendIncidentEmailTool,
} from "@tools/implementations/communication-tools"
import { ContactEngineerTool } from "@tools/implementations/contact-engineer.tool"
import { ReadIncomingEmailsTool } from "@tools/implementations/inbound-emails.tool"
import {
	CallEngineerTool,
	GetIncidentContextTool,
	SaveRecoveryPlanTool,
} from "@tools/implementations/mvp-tools"
import {
	ExecuteRecoveryTool,
	VerifyRecoveryTool,
} from "@tools/implementations/recovery-tools"
import { RequestApprovalTool } from "@tools/implementations/request-approval.tool"
import {
	GetIncidentStateTool,
	GetRecoveryCapacityTool,
	GetServiceHealthTool,
} from "@tools/implementations/state-tools"
import { ToolRegistryService } from "@tools/services/tool-registry.service"
import { ToolsService } from "@tools/services/tools.service"
import { ToolTestEntity } from "@tools/testing/tool-test.entity"
import { ToolTestsController } from "@tools/testing/tool-tests.controller"
import { ToolTestsService } from "@tools/testing/tool-tests.service"
import { HappyRobotSecretGuard } from "@webhooks/guards/inbound-secret.guard"

@Module({
	controllers: [ToolsController, PublicStatusController, ToolTestsController],
	exports: [ToolsService, ToolRegistryService],
	imports: [
		TypeOrmModule.forFeature([
			ToolCallEntity,
			StatusPublicationEntity,
			ToolTestEntity,
		]),
		PlansModule,
		ActivityModule,
		IncidentsModule,
		EngineersModule,
		TasksModule,
		ApprovalsModule,
		RecoveryModule,
	],
	providers: [
		GetIncidentContextTool,
		CallEngineerTool,
		SaveRecoveryPlanTool,
		CommunicationToolsService,
		SendIncidentEmailTool,
		PublishStatusUpdateTool,
		GetIncidentStateTool,
		GetServiceHealthTool,
		GetRecoveryCapacityTool,
		ContactEngineerTool,
		AssignTaskTool,
		RequestApprovalTool,
		ExecuteRecoveryTool,
		VerifyRecoveryTool,
		ReadIncomingEmailsTool,
		CheckServicesStatusTool,
		ToolRegistryService,
		ToolsService,
	],
})
export class ToolsModule {}
