import { ActivityService } from "@activity/services/activity.service"
import { DOMAIN_EVENTS } from "@common/constants/domain-events.constant"
import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import { insertEntity, updateEntity } from "@common/database/persistence.helper"
import {
	EntityNotFoundException,
	InvalidStateTransitionException,
	StaleRunException,
} from "@common/exceptions/domain.exception"
import { nowISO } from "@common/helpers/clock.helper"
import { createPrefixedIdentifier } from "@common/helpers/identifier.helper"
import { ConfigurationService } from "@common/services/configuration.service"
import { IncidentsService } from "@incidents/services/incidents.service"
import { RunsService } from "@incidents/services/runs.service"
import { Inject, Injectable, Logger } from "@nestjs/common"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { InjectRepository } from "@nestjs/typeorm"
import {
	RECOVERY_ACTION_ENTITY_NAME,
	RECOVERY_ADAPTER,
	RECOVERY_CALLBACK_PATH,
	RECOVERY_ERROR_CODES,
} from "@recovery/constants/recovery.constant"
import { RecoveryActionEntity } from "@recovery/entities/recovery-action.entity"
import {
	ExecuteRecoveryCommand,
	ExecuteRecoveryOutcome,
	RecoveryActionFinishedEvent,
	RecoveryActionRecord,
	RecoveryAdapter,
	RecoveryResult,
	ServiceStatusCheck,
	ServicesStatusReport,
	VerificationResult,
} from "@recovery/types/recovery.type"
import { Repository } from "typeorm"

@Injectable()
export class RecoveryService {
	private readonly logger = new Logger(RecoveryService.name)

	constructor(
		@InjectRepository(RecoveryActionEntity)
		private readonly repository: Repository<RecoveryActionEntity>,
		@Inject(RECOVERY_ADAPTER) private readonly adapter: RecoveryAdapter,
		private readonly activityService: ActivityService,
		private readonly incidentsService: IncidentsService,
		private readonly runsService: RunsService,
		private readonly configuration: ConfigurationService,
		private readonly eventEmitter: EventEmitter2,
	) {}

	get mode() {
		return this.adapter.mode
	}

	async execute(
		command: ExecuteRecoveryCommand,
	): Promise<ExecuteRecoveryOutcome> {
		const allocation = await this.incidentsService.allocateCapacity({
			resourceIdentifier: command.resourceIdentifier,
			runIdentifier: command.runIdentifier,
			serviceIdentifier: command.serviceIdentifier,
			units: command.capacityUnits,
		})
		if (allocation.kind === "insufficient") {
			return {
				code: RECOVERY_ERROR_CODES.CAPACITY_INSUFFICIENT,
				kind: "rejected",
				message: `${command.serviceIdentifier} needs ${allocation.requestedUnits} units but only ${allocation.remainingCapacity} remain in the backup region`,
			}
		}
		const incident = await this.runsService.getByRunIdentifier(
			command.runIdentifier,
		)
		const service = incident.services.find(
			(candidate) => candidate.identifier === command.serviceIdentifier,
		)
		if (!service) {
			return {
				code: RECOVERY_ERROR_CODES.EXECUTION_FAILED,
				kind: "rejected",
				message: `${command.serviceIdentifier} is not part of the incident`,
			}
		}
		await this.incidentsService.setServiceStatus(
			command.runIdentifier,
			command.serviceIdentifier,
			"recovering",
			command.actionDescription,
			this.adapter.mode === "simulated",
		)
		const timestamp = nowISO()
		const entity = this.repository.create({
			actionDescription: command.actionDescription,
			actionKind: command.actionKind,
			approvalIdentifier: command.approvalIdentifier,
			capacityUnits: command.capacityUnits,
			finishedAt: "",
			identifier: createPrefixedIdentifier("rec"),
			incidentIdentifier: command.incidentIdentifier,
			mode: this.adapter.mode,
			planStepIdentifier: command.planStepIdentifier,
			providerReference: "",
			resourceIdentifier: command.resourceIdentifier,
			result: null,
			runIdentifier: command.runIdentifier,
			serviceIdentifier: command.serviceIdentifier,
			startedAt: timestamp,
			status: "requested",
			toolCallIdentifier: command.toolCallIdentifier,
		})
		const saved = await insertEntity(this.repository, entity)
		this.logger.log(LOG_MESSAGES.RECOVERY.ACTION_STARTED, {
			actionIdentifier: saved.identifier,
			mode: saved.mode,
			serviceIdentifier: saved.serviceIdentifier,
		})
		const simulatedScript =
			await this.incidentsService.sampleRecoveryScript(
				command.runIdentifier,
				command.serviceIdentifier,
				{
					detail: service.simulatedOutcomeDetail,
					outcome: service.simulatedOutcome,
				},
			)
		const outcome = await this.adapter.execute(
			{
				action: toRecoveryActionRecord(saved),
				callbackURL: `${this.configuration.runtime.publicBaseURL}/${RECOVERY_CALLBACK_PATH}`,
				simulatedScript,
			},
			(actionIdentifier, result) =>
				this.complete(actionIdentifier, result),
		)
		switch (outcome.kind) {
			case "accepted":
				saved.status = "running"
				saved.providerReference = outcome.providerReference
				return {
					action: toRecoveryActionRecord(
						await updateEntity(this.repository, saved),
					),
					kind: "in-progress",
				}
			case "completed":
				return {
					action: await this.finish(saved, outcome.result, false),
					kind: "finished",
				}
			case "failed":
				return {
					action: await this.finish(
						saved,
						{ detail: outcome.reason, outcome: "failure" },
						false,
					),
					kind: "finished",
				}
		}
	}

