import { nowISO } from "@common/helpers/clock.helper"
import { prioritizeCustomers } from "@customers/helpers/customer-priority.helper"
import { CustomerRankingLlmService } from "@customers/services/customer-ranking-llm.service"
import {
	CustomerPriorityMode,
	CustomerPriorityReport,
} from "@customers/types/customer-priority.type"
import { RunsService } from "@incidents/services/runs.service"
import { IncidentSnapshot } from "@incidents/types/incident.type"
import { Injectable } from "@nestjs/common"
import { RecoveryService } from "@recovery/services/recovery.service"
import { ScenariosService } from "@scenarios/services/scenarios.service"

@Injectable()
export class CustomerPrioritiesService {
	constructor(
		private readonly runsService: RunsService,
		private readonly recoveryService: RecoveryService,
		private readonly scenariosService: ScenariosService,
		private readonly ranking: CustomerRankingLlmService,
	) {}

	async prioritize(
		runIdentifier: string,
		mode: CustomerPriorityMode = "deterministic",
	): Promise<CustomerPriorityReport> {
		const [incident, actions] = await Promise.all([
			this.runsService.getByRunIdentifier(runIdentifier),
			this.recoveryService.list(runIdentifier),
		])
		const baseline = prioritizeCustomers(
			this.withCustomers(incident),
			actions,
			nowISO(),
		)
		switch (mode) {
			case "deterministic":
				return baseline
			case "llm":
				return this.ranking.rank(baseline)
		}
	}

	/** Runs persisted before customers existed fall back to the scenario definition. */
	private withCustomers(incident: IncidentSnapshot): IncidentSnapshot {
		if (incident.customers.length) {
			return incident
		}
		const scenario = this.scenariosService.getByIdentifier(
			incident.scenarioIdentifier,
		)
		return { ...incident, customers: scenario.customers }
	}
}
