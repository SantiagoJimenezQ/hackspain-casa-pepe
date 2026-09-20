import { AdvanceSimulationDTO } from "@incidents/dtos/advance-simulation.dto"
import { ChangeCapacityDTO } from "@incidents/dtos/change-capacity.dto"
import {
	InjectHarnessEventDTO,
	toHarnessEvent,
} from "@incidents/dtos/inject-harness-event.dto"
import { StartRunDTO } from "@incidents/dtos/start-run.dto"
import { SwitchLanguageDTO } from "@incidents/dtos/switch-language.dto"
import { IncidentsService } from "@incidents/services/incidents.service"
import { IncidentSnapshot } from "@incidents/types/incident.type"
import {
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	Post,
	Query,
} from "@nestjs/common"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"
import { RunScopedQueryDTO } from "@plans/dtos/list-plans.dto"

@ApiTags("Demo controls")
@ApiSecurity("operator")
@Controller("demo")
export class DemoController {
	constructor(private readonly incidentsService: IncidentsService) {}

	@Post("start")
	@ApiOperation({
		summary:
			"Start a healthy run for this browser, replacing its previous run. Other browsers keep running",
	})
	start(@Body() body: StartRunDTO): Promise<IncidentSnapshot> {
		return this.incidentsService.startRun(body.scenarioIdentifier, body)
	}

	@Post("pause")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: "Pause the randomized simulation clock" })
	async pause(@Query() query: RunScopedQueryDTO): Promise<IncidentSnapshot> {
		return this.incidentsService.setSimulationPaused(
			await this.incidentsService.getActiveRunIdentifier(
				query.runIdentifier,
			),
			true,
		)
	}

	@Post("resume")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: "Resume the randomized simulation clock" })
	async resume(@Query() query: RunScopedQueryDTO): Promise<IncidentSnapshot> {
		return this.incidentsService.setSimulationPaused(
			await this.incidentsService.getActiveRunIdentifier(
				query.runIdentifier,
			),
			false,
		)
	}

	@Post("advance")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "Advance the randomized simulation by explicit minutes",
	})
	async advance(
		@Body() body: AdvanceSimulationDTO,
		@Query() query: RunScopedQueryDTO,
	): Promise<IncidentSnapshot> {
		const minutes = body.minutes ?? 1
		return this.incidentsService.advanceSimulation(
			await this.incidentsService.getActiveRunIdentifier(
				query.runIdentifier,
			),
			minutes,
		)
	}

	@Post("impact")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "Introduce the missile impact. The agent starts responding",
	})
	async impact(@Query() query: RunScopedQueryDTO): Promise<IncidentSnapshot> {
		return this.incidentsService.applyHarnessEvent(
			{ type: "meteorite-impact" },
			"Demo controls",
			await this.incidentsService.getActiveRunIdentifier(
				query.runIdentifier,
			),
		)
	}

	@Post("twist")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary:
			"Introduce the scenario twist: backup capacity is insufficient for the initial plan",
	})
	twist(@Query() query: RunScopedQueryDTO): Promise<IncidentSnapshot> {
		return this.incidentsService.applyScenarioTwist(query.runIdentifier)
	}

	@Post("capacity")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary:
			"Change total usable capacity for a specific datacenter in an explicit run",
	})
	changeCapacity(@Body() body: ChangeCapacityDTO): Promise<IncidentSnapshot> {
		return this.incidentsService.applyHarnessEvent(
			{
				availableCapacity: body.totalCapacity,
				reason: body.reason,
				resourceIdentifier: body.resourceIdentifier,
				type: "capacity-limited",
			},
			"Demo controls",
			body.runIdentifier,
		)
	}

	@Post("events")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "Introduce an arbitrary harness event into a run",
	})
	async injectEvent(
		@Body() body: InjectHarnessEventDTO,
		@Query() query: RunScopedQueryDTO,
	): Promise<IncidentSnapshot> {
		return this.incidentsService.applyHarnessEvent(
			toHarnessEvent(body),
			"Demo controls",
			await this.incidentsService.getActiveRunIdentifier(
				query.runIdentifier,
			),
		)
	}

	@Post("language")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary:
			"Run the scenario written in this language. A run already in it is left untouched; any other one ends and a fresh run starts",
	})
	switchLanguage(
		@Body() body: SwitchLanguageDTO,
		@Query() query: RunScopedQueryDTO,
	): Promise<IncidentSnapshot> {
		return this.incidentsService.switchLanguage(
			body.language,
			query.runIdentifier,
		)
	}

	@Post("reset")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary:
			"Reset one run and start a fresh one from the same scenario. Late results from the old run are ignored",
	})
	reset(@Query() query: RunScopedQueryDTO): Promise<IncidentSnapshot> {
		return this.incidentsService.reset(query.runIdentifier)
	}
}
