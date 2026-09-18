import { nowISO } from "@common/helpers/clock.helper"
import { createPrefixedIdentifier } from "@common/helpers/identifier.helper"
import { LearningInsightEntity } from "@learning/entities/learning-insight.entity"
import {
	CapacityInsight,
	LearningInsightRecord,
} from "@learning/types/learning.type"
import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { FindOptionsWhere, Repository } from "typeorm"

@Injectable()
export class LearningService {
	constructor(
		@InjectRepository(LearningInsightEntity)
		private readonly repository: Repository<LearningInsightEntity>,
	) {}

	async recordCapacityObservation(
		scenarioIdentifier: string,
		resourceIdentifier: string,
		reportedCapacity: number,
		confirmedCapacity: number,
		runIdentifier: string,
	): Promise<LearningInsightRecord | null> {
		if (confirmedCapacity >= reportedCapacity) {
			return null
		}
		const existing = await this.repository.findOne({
			where: {
				kind: "capacity-overstated",
				scenarioIdentifier,
				subject: resourceIdentifier,
			},
		})
		const timestamp = nowISO()
		const previousConfirmed =
			existing && existing.data.kind === "capacity-overstated"
				? existing.data.confirmedCapacity
				: confirmedCapacity
		const entity = existing
			? existing
			: this.repository.create({
					createdAt: timestamp,
					identifier: createPrefixedIdentifier("ins"),
					kind: "capacity-overstated",
					observations: 0,
					scenarioIdentifier,
					subject: resourceIdentifier,
				})
		const lowestConfirmed = Math.min(previousConfirmed, confirmedCapacity)
		entity.observations = entity.observations + 1
		entity.lastRunIdentifier = runIdentifier
		entity.data = {
			confirmedCapacity: lowestConfirmed,
			kind: "capacity-overstated",
			reportedCapacity,
		}
		entity.summary = `The dashboard reported ${reportedCapacity} units but only ${lowestConfirmed} were really available (${entity.observations} observations)`
		entity.updatedAt = timestamp
		return toInsightRecord(await this.repository.save(entity))
	}

	async recordRecoveryOutcome(
		scenarioIdentifier: string,
		serviceIdentifier: string,
		outcome: string,
		detail: string,
		runIdentifier: string,
	): Promise<LearningInsightRecord> {
		const existing = await this.repository.findOne({
			where: {
				kind: "recovery-outcome",
				scenarioIdentifier,
				subject: serviceIdentifier,
			},
		})
		const timestamp = nowISO()
		const previousOutcomes =
			existing && existing.data.kind === "recovery-outcome"
				? existing.data.outcomes
				: {}
		const { [outcome]: previousCount = 0 } = previousOutcomes
		const outcomes = { ...previousOutcomes, [outcome]: previousCount + 1 }
		const entity = existing
			? existing
			: this.repository.create({
					createdAt: timestamp,
					identifier: createPrefixedIdentifier("ins"),
					kind: "recovery-outcome",
					observations: 0,
					scenarioIdentifier,
					subject: serviceIdentifier,
				})
		entity.observations = entity.observations + 1
		entity.lastRunIdentifier = runIdentifier
		entity.data = { kind: "recovery-outcome", lastDetail: detail, outcomes }
		entity.summary = `${serviceIdentifier} recovery outcomes across runs: ${Object.entries(
			outcomes,
		)
			.map(([name, count]) => `${name} ×${count}`)
			.join(", ")}`
		entity.updatedAt = timestamp
		return toInsightRecord(await this.repository.save(entity))
	}

	async findCapacityInsight(
		scenarioIdentifier: string,
		resourceIdentifier: string,
	): Promise<CapacityInsight | null> {
		const entity = await this.repository.findOne({
			where: {
				kind: "capacity-overstated",
				scenarioIdentifier,
				subject: resourceIdentifier,
			},
		})
		if (!entity) {
			return null
		}
		if (entity.data.kind !== "capacity-overstated") {
			return null
		}
		return {
			confirmedCapacity: entity.data.confirmedCapacity,
			observations: entity.observations,
			reportedCapacity: entity.data.reportedCapacity,
		}
	}

	async list(
		scenarioIdentifier?: string,
	): Promise<ReadonlyArray<LearningInsightRecord>> {
		const where: FindOptionsWhere<LearningInsightEntity> = {}
		if (scenarioIdentifier) {
			where.scenarioIdentifier = scenarioIdentifier
		}
		const entities = await this.repository.find({
			order: { updatedAt: "DESC" },
			where,
		})
		return entities.map(toInsightRecord)
	}

	async clear(): Promise<number> {
		const entities = await this.repository.find()
		await this.repository.remove(entities)
		return entities.length
	}
}

export function toInsightRecord(
	entity: LearningInsightEntity,
): LearningInsightRecord {
	return {
		createdAt: entity.createdAt,
		data: entity.data,
		identifier: entity.identifier,
		kind: entity.kind,
		lastRunIdentifier: entity.lastRunIdentifier,
		observations: entity.observations,
		scenarioIdentifier: entity.scenarioIdentifier,
		subject: entity.subject,
		summary: entity.summary,
		updatedAt: entity.updatedAt,
	}
}
