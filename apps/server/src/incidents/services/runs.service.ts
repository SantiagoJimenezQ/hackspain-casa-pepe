import { RUN_IDLE_TIMEOUT_MILLISECONDS } from "@agent/constants/agent.constant"
import {
	currentSessionId,
	sessionContext,
} from "@authentication/session/browser-session"
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
import { In, MoreThanOrEqual, Raw, Repository } from "typeorm"

@Injectable()
export class RunsService {
	constructor(
		@InjectRepository(IncidentEntity)
		private readonly repository: Repository<IncidentEntity>,
	) {}

	async findActiveEntity(): Promise<IncidentEntity | null> {
		return this.repository.findOne({
			order: { createdAt: "DESC" },
			where: { active: true, browserSessionId: currentSessionId() },
		})
	}

	/** Filter in Postgres: rejected rows must never cross the pooler connection. */
	async listLiveEntities(): Promise<IncidentEntity[]> {
		return this.repository.find({
			order: { createdAt: "DESC" },
			where: this.liveWhere(),
		})
	}

	async listAutomaticSimulationRuns(): Promise<
		Pick<IncidentEntity, "runIdentifier">[]
	> {
		return this.repository.find({
			order: { createdAt: "DESC" },
			select: { runIdentifier: true },
			where: {
				...this.liveWhere(),
				simulation: Raw(
					(column) =>
						`${column} ->> 'mode' = :mode AND ${column} ->> 'paused' = :paused`,
					{
						mode: "randomized",
						paused: "false",
					},
				),
			},
		})
	}

	private liveWhere() {
		return {
			active: true,
			runKind: "live" as const,
			status: In(["detected", "responding", "partially-recovered"]),
			// All persisted timestamps are canonical UTC ISO strings from nowISO().
			updatedAt: MoreThanOrEqual(
				new Date(
					Date.now() - RUN_IDLE_TIMEOUT_MILLISECONDS,
				).toISOString(),
			),
		}
	}

	/** Resolve browser ownership without retrieving the incident's JSON state. */
	async getReference(
		requestedRunIdentifier?: string,
	): Promise<Pick<IncidentEntity, "runIdentifier" | "updatedAt">> {
		const entity = await this.repository.findOne({
			order: { createdAt: "DESC" },
			select: { runIdentifier: true, updatedAt: true },
			where: requestedRunIdentifier
				? {
						runIdentifier: requestedRunIdentifier,
						...(sessionContext.getStore()
							? { browserSessionId: currentSessionId() }
							: {}),
					}
				: { active: true, browserSessionId: currentSessionId() },
		})
		if (!entity) {
			if (requestedRunIdentifier)
				throw new EntityNotFoundException(
					RUN_ENTITY_NAME,
					requestedRunIdentifier,
				)
			throw new NoActiveRunException()
		}
		return entity
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
			where: {
				runIdentifier,
				...(sessionContext.getStore()
					? { browserSessionId: currentSessionId() }
					: {}),
			},
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
			select: { active: true },
			where: {
				runIdentifier,
				...(sessionContext.getStore()
					? { browserSessionId: currentSessionId() }
					: {}),
			},
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
			return (await this.getReference(requestedRunIdentifier))
				.runIdentifier
		}
		return (await this.getReference()).runIdentifier
	}

	async listRuns(): Promise<ReadonlyArray<RunSummary>> {
		const entities = await this.repository.find({
			order: { createdAt: "DESC" },
			where: { browserSessionId: currentSessionId() },
		})
		return entities.map(toRunSummary)
	}
}