	async complete(
		actionIdentifier: string,
		result: RecoveryResult,
	): Promise<void> {
		const entity = await this.getEntity(actionIdentifier)
		const runActive = await this.runsService.isRunActive(
			entity.runIdentifier,
		)
		if (!runActive) {
			this.logger.warn(LOG_MESSAGES.INCIDENTS.STALE_RESULT_IGNORED, {
				actionIdentifier,
				runIdentifier: entity.runIdentifier,
			})
			throw new StaleRunException(entity.runIdentifier)
		}
		if (entity.status !== "requested" && entity.status !== "running") {
			throw new InvalidStateTransitionException(
				RECOVERY_ACTION_ENTITY_NAME,
				entity.status,
				"receive another result",
			)
		}
		await this.finish(entity, result, true)
	}

	async verify(
		runIdentifier: string,
		incidentIdentifier: string,
		serviceIdentifier: string,
		recoveryActionIdentifier: string,
		toolCallIdentifier: string,
	): Promise<VerificationResult> {
		const verification = await this.adapter.verify(
			runIdentifier,
			serviceIdentifier,
		)
		this.logger.log(LOG_MESSAGES.RECOVERY.VERIFICATION_FINISHED, {
			serviceIdentifier,
			verified: verification.verified,
		})
		await this.activityService.record({
			correlation: {
				recoveryActionIdentifier,
				serviceIdentifier,
				toolCallIdentifier,
			},
			incidentIdentifier,
			payload: { verification },
			runIdentifier,
			simulated: verification.mode === "simulated",
			source: "tool",
			summary: verification.verified
				? `${serviceIdentifier} verified healthy through an independent check (${verification.mode})`
				: `${serviceIdentifier} is ${verification.status} after the recovery: ${verification.detail}`,
			title: "Recovery verified",
			type: "recovery.verified",
		})
		return verification
	}

	async checkServices(
		runIdentifier: string,
		incidentIdentifier: string,
		toolCallIdentifier: string,
	): Promise<ServicesStatusReport> {
		const incident =
			await this.runsService.getByRunIdentifier(runIdentifier)
		const checks: ServiceStatusCheck[] = []
		for (const service of incident.services) {
			const verification = await this.adapter.verify(
				runIdentifier,
				service.identifier,
			)
			checks.push({
				detail: verification.detail,
				healthy: verification.verified,
				knownStatus: service.status,
				matches: verification.status === service.status,
				observedStatus: verification.status,
				serviceIdentifier: service.identifier,
				serviceName: service.name,
			})
		}
		const discrepancies = checks
			.filter((check) => !check.matches)
			.map(
				(check) =>
					`${check.serviceName} is recorded as ${check.knownStatus} but the independent check reports ${check.observedStatus}`,
			)
		const report: ServicesStatusReport = {
			checks,
			discrepancies,
			healthyCount: checks.filter((check) => check.healthy).length,
			mode: this.adapter.mode,
			totalCount: checks.length,
		}
		this.logger.log(LOG_MESSAGES.RECOVERY.SERVICES_CHECKED, {
			discrepancies: discrepancies.length,
			healthyCount: report.healthyCount,
			totalCount: report.totalCount,
		})
		await this.activityService.record({
			correlation: { toolCallIdentifier },
			incidentIdentifier,
			payload: { report },
			runIdentifier,
			simulated: report.mode === "simulated",
			source: "tool",
			summary: discrepancies.length
				? `${report.healthyCount} of ${report.totalCount} services healthy (${report.mode}). Discrepancies: ${discrepancies.join("; ")}`
				: `${report.healthyCount} of ${report.totalCount} services healthy (${report.mode}). The independent check matches the recorded state`,
			title: "Service status checked",
			type: "services.checked",
		})
		return report
	}

