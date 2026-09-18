import { RunsService } from "@incidents/services/runs.service"
import { IncidentSnapshot, RunSummary } from "@incidents/types/incident.type"
import { Controller, Get, Param } from "@nestjs/common"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"

@ApiTags("Incidents")
@ApiSecurity("operator")
@Controller("incidents")
export class IncidentsController {
	constructor(private readonly runsService: RunsService) {}

	@Get("current")
	@ApiOperation({
		summary:
			"Current incident: status, services, dependencies, capacity and facts",
	})
	getCurrent(): Promise<IncidentSnapshot> {
		return this.runsService.getActive()
	}

	@Get("runs")
	@ApiOperation({ summary: "All runs, newest first, including replays" })
	listRuns(): Promise<ReadonlyArray<RunSummary>> {
		return this.runsService.listRuns()
	}

	@Get("runs/:runIdentifier")
	@ApiOperation({ summary: "Incident snapshot of a specific run" })
	getByRun(
		@Param("runIdentifier") runIdentifier: string,
	): Promise<IncidentSnapshot> {
		return this.runsService.getByRunIdentifier(runIdentifier)
	}
}
