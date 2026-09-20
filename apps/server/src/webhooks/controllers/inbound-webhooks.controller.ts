import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import { InvalidStateTransitionException } from "@common/exceptions/domain.exception"
import { HappyRobotCallResultDTO } from "@engineers/dtos/happyrobot-call-result.dto"
import { IncomingCallDTO } from "@engineers/dtos/incoming-call.dto"
import { LiveAuthorizationDTO } from "@engineers/dtos/live-authorization.dto"
import { EngineersService } from "@engineers/services/engineers.service"
import { IncomingCallsService } from "@engineers/services/incoming-calls.service"
import {
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	Logger,
	Optional,
	Post,
	RawBodyRequest,
	Req,
} from "@nestjs/common"
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger"
import { RecoveryCallbackDTO } from "@recovery/dtos/recovery-callback.dto"
import { RecoveryService } from "@recovery/services/recovery.service"
import {
	HappyRobotInbound,
	RecoveryInbound,
	ResendInbound,
} from "@webhooks/guards/inbound-secret.guard"
import {
	InboundEmailsService,
	ResendEmailReceivedEvent,
} from "@webhooks/services/inbound-emails.service"
import { Request } from "express"

@ApiTags("Inbound webhooks")
@Controller("webhooks")
export class InboundWebhooksController {
	private readonly logger = new Logger(InboundWebhooksController.name)

	constructor(
		private readonly incomingCalls: IncomingCallsService,
		private readonly engineersService: EngineersService,
		private readonly recoveryService: RecoveryService,
		@Optional() private readonly inboundEmails?: InboundEmailsService,
	) {}

	@Post("resend/incoming")
	@HttpCode(HttpStatus.ACCEPTED)
	@ResendInbound()
	@ApiOperation({ summary: "Receive Resend email.received events" })
	async resendIncoming(@Body() body: ResendEmailReceivedEvent) {
		return this.inboundEmails?.receive(body)
	}

	@Post("happyrobot/incoming")
	@HttpCode(HttpStatus.ACCEPTED)
	@HappyRobotInbound()
	async incoming(
		@Body() body: IncomingCallDTO,
		@Req() request: RawBodyRequest<Request>,
	) {
		// Preserve provider fields that DTO validation may strip from `body`.
		const fullBody =
			request.rawBody?.toString("utf8") ?? JSON.stringify(request.body)
		this.logger.log(
			`${LOG_MESSAGES.WEBHOOKS.INBOUND_RECEIVED} POST /api/webhooks/happyrobot/incoming body=${fullBody}`,
		)
		return this.incomingCalls.receive(body, "live")
	}
	@Post("elevenlabs/authorization")
	@HttpCode(HttpStatus.ACCEPTED)
	@HappyRobotInbound()
	@ApiHeader({
		description: "Shared secret configured in HAPPYROBOT_WEBHOOK_SECRET",
		name: "x-happyrobot-signature",
	})
	@ApiOperation({
		summary:
			"Permissions granted during an ElevenLabs call, reported before it ends",
	})
	async elevenLabsAuthorization(@Body() body: LiveAuthorizationDTO) {
		this.logger.log(LOG_MESSAGES.WEBHOOKS.INBOUND_RECEIVED, {
			callIdentifier: body.callIdentifier,
			provider: "ElevenLabs",
		})
		const call = await this.engineersService.recordLiveAuthorizations(body)
		return {
			accepted: true as const,
			authorizations: call.result?.authorizations,
			callIdentifier: call.identifier,
		}
	}

	@Post("happyrobot")
	@HttpCode(HttpStatus.ACCEPTED)
	@HappyRobotInbound()
	@ApiHeader({
		description: "Shared secret configured in HAPPYROBOT_WEBHOOK_SECRET",
		name: "x-happyrobot-signature",
	})
	@ApiOperation({
		summary:
			"Result of an engineer call sent by HappyRobot when the call ends",
	})
	async happyRobot(
		@Body() body: HappyRobotCallResultDTO,
	): Promise<{ readonly accepted: true }> {
		this.logger.log(LOG_MESSAGES.WEBHOOKS.INBOUND_RECEIVED, {
			callIdentifier: body.callIdentifier,
			provider: "HappyRobot",
		})
		const call = await this.engineersService.getByIdentifier(
			body.callIdentifier,
		)
		if (call.provider === "elevenlabs") {
			throw new InvalidStateTransitionException(
				"Engineer call",
				"ElevenLabs",
				"receive a HappyRobot result",
			)
		}
		if (body.phase === "authorization") {
			await this.engineersService.recordAuthorizations(
				body.callIdentifier,
				body.authorizations,
			)
			return { accepted: true }
		}
		const questionsByKey = new Map(
			call.questions.map((question) => [question.key, question.question]),
		)
		await this.engineersService.completeCall(body.callIdentifier, {
			answers: body.answers.map((answer) => {
				const question = questionsByKey.get(answer.key)
				return {
					answer: answer.answer,
					confirmed: answer.confirmed,
					key: answer.key,
					question: question ? question : answer.key,
				}
			}),
			authorizations: body.authorizations,
			outcome: body.outcome,
			summary: body.summary,
			transcript: body.transcript,
		})
		return { accepted: true }
	}

	@Post("recovery")
	@HttpCode(HttpStatus.ACCEPTED)
	@RecoveryInbound()
	@ApiHeader({
		description: "Shared secret configured in RECOVERY_WEBHOOK_SECRET",
		name: "x-recovery-signature",
	})
	@ApiOperation({
		summary:
			"Result of a recovery action sent by the test environment when it finishes",
	})
	async recovery(
		@Body() body: RecoveryCallbackDTO,
	): Promise<{ readonly accepted: true }> {
		this.logger.log(LOG_MESSAGES.WEBHOOKS.INBOUND_RECEIVED, {
			actionIdentifier: body.actionIdentifier,
			provider: "Recovery environment",
		})
		const outcome =
			body.status === "succeeded"
				? "success"
				: body.status === "partial"
					? "partial"
					: "failure"
		await this.recoveryService.complete(body.actionIdentifier, {
			detail: body.detail,
			outcome,
		})
		return { accepted: true }
	}
}
