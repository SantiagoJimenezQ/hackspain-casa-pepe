import { ActivityService } from "@activity/services/activity.service"
import { DOMAIN_EVENTS } from "@common/constants/domain-events.constant"
import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import { EntityNotFoundException } from "@common/exceptions/domain.exception"
import { nowISO } from "@common/helpers/clock.helper"
import { createPrefixedIdentifier } from "@common/helpers/identifier.helper"
import { Injectable, Logger } from "@nestjs/common"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { InjectRepository } from "@nestjs/typeorm"
import { TASK_ENTITY_NAME } from "@tasks/constants/task.constant"
import { TaskEntity } from "@tasks/entities/task.entity"
import {
	CreateTaskCommand,
	TaskRecord,
	TaskStatus,
	TaskUpdatedEvent,
} from "@tasks/types/task.type"
import { FindOptionsWhere, Repository } from "typeorm"

@Injectable()
export class TasksService {
	private readonly logger = new Logger(TasksService.name)

	constructor(
		@InjectRepository(TaskEntity)
		private readonly repository: Repository<TaskEntity>,
		private readonly activityService: ActivityService,
		private readonly eventEmitter: EventEmitter2,
	) {}

	async create(command: CreateTaskCommand): Promise<TaskRecord> {
		const timestamp = nowISO()
		const entity = this.repository.create({
			assignee: command.assignee,
			createdAt: timestamp,
			createdBy: command.createdBy,
			description: command.description,
			identifier: createPrefixedIdentifier("task"),
			incidentIdentifier: command.incidentIdentifier,
			planIdentifier: command.planIdentifier,
			planStepIdentifier: command.planStepIdentifier,
			priority: command.priority,
			runIdentifier: command.runIdentifier,
			serviceIdentifier: command.serviceIdentifier,
			status: "open",
			statusNote: "",
			title: command.title,
			toolCallIdentifier: command.toolCallIdentifier,
			updatedAt: timestamp,
		})
		const record = toTaskRecord(await this.repository.save(entity))
		this.logger.log(LOG_MESSAGES.TASKS.ASSIGNED, {
			assignee: record.assignee.name,
			taskIdentifier: record.identifier,
		})
		await this.activityService.record({
			correlation: {
				planIdentifier: record.planIdentifier,
				planStepIdentifier: record.planStepIdentifier,
				serviceIdentifier: record.serviceIdentifier,
				taskIdentifier: record.identifier,
				toolCallIdentifier: record.toolCallIdentifier,
			},
			incidentIdentifier: record.incidentIdentifier,
			payload: { task: record },
			runIdentifier: record.runIdentifier,
			simulated: false,
			source: "agent",
			summary: `"${record.title}" assigned to ${record.assignee.name} (${record.assignee.role}) with ${record.priority} priority`,
			title: "Task assigned",
			type: "task.assigned",
		})
		return record
	}

	async updateStatus(
		identifier: string,
		status: TaskStatus,
		note: string,
		updatedBy: string,
	): Promise<TaskRecord> {
		const entity = await this.repository.findOne({ where: { identifier } })
		if (!entity) {
			throw new EntityNotFoundException(TASK_ENTITY_NAME, identifier)
		}
		entity.status = status
		entity.statusNote = note
		entity.updatedAt = nowISO()
		const record = toTaskRecord(await this.repository.save(entity))
		this.logger.log(LOG_MESSAGES.TASKS.UPDATED, {
			status: record.status,
			taskIdentifier: record.identifier,
		})
		await this.activityService.record({
			correlation: {
				planStepIdentifier: record.planStepIdentifier,
				serviceIdentifier: record.serviceIdentifier,
				taskIdentifier: record.identifier,
			},
			incidentIdentifier: record.incidentIdentifier,
			payload: { task: record, updatedBy },
			runIdentifier: record.runIdentifier,
			simulated: false,
			source: "operator",
			summary: `${updatedBy} marked "${record.title}" as ${record.status}${note ? `: ${note}` : ""}`,
			title: "Task updated",
			type: "task.updated",
		})
		const event: TaskUpdatedEvent = { task: record }
		this.eventEmitter.emit(DOMAIN_EVENTS.TASK_UPDATED, event)
		return record
	}

	async list(
		runIdentifier: string,
		status?: TaskStatus,
	): Promise<ReadonlyArray<TaskRecord>> {
		const where: FindOptionsWhere<TaskEntity> = { runIdentifier }
		if (status) {
			where.status = status
		}
		const entities = await this.repository.find({
			order: { createdAt: "ASC" },
			where,
		})
		return entities.map(toTaskRecord)
	}
}

export function toTaskRecord(entity: TaskEntity): TaskRecord {
	return {
		assignee: entity.assignee,
		createdAt: entity.createdAt,
		createdBy: entity.createdBy,
		description: entity.description,
		identifier: entity.identifier,
		incidentIdentifier: entity.incidentIdentifier,
		planIdentifier: entity.planIdentifier,
		planStepIdentifier: entity.planStepIdentifier,
		priority: entity.priority,
		runIdentifier: entity.runIdentifier,
		serviceIdentifier: entity.serviceIdentifier,
		status: entity.status,
		statusNote: entity.statusNote,
		title: entity.title,
		toolCallIdentifier: entity.toolCallIdentifier,
		updatedAt: entity.updatedAt,
	}
}
