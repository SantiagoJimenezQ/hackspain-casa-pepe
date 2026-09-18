import { ActivityService } from "@activity/services/activity.service"
import { DOMAIN_EVENTS } from "@common/constants/domain-events.constant"
import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import { EntityNotFoundException } from "@common/exceptions/domain.exception"
import { elapsedMilliseconds, nowISO } from "@common/helpers/clock.helper"
import { toRecord } from "@common/helpers/collection.helper"
import { describeError } from "@common/helpers/external-response.helper"
import { createPrefixedIdentifier } from "@common/helpers/identifier.helper"
import { ConfigurationService } from "@common/services/configuration.service"
import { EngineerCallFinishedEvent } from "@engineers/types/engineer.type"
import { Injectable, Logger } from "@nestjs/common"
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter"
import { InjectRepository } from "@nestjs/typeorm"
import { RecoveryActionFinishedEvent } from "@recovery/types/recovery.type"
import { TOOL_CALL_ENTITY_NAME } from "@tools/constants/tool.constant"
import { ToolCallEntity } from "@tools/entities/tool-call.entity"
import { ToolRegistryService } from "@tools/services/tool-registry.service"
import {
	ExecuteToolOutcome,
	ExecuteToolRequest,
	ToolCallFinishedEvent,
	ToolCallRecord,
	ToolError,
	ToolExecutionResult,
	ToolOutput,
} from "@tools/types/tool.type"
import { Repository } from "typeorm"

const TIMEOUT_ERROR: ToolError = {
	code: "TIMEOUT",
	message: "The tool did not answer before the timeout",
	retryable: true,
}

@Injectable()
export class ToolsService {
	private readonly logger = new Logger(ToolsService.name)

	constructor(
		@InjectRepository(ToolCallEntity)
		private readonly repository: Repository<ToolCallEntity>,
		private readonly registry: ToolRegistryService,
		private readonly activityService: ActivityService,
		private readonly configuration: ConfigurationService,
		private readonly eventEmitter: EventEmitter2,
	) {}

	async execute(request: ExecuteToolRequest): Promise<ExecuteToolOutcome> {
		const existing = await this.repository.findOne({
			where: {
				idempotencyKey: request.idempotencyKey,
				runIdentifier: request.runIdentifier,
			},
		})
		if (existing) {
			this.logger.warn(LOG_MESSAGES.TOOLS.CALL_DUPLICATE_SKIPPED, {
				idempotencyKey: request.idempotencyKey,
				toolCallIdentifier: existing.identifier,
			})
			return { kind: "duplicate", toolCall: toToolCallRecord(existing) }
		}
		const timestamp = nowISO()
		const entity = this.repository.create({
			attempt: request.attempt,
			createdAt: timestamp,
			decisionIdentifier: request.decisionIdentifier,
			error: null,
			externalReference: "",
			finishedAt: "",
			idempotencyKey: request.idempotencyKey,
			identifier: createPrefixedIdentifier("tool"),
			incidentIdentifier: request.incidentIdentifier,
			input: toRecord(request.invocation.input),
			interaction: this.registry.interactionOf(request.invocation.name),
			name: request.invocation.name,
			output: null,
			planIdentifier: request.planIdentifier,
			planStepIdentifier: request.planStepIdentifier,
			planVersion: request.planVersion,
			runIdentifier: request.runIdentifier,
			simulated: this.registry.isSimulated(request.invocation.name),
			startedAt: timestamp,
			status: "running",
			updatedAt: timestamp,
		})
		const saved = await this.repository.save(entity)
		this.logger.log(LOG_MESSAGES.TOOLS.CALL_STARTED, {
			name: saved.name,
			toolCallIdentifier: saved.identifier,
		})
		await this.recordActivity(
			saved,
			"tool-call.started",
			`${saved.name} started (attempt ${saved.attempt})`,
		)

		const result = await this.runWithTimeout(saved, request)
		switch (result.status) {
			case "succeeded":
				return {
					kind: "completed",
					toolCall: await this.finish(saved, result.output, null),
				}
			case "failed":
				return {
					kind: "completed",
					toolCall: await this.finish(saved, null, result.error),
				}
			case "in-progress":
				saved.externalReference = result.externalReference
				saved.updatedAt = nowISO()
				return {
					kind: "in-progress",
					toolCall: toToolCallRecord(
						await this.repository.save(saved),
					),
				}
		}
	}

