import { ActivityEventEntity } from "@activity/entities/activity-event.entity"
import {
	ActivityQuery,
	ActivityRecord,
	ActivityRecordedEvent,
	RecordActivityInput,
} from "@activity/types/activity.type"
import { DOMAIN_EVENTS } from "@common/constants/domain-events.constant"
import { insertEntity } from "@common/database/persistence.helper"
import { nowISO } from "@common/helpers/clock.helper"
import { createPrefixedIdentifier } from "@common/helpers/identifier.helper"
import { Page } from "@common/types/pagination.type"
import { Injectable } from "@nestjs/common"
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter"
import { InjectRepository } from "@nestjs/typeorm"
import { FindOptionsWhere, In, LessThan, MoreThan, Repository } from "typeorm"
import type { DeliveryProbeResult } from "../../../../../packages/contracts/demo-controls"

interface ReplayRecordInput extends RecordActivityInput {
	readonly replayOfEventIdentifier: string
}

@Injectable()
export class ActivityService {
	private readonly sequences = new Map<string, number>()
	/** Seeding queries in flight, so concurrent records share one instead of racing. */
	private readonly seeds = new Map<string, Promise<void>>()

	constructor(
		@InjectRepository(ActivityEventEntity)
		private readonly repository: Repository<ActivityEventEntity>,
		private readonly eventEmitter: EventEmitter2,
	) {}

	@OnEvent(DOMAIN_EVENTS.ACTIVITY_RECORDED)
	observeCommittedActivity({ record }: ActivityRecordedEvent) {
		this.sequences.set(
			record.runIdentifier,
			Math.max(
				this.sequences.get(record.runIdentifier) ?? 0,
				record.sequence,
			),
		)
	}

	/** Reserve before an external transaction inserts an audit row. Rollback may leave a gap. */
	reserveSequence(runIdentifier: string, persistedMaximum: number): number {
		const next =
			Math.max(this.sequences.get(runIdentifier) ?? 0, persistedMaximum) +
			1
		this.sequences.set(runIdentifier, next)
		return next
	}

	async record(input: RecordActivityInput): Promise<ActivityRecord> {
		return this.persist(input, false, "")
	}

	async recordReplay(input: ReplayRecordInput): Promise<ActivityRecord> {
		return this.persist(input, true, input.replayOfEventIdentifier)
	}

	/** Append-only events: a count detects inserts even across process-local sequence collisions. */
	async countForRun(runIdentifier: string): Promise<number> {
		return this.repository.count({ where: { runIdentifier } })
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

	async deliveryProbes(
		runIdentifier: string,
	): Promise<ReadonlyArray<DeliveryProbeResult>> {
		const rows = await this.repository.find({
			order: { sequence: "DESC" },
			take: 2,
			where: { runIdentifier, type: "recovery.probed" },
		})
		return rows
			.reverse()
			.map((row) => row.payload.probe as DeliveryProbeResult)
	}

	async llmHistory(
		runIdentifier: string,
		limit: number,
		beforeSequence?: number,
	) {
		const entities = await this.repository.find({
			order: { sequence: "DESC" },
			take: limit + 1,
			where: {
				runIdentifier,
				type: In([
					"agent.llm-output",
					"agent.llm-decision",
					"agent.llm-rejected",
					"agent.llm-stale",
					"agent.llm-failed",
				]),
				...(beforeSequence === undefined
					? {}
					: { sequence: LessThan(beforeSequence) }),
			},
		})
		const items = entities.slice(0, limit).map(toActivityRecord)
		return {
			items,
			nextBeforeSequence:
				entities.length > limit
					? items[items.length - 1].sequence
					: null,
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
		const saved = await insertEntity(this.repository, entity)
		const record = toActivityRecord(saved)
		const event: ActivityRecordedEvent = { record }
		this.eventEmitter.emit(DOMAIN_EVENTS.ACTIVITY_RECORDED, event)
		return record
	}

	/**
	 * The counter is read and bumped without an await, so concurrent records never share a
	 * number. Seeding it does query the database, and every record that arrives during that
	 * query waits on the same one: otherwise each of them would seed from the same row and
	 * hand out the same number. A number is unique within one process; two servers writing to
	 * the same database each keep their own counter, which is why readers order by time.
	 */
	private async nextSequence(runIdentifier: string): Promise<number> {
		const cached = this.sequences.get(runIdentifier)
		if (cached === undefined) {
			await this.seedSequence(runIdentifier)
			return this.nextSequence(runIdentifier)
		}
		this.sequences.set(runIdentifier, cached + 1)
		return cached + 1
	}

	private async seedSequence(runIdentifier: string): Promise<void> {
		const pending = this.seeds.get(runIdentifier)
		if (pending) {
			await pending
			return
		}
		const seeding = this.repository
			.findOne({
				order: { sequence: "DESC" },
				where: { runIdentifier },
			})
			.then((latest) => {
				if (this.sequences.get(runIdentifier) === undefined) {
					this.sequences.set(
						runIdentifier,
						latest ? latest.sequence : 0,
					)
				}
			})
			.finally(() => {
				this.seeds.delete(runIdentifier)
			})
		this.seeds.set(runIdentifier, seeding)
		await seeding
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
