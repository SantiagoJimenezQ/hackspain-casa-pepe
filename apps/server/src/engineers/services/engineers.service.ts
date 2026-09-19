import { ActivityService } from "@activity/services/activity.service"
import { DOMAIN_EVENTS } from "@common/constants/domain-events.constant"
import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import { insertEntity, updateEntity } from "@common/database/persistence.helper"
import {
	EntityNotFoundException,
	InvalidStateTransitionException,
	StaleRunException,
} from "@common/exceptions/domain.exception"
import { elapsedMilliseconds, nowISO } from "@common/helpers/clock.helper"
import { createPrefixedIdentifier } from "@common/helpers/identifier.helper"
import { ConfigurationService } from "@common/services/configuration.service"
import {
	ENGINEER_CALL_ADAPTER,
	ENGINEER_CALL_ENTITY_NAME,
	HAPPYROBOT_CALLBACK_PATH,
} from "@engineers/constants/engineer.constant"
import { EngineerCallEntity } from "@engineers/entities/engineer-call.entity"
import {
	AdapterCallOutcome,
	EngineerCallAdapter,
	EngineerCallFinishedEvent,
	EngineerCallRecord,
	EngineerCallResult,
	EngineerCallStatus,
	StartEngineerCallCommand,
} from "@engineers/types/engineer.type"
import { RunsService } from "@incidents/services/runs.service"
import { Inject, Injectable, Logger } from "@nestjs/common"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { Interval } from "@nestjs/schedule"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"

@Injectable()
export class EngineersService {
	private readonly logger = new Logger(EngineersService.name)
	private polling = false
	private lastPollAt = 0

	constructor(
		@InjectRepository(EngineerCallEntity)
		private readonly repository: Repository<EngineerCallEntity>,
		@Inject(ENGINEER_CALL_ADAPTER)
		private readonly adapter: EngineerCallAdapter,
		private readonly activityService: ActivityService,
		private readonly runsService: RunsService,
		private readonly configuration: ConfigurationService,
		private readonly eventEmitter: EventEmitter2,
	) {}

	get mode() {
		return this.adapter.mode
	}

	get provider() {
		return this.adapter.provider ?? this.configuration.engineerCall.provider
	}

	async startCall(
		command: StartEngineerCallCommand,
	): Promise<EngineerCallRecord> {
		const timestamp = nowISO()
		const entity = this.repository.create({
			engineer: command.engineer,
			failureReason: "",
			finishedAt: "",
			identifier: createPrefixedIdentifier("call"),
			incidentContext: command.incidentContext,
			incidentIdentifier: command.incidentIdentifier,
			mode: this.adapter.mode,
			planStepIdentifier: command.planStepIdentifier,
			provider: this.provider,
			providerCallSid: null,
			providerReference: "",
			purpose: command.purpose,
			questions: [...command.questions],
			result: null,
			runIdentifier: command.runIdentifier,
			startedAt: timestamp,
			status: "dialing",
			toolCallIdentifier: command.toolCallIdentifier,
		})
		const saved = await insertEntity(this.repository, entity)
		const record = toEngineerCallRecord(saved)
		this.logger.log(LOG_MESSAGES.ENGINEERS.CALL_STARTED, {
			callIdentifier: record.identifier,
			mode: record.mode,
		})
		await this.activityService.record({
			correlation: {
				engineerCallIdentifier: record.identifier,
				planStepIdentifier: record.planStepIdentifier,
				toolCallIdentifier: record.toolCallIdentifier,
			},
			incidentIdentifier: record.incidentIdentifier,
			payload: { call: record },
			runIdentifier: record.runIdentifier,
			simulated: record.mode === "simulated",
			source: "tool",
			summary: `Calling ${record.engineer.name} (${record.engineer.role}) through ${record.provider ?? "the configured provider"} in ${record.mode} mode: ${record.purpose}`,
			title: "Engineer call started",
			type: "engineer-call.started",
		})
		let outcome: AdapterCallOutcome
		try {
			outcome = await this.adapter.start(
				{
					call: record,
					callbackURL: `${this.configuration.runtime.publicBaseURL}/${HAPPYROBOT_CALLBACK_PATH}`,
					incidentContext: record.incidentContext,
					simulatedScript: command.simulatedScript,
				},
				(callIdentifier, result) =>
					this.completeCall(callIdentifier, result),
			)
		} catch {
			return this.failCall(
				saved,
				"Call provider failed before the outcome was known; inspect the provider before retrying",
			)
		}
		switch (outcome.kind) {
			case "accepted":
				saved.status = "in-progress"
				saved.provider = outcome.provider ?? saved.provider
				saved.providerReference = outcome.providerReference
				saved.providerCallSid = outcome.providerCallSid ?? null
				return toEngineerCallRecord(
					await updateEntity(this.repository, saved),
				)
			case "failed":
				return this.failCall(saved, outcome.reason)
		}
	}

