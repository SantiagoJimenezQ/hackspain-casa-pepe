import { createHash } from "node:crypto"
import { sendIncidentEmail } from "@casa-pepe/tools"
import {
	DomainException,
	EntityNotFoundException,
} from "@common/exceptions/domain.exception"
import { addMilliseconds, nowISO } from "@common/helpers/clock.helper"
import { createPrefixedIdentifier } from "@common/helpers/identifier.helper"
import { ConfigurationService } from "@common/services/configuration.service"
import { ElevenLabsEngineerCallAdapter } from "@engineers/adapters/elevenlabs-engineer-call.adapter"
import { ENGINEER_CALL_ADAPTER } from "@engineers/constants/engineer.constant"
import {
	EngineerCallAdapter,
	EngineerCallRecord,
	EngineerCallResult,
	EngineerContact,
	EngineerQuestion,
} from "@engineers/types/engineer.type"
import { HttpStatus, Inject, Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { ToolTestEntity } from "@tools/testing/tool-test.entity"
import { In, Repository } from "typeorm"
import type {
	ToolTestCatalogEntry,
	ToolTestEngineer,
	ToolTestError,
	ToolTestExecuteInput,
	ToolTestMode,
	ToolTestName,
	ToolTestResult,
	ToolTestStatus,
} from "../../../../../packages/contracts/tool-tests"

const SYNTHETIC_EMAIL_SUBJECT = "[Casa Pepe test] Synthetic integration check"
const SYNTHETIC_EMAIL_TEXT =
	"This is a synthetic standalone email test. It is not linked to an incident."
const SYNTHETIC_CALL_PURPOSE =
	"Synthetic standalone Casa Pepe engineer-call integration test"
const SYNTHETIC_CALL_QUESTION: EngineerQuestion = {
	key: "backup_capacity",
	question:
		"For this synthetic test, can you confirm that the engineer call reached you?",
}
const SYNTHETIC_CALL_SUMMARY = "Synthetic engineer call completed"
const SYNTHETIC_CALL_ANSWER =
	"The synthetic integration test call reached the engineer successfully."

type ToolTestCallOutcome = "completed" | "failed" | "no-answer"

export interface ToolTestCallCallback {
	readonly callIdentifier: string
	readonly outcome: ToolTestCallOutcome
	readonly summary?: string
	readonly transcript?: string
	readonly answers?: ReadonlyArray<{
		readonly key: string
		readonly answer: string
		readonly confirmed?: boolean
	}>
}

type NormalizedInput = {
	readonly tool: ToolTestName
	readonly mode: ToolTestMode
	readonly idempotencyKey: string
	readonly engineer?: ToolTestEngineer
}

type EntityPatch = Partial<ToolTestEntity>

@Injectable()
export class ToolTestsService {
	constructor(
		@InjectRepository(ToolTestEntity)
		private readonly repository: Repository<ToolTestEntity>,
		private readonly configuration: ConfigurationService,
		@Inject(ENGINEER_CALL_ADAPTER)
		private readonly callAdapter: EngineerCallAdapter,
		private readonly elevenLabs: ElevenLabsEngineerCallAdapter,
	) {}

	catalog(): ReadonlyArray<ToolTestCatalogEntry> {
		return [
			{
				description: "Send a synthetic incident email",
				liveAvailable: this.emailLiveAvailable(),
				modes: ["simulated", "live"],
				provider: null,
				tool: "send_incident_email",
			},
			{
				description: "Call a synthetic on-call engineer",
				liveAvailable: this.callLiveAvailable(),
				modes: ["simulated", "live"],
				provider: this.configuration.engineerCall.provider,
				tool: "call_engineer",
			},
		]
	}

	async execute(input: ToolTestExecuteInput): Promise<ToolTestResult> {
		const normalized = this.normalizeInput(input)
		const requestFingerprint = this.fingerprint(normalized)
		const existing = await this.repository.findOne({
			where: { idempotencyKey: normalized.idempotencyKey },
		})
		if (existing) {
			this.assertMatchingRequest(existing, requestFingerprint)
			return this.get(existing.identifier)
		}

		this.assertAvailable(normalized)
		const createdAt = nowISO()
		const entity = this.repository.create({
			createdAt,
			detail: "",
			engineer: this.persistedEngineer(normalized),
			error: null,
			finishedAt: "",
			idempotencyKey: normalized.idempotencyKey,
			identifier: createPrefixedIdentifier("tool-test"),
			mode: normalized.mode,
			provider:
				normalized.tool === "call_engineer" &&
				normalized.mode === "live"
					? this.configuration.engineerCall.provider
					: null,
			providerCallSid: "",
			providerReference: "",
			requestFingerprint,
			result: null,
			status: "running",
			timeoutAt: this.timeoutAt(normalized, createdAt),
			tool: normalized.tool,
		})
		const reserved = await this.reserve(entity)

		if (reserved.identifier !== entity.identifier) {
			return this.get(reserved.identifier)
		}

		if (normalized.tool === "send_incident_email") {
			return this.executeEmail(entity)
		}
		return this.executeCall(entity)
	}

	async get(identifier: string): Promise<ToolTestResult> {
		const entity = await this.getEntity(identifier)
		let current = await this.expireIfNeeded(entity)
		if (
			current.status === "accepted" &&
			current.provider === "elevenlabs" &&
			current.providerReference
		) {
			const result = await this.elevenLabs.getResult(
				this.adapterCallRecord(current),
			)
			// A slow provider lookup must not turn an expired test into success.
			current = await this.expireIfNeeded(
				await this.getEntity(identifier),
			)
			if (result && !isTerminal(current.status)) {
				return this.completeResult(current, result)
			}
		}
		return toToolTestResult(current)
	}

	/**
	 * Completes only standalone live call records. This method intentionally
	 * emits no domain event and never consults incident or plan state.
	 */
	async completeCall(body: ToolTestCallCallback): Promise<ToolTestResult> {
		let entity = await this.getEntity(body.callIdentifier)
		if (
			entity.tool !== "call_engineer" ||
			entity.mode !== "live" ||
			(entity.provider && entity.provider !== "happyrobot")
		) {
			throw new DomainException(
				HttpStatus.CONFLICT,
				"Invalid Tool Test Callback",
				"The callback does not belong to a live HappyRobot engineer-call test",
			)
		}

		entity = await this.expireIfNeeded(entity)
		if (isTerminal(entity.status)) {
			return toToolTestResult(entity)
		}

		const outcome = normalizeOutcome(body.outcome)
		const answers = (body.answers ?? []).map((answer) => ({
			answer: answer.answer,
			confirmed: answer.confirmed,
			key: answer.key,
			question:
				answer.key === SYNTHETIC_CALL_QUESTION.key
					? SYNTHETIC_CALL_QUESTION.question
					: answer.key,
		}))
		const result: EngineerCallResult = {
			answers,
			outcome,
			summary: body.summary ?? "",
			transcript: body.transcript ?? "",
		}
		return this.completeResult(entity, result)
	}

	private async completeResult(
		entity: ToolTestEntity,
		result: EngineerCallResult,
	): Promise<ToolTestResult> {
		const outcome = result.outcome
		const patch: EntityPatch = {
			detail:
				outcome === "completed"
					? `Engineer call completed by ${entity.provider ?? "happyrobot"}`
					: `Engineer call ended with ${outcome}`,
			error:
				outcome === "completed"
					? null
					: {
							code:
								outcome === "no-answer"
									? "NO_ANSWER"
									: "CALL_FAILED",
							message:
								outcome === "no-answer"
									? "The engineer call received no answer"
									: "The engineer call failed at the provider",
						},
			finishedAt: nowISO(),
			result: result as unknown as Record<string, unknown>,
			status: outcome === "completed" ? "succeeded" : "failed",
		}
		const updated = await this.updateIfStatus(
			entity.identifier,
			["running", "accepted"],
			patch,
		)
		return toToolTestResult(updated)
	}

	private async executeEmail(
		entity: ToolTestEntity,
	): Promise<ToolTestResult> {
		try {
			const receipt = await sendIncidentEmail(
				{
					...this.configuration.email,
					mode: entity.mode,
					timeoutMilliseconds:
						this.configuration.agent.toolTimeoutMilliseconds,
				},
				{
					subject: SYNTHETIC_EMAIL_SUBJECT,
					text: SYNTHETIC_EMAIL_TEXT,
				},
				`tool-test:${entity.identifier}`,
			)
			const live = entity.mode === "live"
			const updated = await this.updateIfStatus(
				entity.identifier,
				["running"],
				{
					detail: live
						? "Email accepted by provider; inbox delivery is not confirmed"
						: "Email simulated; nothing was sent",
					error: null,
					finishedAt: nowISO(),
					providerReference: receipt.reference,
					result: {
						channel: "email",
						detail: live
							? "Email accepted by provider; inbox delivery is not confirmed"
							: "Email simulated; nothing was sent",
						kind: "communication",
						mode: entity.mode,
						reference: receipt.reference,
					},
					status: live ? "accepted" : "succeeded",
				},
			)
			return toToolTestResult(updated)
		} catch {
			return toToolTestResult(
				await this.updateIfStatus(entity.identifier, ["running"], {
					detail: "Email request failed or timed out; check the provider before retrying",
					error: {
						code: "EMAIL_PROVIDER_ERROR",
						message:
							"Email request failed; delivery outcome may be unknown",
					},
					finishedAt: nowISO(),
					status: "failed",
				}),
			)
		}
	}

	private async executeCall(entity: ToolTestEntity): Promise<ToolTestResult> {
		if (entity.mode === "simulated") {
			const result = this.syntheticCallResult()
			return toToolTestResult(
				await this.updateIfStatus(entity.identifier, ["running"], {
					detail: "Engineer call simulated; no call was placed",
					error: null,
					finishedAt: nowISO(),
					providerReference: `simulated:${entity.identifier}`,
					result: result as unknown as Record<string, unknown>,
					status: "succeeded",
				}),
			)
		}

		try {
			const call = this.adapterCallRecord(entity)
			const outcome = await this.callAdapter.start(
				{
					call,
					callbackURL: this.callbackURL(),
					incidentContext: call.incidentContext,
					simulatedScript: {
						answersByKey: {
							[SYNTHETIC_CALL_QUESTION.key]:
								SYNTHETIC_CALL_ANSWER,
						},
						summary: SYNTHETIC_CALL_SUMMARY,
					},
				},
				async (callIdentifier, result) => {
					await this.completeCall({
						answers: result.answers,
						callIdentifier,
						outcome: result.outcome,
						summary: result.summary,
						transcript: result.transcript,
					})
				},
			)
			if (outcome.kind === "failed") {
				return toToolTestResult(
					await this.updateIfStatus(entity.identifier, ["running"], {
						detail: "Engineer call request failed or timed out; check the provider before retrying",
						error: {
							code: "CALL_PROVIDER_ERROR",
							message:
								"Engineer call request failed; call outcome may be unknown",
						},
						finishedAt: nowISO(),
						status: "failed",
					}),
				)
			}

			const current = await this.getEntity(entity.identifier)
			if (current.status !== "running") {
				return toToolTestResult(current)
			}
			return toToolTestResult(
				await this.updateIfStatus(entity.identifier, ["running"], {
					detail:
						entity.provider === "elevenlabs"
							? "Engineer call accepted by ElevenLabs; poll this test for the conversation result"
							: "Engineer call accepted by HappyRobot; waiting for callback",
					providerCallSid: outcome.providerCallSid ?? "",
					providerReference: outcome.providerReference,
					status: "accepted",
				}),
			)
		} catch {
			return toToolTestResult(
				await this.updateIfStatus(entity.identifier, ["running"], {
					detail: "Engineer call request failed or timed out; check the provider before retrying",
					error: {
						code: "CALL_PROVIDER_ERROR",
						message:
							"Engineer call request failed; call outcome may be unknown",
					},
					finishedAt: nowISO(),
					status: "failed",
				}),
			)
		}
	}

	private normalizeInput(input: ToolTestExecuteInput): NormalizedInput {
		const tool = input?.tool
		if (tool !== "send_incident_email" && tool !== "call_engineer") {
			throw new DomainException(
				HttpStatus.BAD_REQUEST,
				"Unsupported Tool Test",
				"The requested tool test is not supported",
			)
		}
		const mode = input.mode ?? "simulated"
		if (mode !== "simulated" && mode !== "live") {
			throw new DomainException(
				HttpStatus.BAD_REQUEST,
				"Unsupported Tool Test Mode",
				"The requested tool-test mode is not supported",
			)
		}
		const idempotencyKey = input.idempotencyKey?.trim()
		if (
			!idempotencyKey ||
			idempotencyKey.length > 200 ||
			/[\r\n]/u.test(idempotencyKey)
		) {
			throw new DomainException(
				HttpStatus.BAD_REQUEST,
				"Invalid Idempotency Key",
				"idempotencyKey must be a non-empty safe string",
			)
		}
		const engineer = input.engineer
			? {
					name: input.engineer.name.trim(),
					phone: input.engineer.phone.trim(),
				}
			: undefined
		if (
			engineer &&
			(!engineer.name || !/^\+[1-9]\d{7,14}$/u.test(engineer.phone))
		) {
			throw new DomainException(
				HttpStatus.BAD_REQUEST,
				"Invalid Engineer",
				"Engineer name and phone must be valid; phone must use E.164 format",
			)
		}
		return { engineer, idempotencyKey, mode, tool }
	}

	private fingerprint(input: NormalizedInput): string {
		return createHash("sha256")
			.update(
				JSON.stringify({
					engineer:
						input.tool === "call_engineer"
							? (input.engineer ?? null)
							: null,
					mode: input.mode,
					tool: input.tool,
				}),
			)
			.digest("hex")
	}

	private assertAvailable(input: NormalizedInput): void {
		if (input.mode === "simulated") {
			return
		}
		if (
			input.tool === "send_incident_email" &&
			!this.emailLiveAvailable()
		) {
			throw new DomainException(
				HttpStatus.CONFLICT,
				"Integration Unavailable",
				"Live email tests require live email mode and configured sender, recipient, and provider credentials",
			)
		}
		if (input.tool === "call_engineer") {
			if (!input.engineer) {
				throw new DomainException(
					HttpStatus.BAD_REQUEST,
					"Engineer Required",
					"Live engineer-call tests require an explicit engineer",
				)
			}
			if (!this.callLiveAvailable()) {
				throw new DomainException(
					HttpStatus.CONFLICT,
					"Integration Unavailable",
					"Live engineer-call tests require ENGINEER_CALL_MODE=live and complete configuration for the selected provider",
				)
			}
		}
	}

	private emailLiveAvailable(): boolean {
		const { apiKey, from, mode, to } = this.configuration.email
		return mode === "live" && Boolean(apiKey && from && to)
	}

	private callLiveAvailable(): boolean {
		if (this.configuration.engineerCall.mode !== "live") return false
		if (this.configuration.engineerCall.provider === "elevenlabs") {
			const { apiKey, agentId, phoneNumberId } =
				this.configuration.elevenLabs
			return [apiKey, agentId, phoneNumberId].every((value) =>
				Boolean(value?.trim()),
			)
		}
		const { triggerURL, apiKey, webhookSecret } =
			this.configuration.happyRobot
		return Boolean(
			triggerURL &&
				apiKey &&
				webhookSecret &&
				this.configuration.runtime.publicBaseURL,
		)
	}

	private persistedEngineer(
		input: NormalizedInput,
	): ToolTestEntity["engineer"] {
		if (input.tool !== "call_engineer") {
			return null
		}
		const selected = input.engineer ?? {
			name: this.configuration.demo.engineerName,
			phone: this.configuration.demo.engineerPhone,
		}
		return {
			name: selected.name,
			phone: selected.phone,
			role: this.configuration.demo.engineerRole,
		}
	}

	private timeoutAt(
		input: NormalizedInput,
		createdAt: string,
	): string | null {
		if (input.mode !== "live") {
			return null
		}
		const milliseconds =
			input.tool === "call_engineer"
				? this.configuration.agent.callTimeoutMilliseconds
				: this.configuration.agent.toolTimeoutMilliseconds
		return addMilliseconds(createdAt, milliseconds)
	}

	private async reserve(entity: ToolTestEntity): Promise<ToolTestEntity> {
		try {
			await this.repository.insert(entity)
			return entity
		} catch (error) {
			const existing = await this.repository.findOne({
				where: { idempotencyKey: entity.idempotencyKey },
			})
			if (existing) {
				this.assertMatchingRequest(existing, entity.requestFingerprint)
				return existing
			}
			throw error
		}
	}

	private assertMatchingRequest(
		entity: ToolTestEntity,
		requestFingerprint: string,
	): void {
		if (entity.requestFingerprint === requestFingerprint) {
			return
		}
		throw new DomainException(
			HttpStatus.CONFLICT,
			"Idempotency Conflict",
			"The idempotency key was already used for a different tool-test request",
		)
	}

	private async expireIfNeeded(
		entity: ToolTestEntity,
	): Promise<ToolTestEntity> {
		if (
			!entity.timeoutAt ||
			!isBeforeOrEqual(entity.timeoutAt, nowISO()) ||
			(entity.status !== "running" &&
				!(
					entity.status === "accepted" &&
					entity.tool === "call_engineer"
				))
		) {
			return entity
		}
		return this.updateIfStatus(
			entity.identifier,
			entity.status === "running" ? ["running"] : ["accepted"],
			{
				detail:
					entity.tool === "call_engineer"
						? "Engineer call did not complete before the timeout"
						: "Tool test did not complete before the timeout",
				error: {
					code: "TIMEOUT",
					message:
						"The standalone tool test did not complete before the timeout",
				},
				finishedAt: nowISO(),
				status: "failed",
			},
		)
	}

	private async updateIfStatus(
		identifier: string,
		statuses: ReadonlyArray<ToolTestStatus>,
		changes: EntityPatch,
	): Promise<ToolTestEntity> {
		await this.repository.update(
			{
				identifier,
				status: In(statuses),
			},
			changes,
		)
		return this.getEntity(identifier)
	}

	private async getEntity(identifier: string): Promise<ToolTestEntity> {
		const entity = await this.repository.findOne({ where: { identifier } })
		if (!entity) {
			throw new EntityNotFoundException("Tool test", identifier)
		}
		return entity
	}

	private callbackURL(): string {
		return `${this.configuration.runtime.publicBaseURL.replace(/\/+$/u, "")}/api/tools/tests/callbacks/happyrobot`
	}

	private adapterCallRecord(entity: ToolTestEntity): EngineerCallRecord {
		const engineer = entity.engineer
		if (!engineer) {
			throw new Error("Tool-test engineer is missing")
		}
		const contact: EngineerContact = {
			name: engineer.name,
			phone: engineer.phone,
			role: engineer.role,
		}
		return {
			engineer: contact,
			failureReason: "",
			finishedAt: "",
			identifier: entity.identifier,
			incidentContext: {
				incidentDescription:
					"This is a standalone integration test. No real incident or recovery action is in progress.",
				location: "Casa Pepe synthetic test environment",
				servicesDown: ["synthetic test service"],
			},
			incidentIdentifier: "tool-test-incident",
			mode: "live",
			planStepIdentifier: "tool-test-call",
			provider: entity.provider ?? undefined,
			providerCallSid: entity.providerCallSid,
			providerReference: entity.providerReference,
			purpose: SYNTHETIC_CALL_PURPOSE,
			questions: [SYNTHETIC_CALL_QUESTION],
			result: null,
			runIdentifier: "tool-test-run",
			startedAt: entity.createdAt,
			status: "dialing",
			toolCallIdentifier: entity.identifier,
		}
	}

	private syntheticCallResult(): EngineerCallResult {
		const answers = [
			{
				answer: SYNTHETIC_CALL_ANSWER,
				confirmed: true,
				key: SYNTHETIC_CALL_QUESTION.key,
				question: SYNTHETIC_CALL_QUESTION.question,
			},
		]
		return {
			answers,
			outcome: "completed",
			summary: SYNTHETIC_CALL_SUMMARY,
			transcript: `Agent: ${SYNTHETIC_CALL_QUESTION.question}\nEngineer: ${SYNTHETIC_CALL_ANSWER}`,
		}
	}
}

function isTerminal(status: ToolTestStatus): boolean {
	return status === "succeeded" || status === "failed"
}

function isBeforeOrEqual(leftISO: string, rightISO: string): boolean {
	return new Date(leftISO).getTime() <= new Date(rightISO).getTime()
}

function normalizeOutcome(
	outcome: ToolTestCallOutcome,
): EngineerCallResult["outcome"] {
	if (
		outcome === "completed" ||
		outcome === "failed" ||
		outcome === "no-answer"
	) {
		return outcome
	}
	return "failed"
}

function toToolTestResult(entity: ToolTestEntity): ToolTestResult {
	return {
		createdAt: entity.createdAt,
		detail: entity.detail,
		error: entity.error as ToolTestError | null,
		finishedAt: entity.finishedAt,
		identifier: entity.identifier,
		mode: entity.mode,
		provider: entity.provider,
		providerCallSid: entity.providerCallSid,
		providerReference: entity.providerReference,
		result: entity.result,
		status: entity.status,
		tool: entity.tool,
	}
}
