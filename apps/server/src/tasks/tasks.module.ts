import { ActivityModule } from "@activity/activity.module"
import { RunsModule } from "@incidents/runs.module"
import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { TasksController } from "@tasks/controllers/tasks.controller"
import { TaskEntity } from "@tasks/entities/task.entity"
import { TasksService } from "@tasks/services/tasks.service"

@Module({
	controllers: [TasksController],
	exports: [TasksService],
	imports: [
		TypeOrmModule.forFeature([TaskEntity]),
		ActivityModule,
		RunsModule,
	],
	providers: [TasksService],
})
export class TasksModule {}
