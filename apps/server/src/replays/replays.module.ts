import { ActivityModule } from "@activity/activity.module"
import { IncidentsModule } from "@incidents/incidents.module"
import { Module } from "@nestjs/common"
import { ReplaysController } from "@replays/controllers/replays.controller"
import { ReplaysService } from "@replays/services/replays.service"

@Module({
	controllers: [ReplaysController],
	imports: [IncidentsModule, ActivityModule],
	providers: [ReplaysService],
})
export class ReplaysModule {}