	async complete(
		toolCallIdentifier: string,
		output: ToolOutput | null,
		error: ToolError | null,
	): Promise<ToolCallRecord> {
		const entity = await this.getEntity(toolCallIdentifier)
		if (entity.status !== "running") {
			return toToolCallRecord(entity)
		}
		return this.finish(entity, output, error, true)
	}

	async cancelRunning(
		runIdentifier: string,
		reason: string,
	): Promise<number> {
		const running = await this.repository.find({
			where: { runIdentifier, status: "running" },
		})
		for (const entity of running) {
			entity.status = "cancelled"
			entity.error = {
				code: "CANCELLED",
				message: reason,
				retryable: false,
			}
			entity.finishedAt = nowISO()
			entity.updatedAt = entity.finishedAt
			await this.repository.save(entity)
		}
		return running.length
	}

	async expireRunningCalls(
		runIdentifier: string,
	): Promise<ReadonlyArray<ToolCallRecord>> {
		const now = nowISO()
		const running = await this.repository.find({
			where: { runIdentifier, status: "running" },
		})
		const expired: ToolCallRecord[] = []
		for (const entity of running) {
			if (
				elapsedMilliseconds(entity.startedAt, now) >
				this.configuration.agent.toolTimeoutMilliseconds
			) {
				this.logger.warn(LOG_MESSAGES.TOOLS.CALL_TIMED_OUT, {
					name: entity.name,
					toolCallIdentifier: entity.identifier,
				})
				expired.push(
					await this.finish(entity, null, TIMEOUT_ERROR, true),
				)
			}
		}
		return expired
	}

	async getByIdentifier(identifier: string): Promise<ToolCallRecord> {
		return toToolCallRecord(await this.getEntity(identifier))
	}

	async list(runIdentifier: string): Promise<ReadonlyArray<ToolCallRecord>> {
		const entities = await this.repository.find({
			order: { createdAt: "ASC" },
			where: { runIdentifier },
		})
		return entities.map(toToolCallRecord)
	}

	@OnEvent(DOMAIN_EVENTS.ENGINEER_CALL_FINISHED, {
		async: true,
		promisify: true,
	})
	async onEngineerCallFinished(
		event: EngineerCallFinishedEvent,
	): Promise<void> {
		const { call } = event
		if (call.result && call.status === "completed") {
			await this.complete(
				call.toolCallIdentifier,
				{
					answers: call.result.answers,
					engineerCallIdentifier: call.identifier,
					kind: "engineer-call",
					mode: call.mode,
					summary: call.result.summary,
				},
				null,
			)
			return
		}
		const message = call.result ? call.result.summary : call.failureReason
		await this.complete(call.toolCallIdentifier, null, {
			code: "CALL_FAILED",
			message,
			retryable: true,
		})
	}

	@OnEvent(DOMAIN_EVENTS.RECOVERY_ACTION_FINISHED, {
		async: true,
		promisify: true,
	})
	async onRecoveryActionFinished(
		event: RecoveryActionFinishedEvent,
	): Promise<void> {
		const { action } = event
		if (!action.result) {
			await this.complete(action.toolCallIdentifier, null, {
				code: "EXECUTION_FAILED",
				message: "No result received",
				retryable: true,
			})
			return
		}
		await this.complete(
			action.toolCallIdentifier,
			{
				detail: action.result.detail,
				kind: "recovery-execution",
				mode: action.mode,
				outcome: action.result.outcome,
				recoveryActionIdentifier: action.identifier,
			},
			null,
		)
	}

