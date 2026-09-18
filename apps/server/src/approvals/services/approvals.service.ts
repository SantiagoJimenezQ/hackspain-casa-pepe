import { ActivityService } from "@activity/services/activity.service"
import { APPROVAL_ENTITY_NAME } from "@approvals/constants/approval.constant"
import { ApprovalEntity } from "@approvals/entities/approval.entity"
import {
	ApprovalDecidedEvent,
	ApprovalRecord,
	ApprovalStatus,
	DecideApprovalCommand,
	RequestApprovalCommand,
} from "@approvals/types/approval.type"
import { DOMAIN_EVENTS } from "@common/constants/domain-events.constant"
import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import {
	EntityNotFoundException,
	InvalidStateTransitionException,
} from "@common/exceptions/domain.exception"
import { addMilliseconds, isBefore, nowISO } from "@common/helpers/clock.helper"
import { createPrefixedIdentifier } from "@common/helpers/identifier.helper"
import { Injectable, Logger } from "@nestjs/common"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { InjectRepository } from "@nestjs/typeorm"
import { PlansService } from "@plans/services/plans.service"
import { FindOptionsWhere, Repository } from "typeorm"

@Injectable()
export class ApprovalsService {
	private readonly logger = new Logger(ApprovalsService.name)

	constructor(
		@InjectRepository(ApprovalEntity)
		private readonly repository: Repository<ApprovalEntity>,
		private readonly activityService: ActivityService,
		private readonly plansService: PlansService,
		private readonly eventEmitter: EventEmitter2,
	) {}

	async request(command: RequestApprovalCommand): Promise<ApprovalRecord> {
		const timestamp = nowISO()
		const entity = this.repository.create({
			actionSummary: command.actionSummary,
			capacityUnits: command.capacityUnits,
			comment: "",
			consequences: [...command.consequences],
			decidedAt: "",
			decidedBy: "",
			decisionIdentifier: command.decisionIdentifier,
			expiresAt: addMilliseconds(timestamp, command.timeoutMilliseconds),
			identifier: createPrefixedIdentifier("apr"),
			incidentIdentifier: command.incidentIdentifier,
			invalidationReason: "",
			planIdentifier: command.planIdentifier,
			planStepIdentifier: command.planStepIdentifier,
			planVersion: command.planVersion,
			reason: command.reason,
			requestedAt: timestamp,
			runIdentifier: command.runIdentifier,
			serviceIdentifier: command.serviceIdentifier,
			status: "pending",
			toolCallIdentifier: command.toolCallIdentifier,
		})
		const record = toApprovalRecord(await this.repository.save(entity))
		this.logger.log(LOG_MESSAGES.APPROVALS.REQUESTED, {
			approvalIdentifier: record.identifier,
			runIdentifier: record.runIdentifier,
		})
		await this.activityService.record({
			correlation: this.correlationOf(record),
			incidentIdentifier: record.incidentIdentifier,
			payload: { approval: record },
			runIdentifier: record.runIdentifier,
			simulated: false,
			source: "agent",
			summary: `${record.actionSummary}. Waiting for the operator until ${record.expiresAt}`,
			title: "Approval requested",
			type: "approval.requested",
		})
		return record
	}

	async decide(command: DecideApprovalCommand): Promise<ApprovalRecord> {
		const entity = await this.getEntity(command.approvalIdentifier)
		if (entity.status !== "pending") {
			throw new InvalidStateTransitionException(
				APPROVAL_ENTITY_NAME,
				entity.status,
				"be decided again",
			)
		}
		const activePlan = await this.plansService.findActivePlan(
			entity.runIdentifier,
		)
		const belongsToActivePlan = activePlan
			? activePlan.identifier === entity.planIdentifier
			: false
		if (!belongsToActivePlan) {
			await this.invalidate(
				entity,
				"superseded",
				"The plan version this approval belonged to is no longer active",
			)
			throw new InvalidStateTransitionException(
				APPROVAL_ENTITY_NAME,
				"superseded",
				"be decided: the plan changed, a new approval will be requested",
			)
		}
		const timestamp = nowISO()
		entity.status = command.decision === "approve" ? "approved" : "rejected"
		entity.decidedAt = timestamp
		entity.decidedBy = command.operatorName
		entity.comment = command.comment
		const record = toApprovalRecord(await this.repository.save(entity))
		this.logger.log(LOG_MESSAGES.APPROVALS.DECIDED, {
			approvalIdentifier: record.identifier,
			decision: record.status,
		})
		await this.activityService.record({
			correlation: this.correlationOf(record),
			incidentIdentifier: record.incidentIdentifier,
			payload: { approval: record },
			runIdentifier: record.runIdentifier,
			simulated: false,
			source: "operator",
			summary: `${record.decidedBy} ${record.status} "${record.actionSummary}"${record.comment ? `: ${record.comment}` : ""}`,
			title: `Approval ${record.status}`,
			type: "approval.decided",
		})
		const event: ApprovalDecidedEvent = { approval: record }
		this.eventEmitter.emit(DOMAIN_EVENTS.APPROVAL_DECIDED, event)
		return record
	}

