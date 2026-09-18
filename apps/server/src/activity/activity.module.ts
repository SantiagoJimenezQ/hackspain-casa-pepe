import { ActivityController } from "@activity/controllers/activity.controller"
import { ActivityStreamController } from "@activity/controllers/activity-stream.controller"
import { ActivityEventEntity } from "@activity/entities/activity-event.entity"
import { ActivityService } from "@activity/services/activity.service"
import { RunsModule } from "@incidents/runs.module"
import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"

@Module({
	controllers: [ActivityController, ActivityStreamController],
	exports: [ActivityService],
	imports: [TypeOrmModule.forFeature([ActivityEventEntity]), RunsModule],
	providers: [ActivityService],
})
export class ActivityModule {}