	private async runWithTimeout(
		entity: ToolCallEntity,
		request: ExecuteToolRequest,
	): Promise<ToolExecutionResult> {
		const tool = this.registry.resolve(request.invocation.name)
		const context = {
			decisionIdentifier: request.decisionIdentifier,
			incidentIdentifier: request.incidentIdentifier,
			planIdentifier: request.planIdentifier,
			planStepIdentifier: request.planStepIdentifier,
			planVersion: request.planVersion,
			runIdentifier: request.runIdentifier,
			toolCallIdentifier: entity.identifier,
		}
		let timer: NodeJS.Timeout | undefined
		const timeout = new Promise<ToolExecutionResult>((resolve) => {
			timer = setTimeout(
				() => resolve({ error: TIMEOUT_ERROR, status: "failed" }),
				this.configuration.agent.toolTimeoutMilliseconds,
			)
		})
		try {
			return await Promise.race([
				tool.execute(request.invocation.input, context),
				timeout,
			])
		} catch (error) {
			return {
				error: {
					code: "UNEXPECTED_ERROR",
					message: describeError(error),
					retryable: true,
				},
				status: "failed",
			}
		} finally {
			clearTimeout(timer)
		}
	}

	private async finish(
		entity: ToolCallEntity,
		output: ToolOutput | null,
		error: ToolError | null,
		emitEvent: boolean = true,
	): Promise<ToolCallRecord> {
		entity.status = error ? "failed" : "succeeded"
		entity.output = output
		entity.error = error
		entity.finishedAt = nowISO()
		entity.updatedAt = entity.finishedAt
		const saved = await this.repository.save(entity)
		if (error) {
			this.logger.warn(LOG_MESSAGES.TOOLS.CALL_FAILED, {
				code: error.code,
				name: saved.name,
				toolCallIdentifier: saved.identifier,
			})
			await this.recordActivity(
				saved,
				"tool-call.failed",
				`${saved.name} failed: ${error.message}`,
			)
		} else {
			this.logger.log(LOG_MESSAGES.TOOLS.CALL_COMPLETED, {
				name: saved.name,
				toolCallIdentifier: saved.identifier,
			})
			await this.recordActivity(
				saved,
				"tool-call.completed",
				`${saved.name} completed in ${elapsedMilliseconds(saved.startedAt, saved.finishedAt)} ms`,
			)
		}
		const record = toToolCallRecord(saved)
		if (emitEvent) {
			const event: ToolCallFinishedEvent = { toolCall: record }
			this.eventEmitter.emit(DOMAIN_EVENTS.TOOL_CALL_FINISHED, event)
		}
		return record
	}

	private async recordActivity(
		entity: ToolCallEntity,
		type: "tool-call.started" | "tool-call.completed" | "tool-call.failed",
		summary: string,
	): Promise<void> {
		await this.activityService.record({
			correlation: {
				decisionIdentifier: entity.decisionIdentifier,
				planIdentifier: entity.planIdentifier,
				planStepIdentifier: entity.planStepIdentifier,
				planVersion: entity.planVersion,
				toolCallIdentifier: entity.identifier,
			},
			incidentIdentifier: entity.incidentIdentifier,
			payload: { toolCall: toToolCallRecord(entity) },
			runIdentifier: entity.runIdentifier,
			simulated: entity.simulated,
			source: "tool",
			summary,
			title: `Tool ${entity.name}`,
			type,
		})
	}

	private async getEntity(identifier: string): Promise<ToolCallEntity> {
		const entity = await this.repository.findOne({ where: { identifier } })
		if (!entity) {
			throw new EntityNotFoundException(TOOL_CALL_ENTITY_NAME, identifier)
		}
		return entity
	}
}

export function toToolCallRecord(entity: ToolCallEntity): ToolCallRecord {
	return {
		attempt: entity.attempt,
		createdAt: entity.createdAt,
		decisionIdentifier: entity.decisionIdentifier,
		error: entity.error,
		externalReference: entity.externalReference,
		finishedAt: entity.finishedAt,
		idempotencyKey: entity.idempotencyKey,
		identifier: entity.identifier,
		incidentIdentifier: entity.incidentIdentifier,
		input: entity.input,
		interaction: entity.interaction,
		name: entity.name,
		output: entity.output,
		planIdentifier: entity.planIdentifier,
		planStepIdentifier: entity.planStepIdentifier,
		planVersion: entity.planVersion,
		runIdentifier: entity.runIdentifier,
		simulated: entity.simulated,
		startedAt: entity.startedAt,
		status: entity.status,
		updatedAt: entity.updatedAt,
	}
}