	async supersedePending(
		runIdentifier: string,
		reason: string,
	): Promise<ReadonlyArray<ApprovalRecord>> {
		const pending = await this.repository.find({
			where: { runIdentifier, status: "pending" },
		})
		const superseded: ApprovalRecord[] = []
		for (const entity of pending) {
			superseded.push(await this.invalidate(entity, "superseded", reason))
		}
		if (superseded.length) {
			this.logger.log(LOG_MESSAGES.APPROVALS.SUPERSEDED, {
				count: superseded.length,
				runIdentifier,
			})
		}
		return superseded
	}

	async expireOverdue(
		runIdentifier: string,
	): Promise<ReadonlyArray<ApprovalRecord>> {
		const now = nowISO()
		const pending = await this.repository.find({
			where: { runIdentifier, status: "pending" },
		})
		const expired: ApprovalRecord[] = []
		for (const entity of pending) {
			if (isBefore(entity.expiresAt, now)) {
				expired.push(
					await this.invalidate(
						entity,
						"expired",
						"The operator did not decide before the timeout",
					),
				)
			}
		}
		return expired
	}

	async getByIdentifier(identifier: string): Promise<ApprovalRecord> {
		return toApprovalRecord(await this.getEntity(identifier))
	}

	async list(
		runIdentifier: string,
		status?: ApprovalStatus,
	): Promise<ReadonlyArray<ApprovalRecord>> {
		const where: FindOptionsWhere<ApprovalEntity> = { runIdentifier }
		if (status) {
			where.status = status
		}
		const entities = await this.repository.find({
			order: { requestedAt: "DESC" },
			where,
		})
		return entities.map(toApprovalRecord)
	}

	async isApproved(
		approvalIdentifier: string,
		planIdentifier: string,
	): Promise<boolean> {
		const entity = await this.repository.findOne({
			where: { identifier: approvalIdentifier },
		})
		if (!entity) {
			return false
		}
		return (
			entity.status === "approved" &&
			entity.planIdentifier === planIdentifier
		)
	}

	private async invalidate(
		entity: ApprovalEntity,
		status: "superseded" | "expired",
		reason: string,
	): Promise<ApprovalRecord> {
		entity.status = status
		entity.invalidationReason = reason
		entity.decidedAt = nowISO()
		const record = toApprovalRecord(await this.repository.save(entity))
		await this.activityService.record({
			correlation: this.correlationOf(record),
			incidentIdentifier: record.incidentIdentifier,
			payload: { approval: record },
			runIdentifier: record.runIdentifier,
			simulated: false,
			source: "agent",
			summary: `"${record.actionSummary}" is no longer waiting for a decision: ${reason}`,
			title: `Approval ${status}`,
			type:
				status === "superseded"
					? "approval.superseded"
					: "approval.expired",
		})
		return record
	}

	private async getEntity(identifier: string): Promise<ApprovalEntity> {
		const entity = await this.repository.findOne({ where: { identifier } })
		if (!entity) {
			throw new EntityNotFoundException(APPROVAL_ENTITY_NAME, identifier)
		}
		return entity
	}

	private correlationOf(record: ApprovalRecord) {
		return {
			approvalIdentifier: record.identifier,
			decisionIdentifier: record.decisionIdentifier,
			planIdentifier: record.planIdentifier,
			planStepIdentifier: record.planStepIdentifier,
			planVersion: record.planVersion,
			serviceIdentifier: record.serviceIdentifier,
			toolCallIdentifier: record.toolCallIdentifier,
		}
	}
}

export function toApprovalRecord(entity: ApprovalEntity): ApprovalRecord {
	return {
		actionSummary: entity.actionSummary,
		capacityUnits: entity.capacityUnits,
		comment: entity.comment,
		consequences: entity.consequences,
		decidedAt: entity.decidedAt,
		decidedBy: entity.decidedBy,
		decisionIdentifier: entity.decisionIdentifier,
		expiresAt: entity.expiresAt,
		identifier: entity.identifier,
		incidentIdentifier: entity.incidentIdentifier,
		invalidationReason: entity.invalidationReason,
		planIdentifier: entity.planIdentifier,
		planStepIdentifier: entity.planStepIdentifier,
		planVersion: entity.planVersion,
		reason: entity.reason,
		requestedAt: entity.requestedAt,
		runIdentifier: entity.runIdentifier,
		serviceIdentifier: entity.serviceIdentifier,
		status: entity.status,
		toolCallIdentifier: entity.toolCallIdentifier,
	}
}
