import { ScenariosService } from "@scenarios/services/scenarios.service"
import { ScenarioDefinition } from "@scenarios/types/scenario.type"

// Approval-flow tests opt in explicitly; production demos may recover autonomously.
function withDatabaseApproval(
	scenario: ScenarioDefinition,
): ScenarioDefinition {
	return {
		...scenario,
		services: scenario.services.map((service) =>
			service.identifier === "orders-database"
				? {
						...service,
						recoveryAction: {
							...service.recoveryAction,
							requiresApproval: true,
						},
					}
				: service,
		),
	}
}

export class ApprovalScenariosFixture extends ScenariosService {
	getByIdentifier(identifier: string): ScenarioDefinition {
		return withDatabaseApproval(super.getByIdentifier(identifier))
	}

	list(): ReadonlyArray<ScenarioDefinition> {
		return super.list().map(withDatabaseApproval)
	}
}
