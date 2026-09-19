import { EntityNotFoundException } from "@common/exceptions/domain.exception"
import { Injectable } from "@nestjs/common"
import { METEORITE_SCENARIO } from "@scenarios/constants/meteorite-scenario.constant"
import { METEORITE_SCENARIO_ES } from "@scenarios/constants/meteorite-scenario.es.constant"
import {
	ScenarioDefinition,
	ScenarioLanguage,
	ScenarioSummary,
} from "@scenarios/types/scenario.type"

@Injectable()
export class ScenariosService {
	private readonly scenarios: ReadonlyMap<string, ScenarioDefinition> =
		new Map(
			[METEORITE_SCENARIO, METEORITE_SCENARIO_ES].map((scenario) => [
				scenario.identifier,
				scenario,
			]),
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
			reportedCapacity: scenario.resources[0].reportedCapacity,
			serviceCount: scenario.services.length,
			title: scenario.title,
		}))
	}

	/** The scenario written in this language; every language ships one. */
	getByLanguage(language: ScenarioLanguage): ScenarioDefinition {
		const scenario = this.list().find(
			(candidate) => candidate.language === language,
		)
		if (!scenario) {
			throw new EntityNotFoundException("Scenario", language)
		}
		return scenario
	}

	getByIdentifier(identifier: string): ScenarioDefinition {
		const scenario = this.scenarios.get(identifier)
		if (!scenario) {
			throw new EntityNotFoundException("Scenario", identifier)
		}
		return scenario
	}
}
