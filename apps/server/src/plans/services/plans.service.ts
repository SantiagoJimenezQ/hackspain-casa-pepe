import { ActivityService } from "@activity/services/activity.service"
import { EntityNotFoundException } from "@common/exceptions/domain.exception"
import { nowISO } from "@common/helpers/clock.helper"
import { createPrefixedIdentifier } from "@common/helpers/identifier.helper"
import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import {
	PLAN_ENTITY_NAME,
	PLAN_STEP_ENTITY_NAME,
} from "@plans/constants/plan.constant"
import { PlanEntity } from "@plans/entities/plan.entity"
import {
	CreatePlanInput,
	PlanRecord,
	PlanStep,
	StepUpdate,
} from "@plans/types/plan.type"
import { Repository } from "typeorm"

@Injectable()
export class PlansService {
	constructor(
		@InjectRepository(PlanEntity)
		private readonly repository: Repository<PlanEntity>,
		private readonly activityService: ActivityService,
	) {}

	async findActivePlan(runIdentifier: string): Promise<PlanRecord | null> {
		const entity = await this.repository.findOne({
			order: { version: "DESC" },
			where: { runIdentifier, status: "active" },
		})
		if (!entity) {
			return null
		}
		return toPlanRecord(entity)
	}

	async findLatestPlan(runIdentifier: string): Promise<PlanRecord | null> {
		const entity = await this.repository.findOne({
			order: { version: "DESC" },
			where: { runIdentifier },
		})
		if (!entity) {
			return null
		}
		return toPlanRecord(entity)
	}

	async getByIdentifier(identifier: string): Promise<PlanRecord> {
		return toPlanRecord(await this.getEntity(identifier))
	}

	async listForRun(
		runIdentifier: string,
	): Promise<ReadonlyArray<PlanRecord>> {
		const entities = await this.repository.find({
			order: { version: "ASC" },
			where: { runIdentifier },
		})
		return entities.map(toPlanRecord)
	}

	async createVersion(input: CreatePlanInput): Promise<PlanRecord> {
		const timestamp = nowISO()
		const previous = input.previous
		if (previous) {
			const previousEntity = await this.getEntity(previous.identifier)
			previousEntity.status = "superseded"
			previousEntity.updatedAt = timestamp
			await this.repository.save(previousEntity)
		}
		const entity = this.repository.create({
			capacity: input.capacity,
			changesFromPrevious: [...input.changesFromPrevious],
			createdAt: timestamp,
			decisionIdentifier: input.decisionIdentifier,
			identifier: createPrefixedIdentifier("plan"),
			incidentIdentifier: input.incidentIdentifier,
			previousPlanIdentifier: previous ? previous.identifier : "",
			priorities: [...input.priorities],
			reason: input.reason,
			runIdentifier: input.runIdentifier,
			status: "active",
			steps: [...input.steps],
			summary: input.summary,
			triggeredBy: input.triggeredBy,
			updatedAt: timestamp,
			version: previous ? previous.version + 1 : 1,
		})
		const saved = await this.repository.save(entity)
		const record = toPlanRecord(saved)
		await this.activityService.record({
			correlation: {
				decisionIdentifier: record.decisionIdentifier,
				planIdentifier: record.identifier,
				planVersion: record.version,
			},
			incidentIdentifier: record.incidentIdentifier,
			payload: { plan: record },
			runIdentifier: record.runIdentifier,
			simulated: false,
			source: "agent",
			summary: record.summary,
			title: previous
				? `Plan revised (version ${record.version})`
				: "Initial plan created",
			type: previous ? "plan.revised" : "plan.created",
		})
		return record
	}

	async updateStep(
		planIdentifier: string,
		stepIdentifier: string,
		update: StepUpdate,
	): Promise<PlanRecord> {
		const entity = await this.getEntity(planIdentifier)
		const timestamp = nowISO()
		const existing = entity.steps.find(
			(step) => step.identifier === stepIdentifier,
		)
		if (!existing) {
			throw new EntityNotFoundException(
				PLAN_STEP_ENTITY_NAME,
				stepIdentifier,
			)
		}
		const {
			approvalIdentifier = existing.approvalIdentifier,
			attempts = existing.attempts,
			resultSummary = existing.resultSummary,
			toolCallIdentifier = existing.toolCallIdentifier,
		} = update
		const updated: PlanStep = {
			...existing,
			approvalIdentifier,
			attempts,
			resultSummary,
			status: update.status,
			statusReason: update.statusReason,
			toolCallIdentifier,
			updatedAt: timestamp,
		}
		entity.steps = entity.steps.map((step) =>
			step.identifier === stepIdentifier ? updated : step,
		)
		entity.updatedAt = timestamp
		const saved = await this.repository.save(entity)
		const record = toPlanRecord(saved)
		await this.activityService.record({
			correlation: {
				approvalIdentifier: updated.approvalIdentifier,
				planIdentifier: record.identifier,
				planStepIdentifier: updated.identifier,
				planVersion: record.version,
				serviceIdentifier: updated.serviceIdentifier,
				toolCallIdentifier: updated.toolCallIdentifier,
			},
			incidentIdentifier: record.incidentIdentifier,
			payload: { step: updated },
			runIdentifier: record.runIdentifier,
			simulated: false,
			source: "agent",
			summary: `${updated.title}: ${updated.status}. ${updated.statusReason}`,
			title: "Plan step updated",
			type: "plan-step.updated",
		})
		return record
	}

	async markCompleted(planIdentifier: string): Promise<PlanRecord> {
		const entity = await this.getEntity(planIdentifier)
		entity.status = "completed"
		entity.updatedAt = nowISO()
		return toPlanRecord(await this.repository.save(entity))
	}

	private async getEntity(identifier: string): Promise<PlanEntity> {
		const entity = await this.repository.findOne({ where: { identifier } })
		if (!entity) {
			throw new EntityNotFoundException(PLAN_ENTITY_NAME, identifier)
		}
		return entity
	}
}

export function toPlanRecord(entity: PlanEntity): PlanRecord {
	return {
		capacity: entity.capacity,
		changesFromPrevious: entity.changesFromPrevious,
		createdAt: entity.createdAt,
		decisionIdentifier: entity.decisionIdentifier,
		identifier: entity.identifier,
		incidentIdentifier: entity.incidentIdentifier,
		previousPlanIdentifier: entity.previousPlanIdentifier,
		priorities: entity.priorities,
		reason: entity.reason,
		runIdentifier: entity.runIdentifier,
		status: entity.status,
		steps: entity.steps,
		summary: entity.summary,
		triggeredBy: entity.triggeredBy,
		updatedAt: entity.updatedAt,
		version: entity.version,
	}
}
