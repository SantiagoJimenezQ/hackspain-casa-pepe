import { EngineersService } from "@engineers/services/engineers.service"
import { Injectable } from "@nestjs/common"
import { RecoveryService } from "@recovery/services/recovery.service"
import { TOOL_DEFINITIONS } from "@tools/constants/tool.constant"
import { AssignTaskTool } from "@tools/implementations/assign-task.tool"
import {
	CommunicationToolsService,
	PublishStatusUpdateTool,
	SendIncidentEmailTool,
} from "@tools/implementations/communication-tools"
import { ContactEngineerTool } from "@tools/implementations/contact-engineer.tool"
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
import {
	Tool,
	ToolDefinitionView,
	ToolInteractionKind,
	ToolName,
} from "@tools/types/tool.type"

@Injectable()
export class ToolRegistryService {
	private readonly tools: ReadonlyMap<ToolName, Tool>

	constructor(
		getContext: GetIncidentContextTool,
		callEngineer: CallEngineerTool,
		savePlan: SaveRecoveryPlanTool,
		sendEmail: SendIncidentEmailTool,
		publishStatus: PublishStatusUpdateTool,
		private readonly communications: CommunicationToolsService,
		getIncidentState: GetIncidentStateTool,
		getServiceHealth: GetServiceHealthTool,
		getRecoveryCapacity: GetRecoveryCapacityTool,
		contactEngineer: ContactEngineerTool,
		assignTask: AssignTaskTool,
		requestApproval: RequestApprovalTool,
		executeRecovery: ExecuteRecoveryTool,
		verifyRecovery: VerifyRecoveryTool,
		private readonly engineersService: EngineersService,
		private readonly recoveryService: RecoveryService,
	) {
		const registered: ReadonlyArray<Tool> = [
			getContext,
			callEngineer,
			savePlan,
			sendEmail,
			publishStatus,
			getIncidentState,
			getServiceHealth,
			getRecoveryCapacity,
			contactEngineer,
			assignTask,
			requestApproval,
			executeRecovery,
			verifyRecovery,
		]
		this.tools = new Map(registered.map((tool) => [tool.name, tool]))
	}

	resolve(name: ToolName): Tool {
		const tool = this.tools.get(name)
		if (!tool) {
			throw new Error(`Tool ${name} is not registered`)
		}
		return tool
	}

	interactionOf(name: ToolName): ToolInteractionKind {
		const definition = TOOL_DEFINITIONS.find(
			(candidate) => candidate.name === name,
		)
		if (!definition) {
			return "harness"
		}
		return definition.interaction
	}

	isSimulated(name: ToolName): boolean {
		switch (name) {
			case "get_incident_context":
			case "get_incident_state":
			case "get_service_health":
			case "get_recovery_capacity":
				return true
			case "call_engineer":
			case "contact_engineer":
				return this.engineersService.mode === "simulated"
			case "execute_recovery":
			case "verify_recovery":
				return this.recoveryService.mode === "simulated"
			case "send_incident_email":
				return this.communications.emailSimulated
			case "save_recovery_plan":
			case "publish_status_update":
			case "assign_task":
			case "request_approval":
				return false
		}
	}

	describeAll(): ReadonlyArray<ToolDefinitionView> {
		return TOOL_DEFINITIONS.map((definition) => ({
			asynchronous: definition.asynchronous,
			description: definition.description,
			interaction: definition.interaction,
			name: definition.name,
			simulated: this.isSimulated(definition.name),
		}))
	}
}
