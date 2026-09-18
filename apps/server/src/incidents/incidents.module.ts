import { ActivityModule } from "@activity/activity.module"
import { DemoController } from "@incidents/controllers/demo.controller"
import { IncidentsController } from "@incidents/controllers/incidents.controller"
import { RunsModule } from "@incidents/runs.module"
import { IncidentsService } from "@incidents/services/incidents.service"
import { Module } from "@nestjs/common"
import { ScenariosModule } from "@scenarios/scenarios.module"

@Module({
	controllers: [IncidentsController, DemoController],
	exports: [IncidentsService, RunsModule],
	imports: [RunsModule, ScenariosModule, ActivityModule],
	providers: [IncidentsService],
})
export class IncidentsModule {}
