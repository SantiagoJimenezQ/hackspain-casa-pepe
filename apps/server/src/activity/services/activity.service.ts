import { ActivityEventEntity } from "@activity/entities/activity-event.entity"
import {
	ActivityQuery,
	ActivityRecord,
	ActivityRecordedEvent,
	RecordActivityInput,
} from "@activity/types/activity.type"
import { DOMAIN_EVENTS } from "@common/constants/domain-events.constant"
import { nowISO } from "@common/helpers/clock.helper"
import { createPrefixedIdentifier } from "@common/helpers/identifier.helper"
import { Page } from "@common/types/pagination.type"
import { Injectable } from "@nestjs/common"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { InjectRepository } from "@nestjs/typeorm"
import { FindOptionsWhere, In, MoreThan, Repository } from "typeorm"

interface ReplayRecordInput extends RecordActivityInput {
	readonly replayOfEventIdentifier: string
}

@Injectable()
export class ActivityService {
	private readonly sequences = new Map<string, number>()

	constructor(
		@InjectRepository(ActivityEventEntity)
		private readonly repository: Repository<ActivityEventEntity>,
		private readonly eventEmitter: EventEmitter2,
	) {}

	async record(input: RecordActivityInput): Promise<ActivityRecord> {
		return this.persist(input, false, "")
	}

	async recordReplay(input: ReplayRecordInput): Promise<ActivityRecord> {
		return this.persist(input, true, input.replayOfEventIdentifier)
	}

	async list(query: ActivityQuery): Promise<Page<ActivityRecord>> {
		const where: FindOptionsWhere<ActivityEventEntity> = {
			runIdentifier: query.runIdentifier,
			sequence: MoreThan(query.afterSequence),
		}
		if (query.types.length) {
			where.type = In([...query.types])
		}
		const [entities, total] = await this.repository.findAndCount({
			order: { sequence: "ASC" },
			skip: query.offset,
			take: query.limit,
			where,
		})
		return {
			items: entities.map(toActivityRecord),
			limit: query.limit,
			offset: query.offset,
			total,
		}
	}

	async listAllForRun(
		runIdentifier: string,
	): Promise<ReadonlyArray<ActivityRecord>> {
		const entities = await this.repository.find({
			order: { sequence: "ASC" },
			where: { runIdentifier },
		})
		return entities.map(toActivityRecord)
	}

	async findByIdentifier(identifier: string): Promise<ActivityRecord | null> {
		const entity = await this.repository.findOne({ where: { identifier } })
		if (!entity) {
			return null
		}
		return toActivityRecord(entity)
	}

	private async persist(
		input: RecordActivityInput,
		replayed: boolean,
		replayOfEventIdentifier: string,
	): Promise<ActivityRecord> {
		const sequence = await this.nextSequence(input.runIdentifier)
		const entity = this.repository.create({
			correlation: input.correlation,
			identifier: createPrefixedIdentifier("act"),
			incidentIdentifier: input.incidentIdentifier,
			occurredAt: nowISO(),
			payload: input.payload,
			replayed,
			replayOfEventIdentifier,
			runIdentifier: input.runIdentifier,
			sequence,
			simulated: input.simulated,
			source: input.source,
			summary: input.summary,
			title: input.title,
			type: input.type,
		})
		const saved = await this.repository.save(entity)
		const record = toActivityRecord(saved)
		const event: ActivityRecordedEvent = { record }
		this.eventEmitter.emit(DOMAIN_EVENTS.ACTIVITY_RECORDED, event)
		return record
	}

	private async nextSequence(runIdentifier: string): Promise<number> {
		const cached = this.sequences.get(runIdentifier)
		if (cached === undefined) {
			const latest = await this.repository.findOne({
				order: { sequence: "DESC" },
				where: { runIdentifier },
			})
			const seed = latest ? latest.sequence : 0
			this.sequences.set(runIdentifier, seed + 1)
			return seed + 1
		}
		this.sequences.set(runIdentifier, cached + 1)
		return cached + 1
	}
}

export function toActivityRecord(entity: ActivityEventEntity): ActivityRecord {
	return {
		correlation: entity.correlation,
		identifier: entity.identifier,
		incidentIdentifier: entity.incidentIdentifier,
		occurredAt: entity.occurredAt,
		payload: entity.payload,
		replayed: entity.replayed,
		replayOfEventIdentifier: entity.replayOfEventIdentifier,
		runIdentifier: entity.runIdentifier,
		sequence: entity.sequence,
		simulated: entity.simulated,
		source: entity.source,
		summary: entity.summary,
		title: entity.title,
		type: entity.type,
	}
}