	async list(
		runIdentifier: string,
	): Promise<ReadonlyArray<RecoveryActionRecord>> {
		const entities = await this.repository.find({
			order: { startedAt: "ASC" },
			where: { runIdentifier },
		})
		return entities.map(toRecoveryActionRecord)
	}

	private async finish(
		entity: RecoveryActionEntity,
		result: RecoveryResult,
		emitEvent: boolean,
	): Promise<RecoveryActionRecord> {
		entity.result = result
		entity.finishedAt = nowISO()
		entity.status =
			result.outcome === "success"
				? "succeeded"
				: result.outcome === "partial"
					? "partial"
					: "failed"
		const record = toRecoveryActionRecord(
			await updateEntity(this.repository, entity),
		)
		this.logger.log(LOG_MESSAGES.RECOVERY.ACTION_FINISHED, {
			actionIdentifier: record.identifier,
			outcome: result.outcome,
		})
		await this.applyResultToHarness(record, result)
		await this.activityService.record({
			correlation: {
				approvalIdentifier: record.approvalIdentifier,
				planStepIdentifier: record.planStepIdentifier,
				recoveryActionIdentifier: record.identifier,
				serviceIdentifier: record.serviceIdentifier,
				toolCallIdentifier: record.toolCallIdentifier,
			},
			incidentIdentifier: record.incidentIdentifier,
			payload: { action: record },
			runIdentifier: record.runIdentifier,
			simulated: record.mode === "simulated",
			source: "integration",
			summary: `${record.actionDescription}: ${result.outcome}. ${result.detail}`,
			title: "Recovery action executed",
			type: "recovery.executed",
		})
		if (emitEvent) {
			const event: RecoveryActionFinishedEvent = { action: record }
			this.eventEmitter.emit(
				DOMAIN_EVENTS.RECOVERY_ACTION_FINISHED,
				event,
			)
		}
		return record
	}

	private async applyResultToHarness(
		record: RecoveryActionRecord,
		result: RecoveryResult,
	): Promise<void> {
		const simulated = record.mode === "simulated"
		switch (result.outcome) {
			case "success":
				await this.incidentsService.setServiceStatus(
					record.runIdentifier,
					record.serviceIdentifier,
					"healthy",
					result.detail,
					simulated,
				)
				return
			case "partial":
				await this.incidentsService.setServiceStatus(
					record.runIdentifier,
					record.serviceIdentifier,
					"degraded",
					result.detail,
					simulated,
				)
				return
			case "failure":
				await this.incidentsService.setServiceStatus(
					record.runIdentifier,
					record.serviceIdentifier,
					"down",
					result.detail,
					simulated,
				)
				await this.incidentsService.releaseCapacity({
					resourceIdentifier: record.resourceIdentifier,
					runIdentifier: record.runIdentifier,
					serviceIdentifier: record.serviceIdentifier,
					units: record.capacityUnits,
				})
				return
		}
	}

	private async getEntity(identifier: string): Promise<RecoveryActionEntity> {
		const entity = await this.repository.findOne({ where: { identifier } })
		if (!entity) {
			throw new EntityNotFoundException(
				RECOVERY_ACTION_ENTITY_NAME,
				identifier,
			)
		}
		return entity
	}
}

export function toRecoveryActionRecord(
	entity: RecoveryActionEntity,
): RecoveryActionRecord {
	return {
		actionDescription: entity.actionDescription,
		actionKind: entity.actionKind,
		approvalIdentifier: entity.approvalIdentifier,
		capacityUnits: entity.capacityUnits,
		finishedAt: entity.finishedAt,
		identifier: entity.identifier,
		incidentIdentifier: entity.incidentIdentifier,
		mode: entity.mode,
		planStepIdentifier: entity.planStepIdentifier,
		providerReference: entity.providerReference,
		resourceIdentifier: entity.resourceIdentifier,
		result: entity.result,
		runIdentifier: entity.runIdentifier,
		serviceIdentifier: entity.serviceIdentifier,
		startedAt: entity.startedAt,
		status: entity.status,
		toolCallIdentifier: entity.toolCallIdentifier,
	}
}