	/** Poll accepted ElevenLabs calls from persisted state after restarts. */
	@Interval(1000)
	async pollPendingCalls(): Promise<void> {
		const interval = this.configuration.elevenLabs.pollIntervalMilliseconds
		const now = Date.now()
		if (now - this.lastPollAt < interval) return
		this.lastPollAt = now
		await this.pollPendingCallsNow()
	}

	async pollPendingCallsNow(): Promise<void> {
		if (this.polling || !this.adapter.getResult) return
		this.polling = true
		try {
			const entities = await this.repository.find({
				where: {
					mode: "live",
					provider: "elevenlabs",
					status: "in-progress",
				},
			})
			for (const entity of entities) await this.pollPendingCall(entity)
		} finally {
			this.polling = false
		}
	}

	private async pollPendingCall(entity: EngineerCallEntity): Promise<void> {
		if (!this.adapter.getResult) return
		if (!(await this.runsService.isRunActive(entity.runIdentifier))) return
		if (
			elapsedMilliseconds(entity.startedAt, nowISO()) >=
			this.configuration.agent.callTimeoutMilliseconds
		) {
			await this.timeoutCall(
				entity,
				`Timed out waiting for ${entity.provider ?? "the call provider"} result`,
			)
			return
		}
		let result: EngineerCallResult | null
		try {
			result = await this.adapter.getResult(toEngineerCallRecord(entity))
		} catch {
			this.logger.warn(LOG_MESSAGES.ENGINEERS.CALL_RESULT_IGNORED, {
				callIdentifier: entity.identifier,
				reason: "Polling failed; the provider result was not applied",
			})
			return
		}
		if (!result) return
		try {
			await this.completeCall(entity.identifier, result)
		} catch {
			this.logger.warn(LOG_MESSAGES.ENGINEERS.CALL_RESULT_IGNORED, {
				callIdentifier: entity.identifier,
				reason: "Result was rejected because the run or call state changed",
			})
		}
	}

	async completeCall(
		callIdentifier: string,
		result: EngineerCallResult,
	): Promise<void> {
		const entity = await this.getEntity(callIdentifier)
		const runActive = await this.runsService.isRunActive(
			entity.runIdentifier,
		)
		if (!runActive) {
			this.logger.warn(LOG_MESSAGES.ENGINEERS.CALL_RESULT_IGNORED, {
				callIdentifier,
				runIdentifier: entity.runIdentifier,
			})
			throw new StaleRunException(entity.runIdentifier)
		}
		if (
			entity.status === "completed" ||
			entity.status === "failed" ||
			entity.status === "no-answer"
		) {
			throw new InvalidStateTransitionException(
				ENGINEER_CALL_ENTITY_NAME,
				entity.status,
				"receive another result",
			)
		}
		entity.status = toStatus(result.outcome)
		entity.result = result
		entity.finishedAt = nowISO()
		const record = toEngineerCallRecord(
			await updateEntity(this.repository, entity),
		)
		this.logger.log(LOG_MESSAGES.ENGINEERS.CALL_FINISHED, {
			callIdentifier: record.identifier,
			outcome: result.outcome,
		})
		await this.activityService.record({
			correlation: {
				engineerCallIdentifier: record.identifier,
				planStepIdentifier: record.planStepIdentifier,
				toolCallIdentifier: record.toolCallIdentifier,
			},
			incidentIdentifier: record.incidentIdentifier,
			payload: { call: record },
			runIdentifier: record.runIdentifier,
			simulated: record.mode === "simulated",
			source: "integration",
			summary:
				result.outcome === "completed"
					? result.summary
					: `Call ${result.outcome}: ${result.summary}`,
			title:
				result.outcome === "completed"
					? "Engineer call completed"
					: "Engineer call failed",
			type:
				result.outcome === "completed"
					? "engineer-call.completed"
					: "engineer-call.failed",
		})
		const event: EngineerCallFinishedEvent = { call: record }
		this.eventEmitter.emit(DOMAIN_EVENTS.ENGINEER_CALL_FINISHED, event)
	}

