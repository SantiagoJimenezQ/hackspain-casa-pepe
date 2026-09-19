import { RUN_IDLE_TIMEOUT_MILLISECONDS } from "@agent/constants/agent.constant"
import {
	EntityNotFoundException,
	NoActiveRunException,
} from "@common/exceptions/domain.exception"
import { RUN_ENTITY_NAME } from "@incidents/constants/incident.constant"
import { IncidentEntity } from "@incidents/entities/incident.entity"
import {
	toIncidentSnapshot,
	toRunSummary,
} from "@incidents/helpers/incident-state.helper"
import { IncidentSnapshot, RunSummary } from "@incidents/types/incident.type"
import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"

@Injectable()
export class RunsService {
	constructor(
		@InjectRepository(IncidentEntity)
		private readonly repository: Repository<IncidentEntity>,
	) {}

	async findActiveEntity(): Promise<IncidentEntity | null> {
		return this.repository.findOne({
			order: { createdAt: "DESC" },
			where: { active: true },
		})
	}

	/** Every run currently active. Several people can drive independent runs at the same time. */
	async listActiveEntities(): Promise<IncidentEntity[]> {
		return this.repository.find({
			order: { createdAt: "DESC" },
			where: { active: true },
		})
	}

	/**
	 * Active runs that background work should still follow. An abandoned demo stops being
	 * ticked so it cannot starve the connection pool of the runs people are actually using.
	 */
	async listLiveEntities(): Promise<IncidentEntity[]> {
		const oldestAllowed = Date.now() - RUN_IDLE_TIMEOUT_MILLISECONDS
		return (await this.listActiveEntities()).filter((entity) => {
			const updatedAt = new Date(entity.updatedAt).getTime()
			if (Number.isNaN(updatedAt)) {
				return true
			}
			return updatedAt >= oldestAllowed
		})
	}

	async getActiveEntity(): Promise<IncidentEntity> {
		const entity = await this.findActiveEntity()
		if (!entity) {
			throw new NoActiveRunException()
		}
		return entity
	}

	async getActive(): Promise<IncidentSnapshot> {
		return toIncidentSnapshot(await this.getActiveEntity())
	}

	async getEntityByRunIdentifier(
		runIdentifier: string,
	): Promise<IncidentEntity> {
		const entity = await this.repository.findOne({
			where: { runIdentifier },
		})
		if (!entity) {
			throw new EntityNotFoundException(RUN_ENTITY_NAME, runIdentifier)
		}
		return entity
	}

	async getByRunIdentifier(runIdentifier: string): Promise<IncidentSnapshot> {
		return toIncidentSnapshot(
			await this.getEntityByRunIdentifier(runIdentifier),
		)
	}

	async isRunActive(runIdentifier: string): Promise<boolean> {
		const entity = await this.repository.findOne({
			where: { runIdentifier },
		})
		if (!entity) {
			return false
		}
		return entity.active
	}

	async resolveRunIdentifier(
		requestedRunIdentifier?: string,
	): Promise<string> {
		if (requestedRunIdentifier) {
			return (await this.getEntityByRunIdentifier(requestedRunIdentifier))
				.runIdentifier
		}
		return (await this.getActiveEntity()).runIdentifier
	}

	async listRuns(): Promise<ReadonlyArray<RunSummary>> {
		const entities = await this.repository.find({
			order: { createdAt: "DESC" },
		})
		return entities.map(toRunSummary)
	}
}
