import { IncidentEntity } from "@incidents/entities/incident.entity"
import { RunsService } from "@incidents/services/runs.service"
import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"

@Module({
	exports: [RunsService, TypeOrmModule],
	imports: [TypeOrmModule.forFeature([IncidentEntity])],
	providers: [RunsService],
})
export class RunsModule {}
