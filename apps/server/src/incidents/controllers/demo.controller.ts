import {
	InjectHarnessEventDTO,
	toHarnessEvent,
} from "@incidents/dtos/inject-harness-event.dto"
import { StartRunDTO } from "@incidents/dtos/start-run.dto"
import { IncidentsService } from "@incidents/services/incidents.service"
import { IncidentSnapshot } from "@incidents/types/incident.type"
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"

@ApiTags("Demo controls")
@ApiSecurity("operator")
@Controller("demo")
export class DemoController {
	constructor(private readonly incidentsService: IncidentsService) {}

	@Post("start")
	@ApiOperation({ summary: "Start a new run with every service healthy" })
	start(@Body() body: StartRunDTO): Promise<IncidentSnapshot> {
		return this.incidentsService.startRun(body.scenarioIdentifier)
	}

	@Post("impact")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "Introduce the meteorite impact. The agent starts responding",
	})
	impact(): Promise<IncidentSnapshot> {
		return this.incidentsService.applyHarnessEvent(
			{ type: "meteorite-impact" },
			"Demo controls",
		)
	}

	@Post("twist")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary:
			"Introduce the scenario twist: backup capacity is insufficient for the initial plan",
	})
	twist(): Promise<IncidentSnapshot> {
		return this.incidentsService.applyScenarioTwist()
	}

	@Post("events")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "Introduce an arbitrary harness event into the active run",
	})
	injectEvent(
		@Body() body: InjectHarnessEventDTO,
	): Promise<IncidentSnapshot> {
		return this.incidentsService.applyHarnessEvent(
			toHarnessEvent(body),
			"Demo controls",
		)
	}

	@Post("reset")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary:
			"Reset the scenario. Late results from the previous run are ignored",
	})
	reset(): Promise<IncidentSnapshot> {
		return this.incidentsService.reset()
	}
}
