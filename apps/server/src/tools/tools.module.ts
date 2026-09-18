import { ActivityModule } from "@activity/activity.module"
import { ApprovalsModule } from "@approvals/approvals.module"
import { EngineersModule } from "@engineers/engineers.module"
import { IncidentsModule } from "@incidents/incidents.module"
import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { RecoveryModule } from "@recovery/recovery.module"
import { TasksModule } from "@tasks/tasks.module"
import { ToolsController } from "@tools/controllers/tools.controller"
import { ToolCallEntity } from "@tools/entities/tool-call.entity"
import { AssignTaskTool } from "@tools/implementations/assign-task.tool"
import { ContactEngineerTool } from "@tools/implementations/contact-engineer.tool"
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

@Module({
	controllers: [ToolsController],
	exports: [ToolsService, ToolRegistryService],
	imports: [
		TypeOrmModule.forFeature([ToolCallEntity]),
		ActivityModule,
		IncidentsModule,
		EngineersModule,
		TasksModule,
		ApprovalsModule,
		RecoveryModule,
	],
	providers: [
		GetIncidentStateTool,
		GetServiceHealthTool,
		GetRecoveryCapacityTool,
		ContactEngineerTool,
		AssignTaskTool,
		RequestApprovalTool,
		ExecuteRecoveryTool,
		VerifyRecoveryTool,
		ToolRegistryService,
		ToolsService,
	],
})
export class ToolsModule {}