	async getByIdentifier(identifier: string): Promise<EngineerCallRecord> {
		return toEngineerCallRecord(await this.getEntity(identifier))
	}

	async list(
		runIdentifier: string,
	): Promise<ReadonlyArray<EngineerCallRecord>> {
		const entities = await this.repository.find({
			order: { startedAt: "ASC" },
			where: { runIdentifier },
		})
		return entities.map(toEngineerCallRecord)
	}

	private async failCall(
		entity: EngineerCallEntity,
		reason: string,
	): Promise<EngineerCallRecord> {
		entity.status = "failed"
		entity.failureReason = reason
		entity.finishedAt = nowISO()
		const record = toEngineerCallRecord(
			await updateEntity(this.repository, entity),
		)
		await this.activityService.record({
			correlation: {
				engineerCallIdentifier: record.identifier,
				planStepIdentifier: record.planStepIdentifier,
				toolCallIdentifier: record.toolCallIdentifier,
			},
			incidentIdentifier: record.incidentIdentifier,
			payload: { call: record },
			runIdentifier: record.runIdentifier,
			simulated: record.mode === "simulated",
			source: "integration",
			summary: `Could not start the call to ${record.engineer.name}: ${reason}`,
			title: "Engineer call failed",
			type: "engineer-call.failed",
		})
		const event: EngineerCallFinishedEvent = { call: record }
		this.eventEmitter.emit(DOMAIN_EVENTS.ENGINEER_CALL_FINISHED, event)
		return record
	}

	private async timeoutCall(
		entity: EngineerCallEntity,
		reason: string,
	): Promise<EngineerCallRecord> {
		if (
			entity.status === "completed" ||
			entity.status === "failed" ||
			entity.status === "no-answer"
		) {
			return toEngineerCallRecord(entity)
		}
		entity.status = "no-answer"
		entity.failureReason = reason
		entity.finishedAt = nowISO()
		const record = toEngineerCallRecord(
			await updateEntity(this.repository, entity),
		)
		await this.activityService.record({
			correlation: {
				engineerCallIdentifier: record.identifier,
				planStepIdentifier: record.planStepIdentifier,
				toolCallIdentifier: record.toolCallIdentifier,
			},
			incidentIdentifier: record.incidentIdentifier,
			payload: { call: record },
			runIdentifier: record.runIdentifier,
			simulated: false,
			source: "integration",
			summary: `Call timed out: ${reason}`,
			title: "Engineer call timed out",
			type: "engineer-call.failed",
		})
		this.eventEmitter.emit(DOMAIN_EVENTS.ENGINEER_CALL_FINISHED, {
			call: record,
		} satisfies EngineerCallFinishedEvent)
		return record
	}

	private async getEntity(identifier: string): Promise<EngineerCallEntity> {
		const entity = await this.repository.findOne({ where: { identifier } })
		if (!entity) {
			throw new EntityNotFoundException(
				ENGINEER_CALL_ENTITY_NAME,
				identifier,
			)
		}
		return entity
	}
}

function toStatus(outcome: EngineerCallResult["outcome"]): EngineerCallStatus {
	switch (outcome) {
		case "completed":
			return "completed"
		case "failed":
			return "failed"
		case "no-answer":
			return "no-answer"
	}
}

export function toEngineerCallRecord(
	entity: EngineerCallEntity,
): EngineerCallRecord {
	return {
		engineer: entity.engineer,
		failureReason: entity.failureReason,
		finishedAt: entity.finishedAt,
		identifier: entity.identifier,
		incidentContext: entity.incidentContext ?? {
			incidentDescription: "",
			location: "",
			servicesDown: [],
		},
		incidentIdentifier: entity.incidentIdentifier,
		mode: entity.mode,
		planStepIdentifier: entity.planStepIdentifier,
		provider: entity.provider ?? undefined,
		providerCallSid: entity.providerCallSid ?? undefined,
		providerReference: entity.providerReference,
		purpose: entity.purpose,
		questions: entity.questions,
		result: entity.result,
		runIdentifier: entity.runIdentifier,
		startedAt: entity.startedAt,
		status: entity.status,
		toolCallIdentifier: entity.toolCallIdentifier,
	}
}
