import { Controller, Get, Param } from "@nestjs/common"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"
import { ScenariosService } from "@scenarios/services/scenarios.service"
import { ScenarioDefinition, ScenarioSummary } from "@scenarios/types/scenario.type"

@ApiTags("Scenarios")
@ApiSecurity("operator")
@Controller("scenarios")
export class ScenariosController {
	constructor(private readonly scenariosService: ScenariosService) {}

	@Get()
	@ApiOperation({ summary: "Available scenarios with their language. Pass the identifier to POST /demo/start" })
	list(): ReadonlyArray<ScenarioSummary> {
		return this.scenariosService.summaries()
	}

	@Get(":identifier")
	@ApiOperation({ summary: "Full scenario definition: services, dependencies, capacity, facts, engineer briefing and twist" })
	getByIdentifier(@Param("identifier") identifier: string): ScenarioDefinition {
		return this.scenariosService.getByIdentifier(identifier)
	}
}
