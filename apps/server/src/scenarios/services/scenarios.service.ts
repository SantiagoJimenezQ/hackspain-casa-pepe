import { EntityNotFoundException } from "@common/exceptions/domain.exception"
import { Injectable } from "@nestjs/common"
import { METEORITE_SCENARIO } from "@scenarios/constants/meteorite-scenario.constant"
import { METEORITE_SCENARIO_ES } from "@scenarios/constants/meteorite-scenario.es.constant"
import { ScenarioDefinition, ScenarioSummary } from "@scenarios/types/scenario.type"

@Injectable()
export class ScenariosService {
	private readonly scenarios: ReadonlyMap<string, ScenarioDefinition> = new Map(
		[METEORITE_SCENARIO, METEORITE_SCENARIO_ES].map((scenario) => [scenario.identifier, scenario]),
	)

	list(): ReadonlyArray<ScenarioDefinition> {
		return Array.from(this.scenarios.values())
	}

	summaries(): ReadonlyArray<ScenarioSummary> {
		return this.list().map((scenario) => ({
			backupRegion: scenario.backupRegion,
			capacityAfterTwist: scenario.twist.capacityAfterTwist,
			company: scenario.company,
			identifier: scenario.identifier,
			language: scenario.language,
			region: scenario.region,
			reportedCapacity: scenario.resource.reportedCapacity,
			serviceCount: scenario.services.length,
			title: scenario.title,
		}))
	}

	getByIdentifier(identifier: string): ScenarioDefinition {
		const scenario = this.scenarios.get(identifier)
		if (!scenario) {
			throw new EntityNotFoundException("Scenario", identifier)
		}
		return scenario
	}
}
