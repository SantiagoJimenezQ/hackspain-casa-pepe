import { EntityNotFoundException } from "@common/exceptions/domain.exception"
import { Injectable } from "@nestjs/common"
import { METEORITE_SCENARIO } from "@scenarios/constants/meteorite-scenario.constant"
import { ScenarioDefinition } from "@scenarios/types/scenario.type"

@Injectable()
export class ScenariosService {
	private readonly scenarios: ReadonlyMap<string, ScenarioDefinition> =
		new Map([[METEORITE_SCENARIO.identifier, METEORITE_SCENARIO]])

	list(): ReadonlyArray<ScenarioDefinition> {
		return Array.from(this.scenarios.values())
	}

	getByIdentifier(identifier: string): ScenarioDefinition {
		const scenario = this.scenarios.get(identifier)
		if (!scenario) {
			throw new EntityNotFoundException("Scenario", identifier)
		}
		return scenario
	}
}
